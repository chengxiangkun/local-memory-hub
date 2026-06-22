import { access } from "node:fs/promises";
import path from "node:path";

/**
 * 本地 Transformers.js(@huggingface/transformers)运行时。
 *
 * 依赖按需懒加载:未安装或加载失败时抛错,由上层回落到 local_weak。
 * embedTexts 路径只读取已下载到本地缓存目录的模型,绝不在嵌入时联网下载;
 * 下载只通过显式的 downloadModel 触发。
 */

let _transformersPromise = null;
const _pipelineCache = new Map(); // key: `${cacheDir}::${modelRef}` -> Promise<pipeline>

async function loadTransformers() {
  if (!_transformersPromise) {
    _transformersPromise = import("@huggingface/transformers");
  }
  return _transformersPromise;
}

function pipelineKey(modelRef, cacheDir) {
  return `${cacheDir}::${modelRef}`;
}

async function getExtractor(modelRef, cacheDir, { allowRemote }) {
  const key = pipelineKey(modelRef, cacheDir);
  if (!allowRemote && _pipelineCache.has(key)) return _pipelineCache.get(key);

  const promise = (async () => {
    const { pipeline, env } = await loadTransformers();
    if (cacheDir) env.cacheDir = cacheDir;
    env.allowLocalModels = true;
    env.allowRemoteModels = Boolean(allowRemote);
    return pipeline("feature-extraction", modelRef);
  })();

  if (!allowRemote) _pipelineCache.set(key, promise);
  try {
    return await promise;
  } catch (error) {
    if (!allowRemote) _pipelineCache.delete(key);
    throw error;
  }
}

/**
 * 用本地模型嵌入若干已加好前缀的文本,返回归一化向量数组。
 * 仅使用本地缓存模型(allowRemote=false),未下载则抛错。
 */
export async function embedWithTransformers(texts, { modelRef, cacheDir }) {
  const extractor = await getExtractor(modelRef, cacheDir, { allowRemote: false });
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

/**
 * 判断模型是否已下载到本地缓存目录。
 * Transformers.js 缓存结构为 {cacheDir}/{modelRef}/onnx/model*.onnx。
 */
export async function isModelDownloaded(modelRef, cacheDir) {
  if (!cacheDir || !modelRef) return false;
  const onnxDir = path.join(cacheDir, modelRef, "onnx");
  for (const file of ["model.onnx", "model_quantized.onnx", "model_fp16.onnx"]) {
    try {
      await access(path.join(onnxDir, file));
      return true;
    } catch {
      // 试下一个候选文件名
    }
  }
  return false;
}

/**
 * 显式下载模型到本地缓存目录(允许联网)。完成后清理懒加载缓存,
 * 以便后续只读路径用新下载的模型。返回探测到的实际维度。
 */
export async function downloadModel(modelRef, cacheDir) {
  const extractor = await getExtractor(modelRef, cacheDir, { allowRemote: true });
  // 跑一次极短嵌入以确保权重完整可用,并探测维度。
  const probe = await extractor(["query: 下载校验"], { pooling: "mean", normalize: true });
  const dimension = probe.dims?.[probe.dims.length - 1] || probe.tolist()[0]?.length || 0;
  _pipelineCache.delete(pipelineKey(modelRef, cacheDir));
  return { downloaded: true, dimension };
}
