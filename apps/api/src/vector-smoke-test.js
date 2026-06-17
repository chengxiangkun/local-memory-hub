const baseUrl = `http://127.0.0.1:${process.env.LMH_PORT || 4317}`;

async function main() {
  const imported = await post("/api/import", {
    entrypoint: "onboarding",
    source_hint: "text",
    payload: {
      title: "向量索引测试",
      text: "图谱搜索和语义搜索需要向量索引。Local Memory Hub 会把文本片段写入向量索引。"
    }
  });
  await post("/api/parse", { source_id: imported.source.source_id });

  const results = await get("/api/vector/search?q=语义搜索");
  assert(results.results.length >= 1, "vector search should return results");

  await post("/api/sources/quarantine", { source_id: imported.source.source_id });
  const afterQuarantine = await get("/api/vector/search?q=语义搜索");
  assert(
    !afterQuarantine.results.some((item) => item.source_id === imported.source.source_id),
    "quarantined source should be excluded from vector search"
  );

  console.log("Vector smoke test passed");
  console.log(JSON.stringify({ before: results.results.length, after: afterQuarantine.results.length }, null, 2));
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
