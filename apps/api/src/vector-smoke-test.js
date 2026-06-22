import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleImport } from "./import-pipeline.js";
import { initModelProviders } from "./model-provider.js";
import { parseSource } from "./parser-service.js";
import { initSqlite, quarantineSourceCascade } from "./sqlite-store.js";
import { vectorSearch } from "./vector-service.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-vector-"));

try {
  await main();
  console.log("Vector smoke test passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  initModelProviders();
  await initSqlite(dataDir);

  const imported = await importText("向量索引测试", "图谱搜索和语义搜索需要向量索引。Local Memory Hub 会把文本片段写入向量索引。");
  await parseSource(imported.source.source_id, {}, dataDir);

  const results = await vectorSearch("语义搜索", dataDir);
  assert(results.length >= 1, "vector search should return results");
  assert(results[0].lexical_score !== undefined, "vector search should include lexical score");
  assert(results[0].embedding_model === "local-weak-bigram-v1", "vector search should include embedding model metadata");
  assert(results[0].embedding_dimension === 32, "vector search should include embedding dimension metadata");

  const mixedImported = await importText("中英混合向量测试", "AI记忆图谱需要同时理解 graph memory、中文主题和英文缩写，避免 embedding 偏移。");
  await parseSource(mixedImported.source.source_id, {}, dataDir);
  const mixedResults = await vectorSearch("AI memory graph 记忆图谱", dataDir);
  assert(
    mixedResults.some((item) => item.source_id === mixedImported.source.source_id),
    "mixed Chinese-English vector search should recall imported source"
  );

  await quarantineSourceCascade(imported.source.source_id, dataDir);
  const afterQuarantine = await vectorSearch("语义搜索", dataDir);
  assert(
    !afterQuarantine.some((item) => item.source_id === imported.source.source_id),
    "quarantined source should be excluded from vector search"
  );

  console.log(JSON.stringify({ before: results.length, after: afterQuarantine.length }, null, 2));
}

function importText(title, text) {
  return handleImport(
    {
      entrypoint: "vector_smoke_test",
      source_hint: "text",
      payload: { title, text }
    },
    dataDir
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
