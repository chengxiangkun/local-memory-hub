import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { initModelProviders } from "./model-provider.js";
import { parseSource } from "./parser-service.js";
import {
  getGraph,
  initSqlite,
  listMemorySegments,
  listSourcesSqlite,
  quarantineSourceCascade,
  searchAllSqlite
} from "./sqlite-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-api-"));

try {
  await main();
  console.log("Smoke test passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  const runId = Date.now();
  initModelProviders();
  await initDataDir(dataDir);
  await initSqlite(dataDir);

  const importedText = await handleImport(
    {
      entrypoint: "onboarding",
      source_hint: "text",
      payload: {
        title: `首次导入文本 ${runId}`,
        text: `这是 Local Memory Hub 的第一条记忆 ${runId}。它应该被保存为源资料记录。`
      }
    },
    dataDir
  );
  assert(importedText.source.source_type === "text", "text import should create text source");

  const importedUrl = await handleImport(
    {
      entrypoint: "url_paste",
      source_hint: "url",
      payload: { url: `https://www.bilibili.com/video/example-${runId}` }
    },
    dataDir
  );
  assert(importedUrl.source.source_platform === "bilibili", "url import should detect platform");

  const importedFile = await handleImport(
    {
      entrypoint: "file_upload",
      source_hint: "file",
      payload: { file_path: new URL("./smoke-test.js", import.meta.url).pathname }
    },
    dataDir
  );
  assert(importedFile.source.source_type === "file", "file import should create file source");

  const parsedText = await parseSource(importedText.source.source_id, {}, dataDir);
  assert(parsedText.status === "success", "text source should parse");
  assert(parsedText.segment_count >= 1, "text parse should create segments");
  assert(parsedText.graph_node_count >= 2, "text parse should create graph nodes");

  const parsedFile = await parseSource(importedFile.source.source_id, {}, dataDir);
  assert(parsedFile.status === "success", "plain file source should parse");

  const sources = await listSourcesSqlite(dataDir);
  assert(sources.length >= 3, "sources should include imported records");

  const search = await searchAllSqlite("首次", dataDir);
  assert(search.length >= 1, "search should find imported text source");

  const segments = await listMemorySegments(importedText.source.source_id, dataDir);
  assert(segments.length >= 1, "segments should return memory segments");

  const graph = await getGraph(dataDir);
  assert(graph.nodes.length >= 2, "graph should return nodes");
  assert(graph.edges.length >= 1, "graph should return edges");

  await quarantineSourceCascade(importedText.source.source_id, dataDir);
  const searchAfterQuarantine = await searchAllSqlite("首次", dataDir);
  assert(
    !searchAfterQuarantine.some((item) => item.source_id === importedText.source.source_id),
    "quarantined source should not appear in search"
  );

  console.log(
    JSON.stringify(
      {
        source_count: sources.length,
        search_count: search.length,
        segment_count: segments.length,
        graph_node_count: graph.nodes.length,
        search_after_quarantine_count: searchAfterQuarantine.length
      },
      null,
      2
    )
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
