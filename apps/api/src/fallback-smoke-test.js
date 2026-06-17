import { writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = `http://127.0.0.1:${process.env.LMH_PORT || 4317}`;

async function main() {
  const unsupportedFile = path.resolve("/tmp/lmh-unsupported.bin");
  await writeFile(unsupportedFile, Buffer.from([0, 1, 2, 3, 4]));

  const imported = await post("/api/import", {
    entrypoint: "file_upload",
    source_hint: "file",
    payload: {
      title: "不支持类型兜底测试",
      file_path: unsupportedFile
    }
  });

  const result = await post("/api/parse", {
    source_id: imported.source.source_id,
    llm_fallback: true
  });

  assert(result.status === "llm_fallback_success", "parse should use llm fallback");
  assert(result.improvement_saved, "fallback should save parser improvement");

  const graph = await get("/api/graph");
  assert(graph.nodes.length >= 2, "fallback parse should create graph nodes");

  console.log("Fallback smoke test passed");
  console.log(JSON.stringify({ status: result.status, graph_nodes: graph.nodes.length }, null, 2));
}

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
