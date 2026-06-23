import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, initDataDir } from "./data-store.js";
import { getCatalogEntry } from "./embedding-catalog.js";
import { encryptSecret, decryptSecret } from "./secret-store.js";

/**
 * Embedding 选择与配置的本地持久化。
 *
 * 结构:
 * {
 *   active_id: string,            // 当前激活的目录条目 id;未设置则走旧策略/兜底
 *   model_path: string,           // 本地 Transformers.js 模型缓存目录
 *   overrides: {                  // 按目录条目 id 的可选覆盖
 *     [id]: {
 *       model_ref?: string,       // 自定义模型名称/HF id(可配置名称)
 *       base_url?: string,        // 云端
 *       api_key?: string,         // 云端
 *       model?: string            // 云端模型名
 *     }
 *   }
 * }
 */

export function embeddingConfigPath(dataDir = getDataDir()) {
  return path.join(dataDir, "config", "embedding.local.json");
}

export function defaultModelPath(dataDir = getDataDir()) {
  return path.join(dataDir, "embedding-models");
}

export async function getEmbeddingConfig(dataDir = getDataDir()) {
  await initDataDir(dataDir);
  try {
    const content = await readFile(embeddingConfigPath(dataDir), "utf8");
    const data = JSON.parse(content);
    return {
      active_id: typeof data.active_id === "string" ? data.active_id : "",
      model_path: data.model_path || defaultModelPath(dataDir),
      overrides: data.overrides && typeof data.overrides === "object" ? data.overrides : {}
    };
  } catch {
    return { active_id: "", model_path: defaultModelPath(dataDir), overrides: {} };
  }
}

export async function saveEmbeddingConfig(patch, dataDir = getDataDir()) {
  const current = await getEmbeddingConfig(dataDir);
  const next = {
    active_id: patch.active_id !== undefined ? String(patch.active_id || "") : current.active_id,
    model_path: patch.model_path ? String(patch.model_path) : current.model_path,
    overrides: current.overrides
  };
  if (patch.override && patch.override.id) {
    const id = patch.override.id;
    const prev = current.overrides[id] || {};
    const merged = { ...prev };
    for (const key of ["model_ref", "base_url", "model"]) {
      if (patch.override[key] !== undefined) merged[key] = String(patch.override[key] || "");
    }
    // api_key:留空表示不修改,显式给值才覆盖;加密后落盘。
    if (patch.override.api_key) merged.api_key = await encryptSecret(String(patch.override.api_key), dataDir);
    next.overrides = { ...current.overrides, [id]: merged };
  }
  const file = embeddingConfigPath(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(next, null, 2));
  return next;
}

/**
 * 解析当前生效的 embedding 选择(目录条目 + 用户覆盖合并)。
 * 未配置激活项时返回 null,交由调用方回落到旧策略/兜底。
 */
export async function resolveActiveEmbedding(dataDir = getDataDir()) {
  const config = await getEmbeddingConfig(dataDir);
  if (!config.active_id) return null;
  const entry = getCatalogEntry(config.active_id);
  if (!entry) return null;
  const override = config.overrides[config.active_id] || {};
  return {
    id: entry.id,
    runtime: entry.runtime,
    model_ref: override.model_ref || entry.model_ref,
    dimension: entry.dimension,
    query_prefix: entry.query_prefix || "",
    passage_prefix: entry.passage_prefix || "",
    model_path: config.model_path,
    // 云端字段(api_key 落盘为密文,这里解密供调用)
    base_url: override.base_url || entry.default_base_url || "",
    api_key: await decryptSecret(override.api_key || "", dataDir),
    model: override.model || entry.model_ref || ""
  };
}
