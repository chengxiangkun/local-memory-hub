import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initDataDir } from "./data-store.js";
import { embedTexts } from "./embedding-service.js";
import { EMBEDDING_CATALOG, recommendedEntry, getCatalogEntry } from "./embedding-catalog.js";
import { getEmbeddingConfig, saveEmbeddingConfig, resolveActiveEmbedding } from "./embedding-config-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-embedding-pluggable-"));
process.env.LMH_DATA_DIR = dataDir;

try {
  await initDataDir(dataDir);

  // 目录:存在推荐项,且推荐项为本地 transformers。
  const rec = recommendedEntry();
  assert(rec && rec.recommended, "目录应有推荐项");
  assert(rec.runtime === "transformers", "推荐项应为本地 transformers");
  assert(getCatalogEntry("local_weak")?.runtime === "builtin", "应包含 builtin 兜底项");
  assert(EMBEDDING_CATALOG.some((e) => e.runtime === "openai"), "应包含云端选项");

  // 默认未配置 → active 为空 → 走旧行为。
  const emptyConfig = await getEmbeddingConfig(dataDir);
  assert(emptyConfig.active_id === "", "默认未配置激活项");
  assert(await resolveActiveEmbedding(dataDir) === null, "未配置时 resolveActiveEmbedding 返回 null");

  // 配置往返 + 覆盖名称。
  await saveEmbeddingConfig({ active_id: "local-e5-small" }, dataDir);
  await saveEmbeddingConfig({ override: { id: "cloud-openai-compatible", base_url: "https://x.local/v1", model: "my-embed", api_key: "k" } }, dataDir);
  const active = await resolveActiveEmbedding(dataDir);
  assert(active.id === "local-e5-small", "激活项应为 e5-small");
  assert(active.runtime === "transformers" && active.dimension === 384, "激活项应携带 runtime 与维度");
  assert(active.model_path.endsWith("embedding-models"), "应有默认模型路径");

  // 激活 transformers 但模型未下载(临时目录无缓存)→ embedTexts 回落到 local_weak。
  const result = await embedTexts(["本地记忆 graph"], dataDir);
  assert(result.provider_id === "local_weak", `未下载时应回落 local_weak,实际 ${result.provider_id}`);
  assert(result.embedding_dimension === 32, "回落向量应为 32 维");

  // 激活 builtin local_weak → 直接走内置兜底,且 input_type 不报错。
  await saveEmbeddingConfig({ active_id: "local_weak" }, dataDir);
  const weak = await embedTexts(["查询文本"], dataDir, { input_type: "query" });
  assert(weak.provider_id === "local_weak" && weak.embedding_dimension === 32, "激活 builtin 应走 local_weak");

  // 显式 provider_id 仍优先(向后兼容)。
  const explicit = await embedTexts(["x"], dataDir, { provider_id: "local_weak" });
  assert(explicit.provider_id === "local_weak", "显式 provider_id 应被尊重");

  console.log("Embedding pluggable test passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
