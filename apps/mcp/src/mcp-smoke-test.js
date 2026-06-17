const baseUrl = `http://127.0.0.1:${process.env.LMH_MCP_PORT || 4318}`;

async function main() {
  const list = await rpc("tools/list", {});
  assert(list.tools.some((tool) => tool.name === "memory.search"), "tools should include memory.search");

  const search = await rpc("tools/call", {
    name: "memory.search",
    arguments: { query: "模型" }
  });
  assert(search.content?.[0]?.text !== undefined, "memory.search should return content");

  const context = await rpc("tools/call", {
    name: "memory.get_context",
    arguments: { query: "模型" }
  });
  assert(context.content?.[0]?.text !== undefined, "memory.get_context should return content");

  console.log("MCP-like smoke test passed");
  console.log(JSON.stringify({ tools: list.tools.length }, null, 2));
}

async function rpc(method, params) {
  const res = await fetch(`${baseUrl}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
