import { writeFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleImport } from "./import-pipeline.js";
import { initModelProviders } from "./model-provider.js";
import { parseSource } from "./parser-service.js";
import { getGraph, initSqlite } from "./sqlite-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-fallback-"));

try {
  await main();
  console.log("Fallback smoke test passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  initModelProviders();
  await initSqlite(dataDir);

  const unsupportedFile = path.join(dataDir, "unsupported.bin");
  await writeFile(unsupportedFile, Buffer.from([0, 1, 2, 3, 4]));

  const imported = await handleImport(
    {
      entrypoint: "fallback_smoke_test",
      source_hint: "file",
      payload: {
        title: "不支持类型兜底测试",
        file_path: unsupportedFile
      }
    },
    dataDir
  );

  const result = await parseSource(imported.source.source_id, { llm_fallback: true }, dataDir);
  assert(result.status === "llm_fallback_success", "parse should use llm fallback");
  assert(result.improvement_saved, "fallback should save parser improvement");

  const graph = await getGraph(dataDir);
  assert(graph.nodes.length >= 2, "fallback parse should create graph nodes");
  console.log(JSON.stringify({ status: result.status, graph_nodes: graph.nodes.length }, null, 2));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
