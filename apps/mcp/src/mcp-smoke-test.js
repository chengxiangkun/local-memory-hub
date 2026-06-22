import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.LMH_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "lmh-mcp-"));
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => fakeApiResponse(String(url))
});

const { handleRpc } = await import("./server.js");

try {
  await main();
  console.log("MCP-like smoke test passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  const list = await handleRpc({ method: "tools/list" });
  assert(list.tools.some((tool) => tool.name === "memory.search"), "tools should include memory.search");
  assert(list.tools.some((tool) => tool.name === "memory.ask"), "tools should include memory.ask");

  const search = await call("memory.search", { query: "模型" });
  assert(search.content?.[0]?.text.includes("模型测试"), "memory.search should return content");
  assert(!search.content?.[0]?.text.includes("污染资料"), "memory.search should filter quarantined content");

  const context = await call("memory.get_context", { query: "模型" });
  assert(context.content?.[0]?.text.includes("source-1"), "memory.get_context should return content");

  const graph = await call("graph.search", { query: "模型" });
  assert(graph.content?.[0]?.text.includes("graph-1"), "graph.search should return graph nodes");

  const answer = await call("memory.ask", { question: "模型怎么配置？" });
  assert(answer.content?.[0]?.text.includes("本地回答"), "memory.ask should return answer");

  console.log(JSON.stringify({ tools: list.tools.length }, null, 2));
}

function call(name, args) {
  return handleRpc({
    method: "tools/call",
    params: { name, arguments: args }
  });
}

function fakeApiResponse(url) {
  if (url.includes("/api/graph/search")) {
    return {
      nodes: [
        { node_id: "graph-1", label: "模型节点", node_type: "topic", pollution_status: "clean" },
        { node_id: "graph-2", label: "污染节点", node_type: "topic", pollution_status: "quarantined" }
      ]
    };
  }
  if (url.includes("/api/ask")) {
    return {
      model: "mock-memory-chat",
      answer: "本地回答",
      citations: []
    };
  }
  return {
    results: [
      {
        source_id: "source-1",
        title: "模型测试",
        segment_text: "外部 AI 可以读取本地上下文。",
        parse_status: "parse_success",
        memory_status: "memory_indexed",
        pollution_status: "clean"
      },
      {
        source_id: "source-2",
        title: "污染资料",
        segment_text: "不应返回",
        pollution_status: "quarantined"
      }
    ]
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
