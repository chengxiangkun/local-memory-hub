const baseUrl = `http://127.0.0.1:${process.env.LMH_PORT || 4317}`;

async function main() {
  const health = await get("/health");
  assert(health.ok, "health should be ok");

  const importedText = await post("/api/import", {
    entrypoint: "onboarding",
    source_hint: "text",
    payload: {
      title: "首次导入文本",
      text: "这是 Local Memory Hub 的第一条记忆。它应该被保存为源资料记录。"
    }
  });
  assert(importedText.source.source_type === "text", "text import should create text source");

  const importedUrl = await post("/api/import", {
    entrypoint: "url_paste",
    source_hint: "url",
    payload: {
      url: "https://www.bilibili.com/video/example"
    }
  });
  assert(importedUrl.source.source_platform === "bilibili", "url import should detect platform");

  const importedFile = await post("/api/import", {
    entrypoint: "file_upload",
    source_hint: "file",
    payload: {
      file_path: new URL("./smoke-test.js", import.meta.url).pathname
    }
  });
  assert(importedFile.source.source_type === "file", "file import should create file source");

  const parsedText = await post("/api/parse", {
    source_id: importedText.source.source_id
  });
  assert(parsedText.status === "success", "text source should parse");
  assert(parsedText.segment_count >= 1, "text parse should create segments");
  assert(parsedText.graph_node_count >= 2, "text parse should create graph nodes");

  const parsedFile = await post("/api/parse", {
    source_id: importedFile.source.source_id
  });
  assert(parsedFile.status === "success", "plain file source should parse");

  const sources = await get("/api/sources");
  assert(sources.sources.length >= 3, "sources should include imported records");

  const search = await get("/api/search?q=首次");
  assert(search.results.length >= 1, "search should find imported text source");

  const segments = await get(`/api/segments?source_id=${importedText.source.source_id}`);
  assert(segments.segments.length >= 1, "segments endpoint should return memory segments");

  const graph = await get("/api/graph");
  assert(graph.nodes.length >= 2, "graph endpoint should return nodes");
  assert(graph.edges.length >= 1, "graph endpoint should return edges");

  await post("/api/sources/quarantine", {
    source_id: importedText.source.source_id
  });
  const searchAfterQuarantine = await get("/api/search?q=首次");
  assert(
    !searchAfterQuarantine.results.some((item) => item.source_id === importedText.source.source_id),
    "quarantined source should not appear in search"
  );

  console.log("Smoke test passed");
  console.log(
    JSON.stringify(
      {
        health,
        source_count: sources.sources.length,
        search_count: search.results.length,
        segment_count: segments.segments.length,
        graph_node_count: graph.nodes.length,
        search_after_quarantine_count: searchAfterQuarantine.results.length
      },
      null,
      2
    )
  );
}

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
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
