import http from "node:http";
import { pathToFileURL } from "node:url";
import { appendExternalCallLog } from "./external-call-log.js";

const port = Number(process.env.LMH_MCP_PORT || 4318);
const apiBase = process.env.LMH_API_BASE || "http://127.0.0.1:4317";
const dataDir = process.env.LMH_DATA_DIR || null;

const tools = [
  {
    name: "memory.search",
    description: "搜索本地记忆和源资料",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "memory.get_context",
    description: "获取可供外部 AI 使用的本地上下文",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "memory.ask",
    description: "基于本地记忆生成回答",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        provider_id: { type: "string" }
      },
      required: ["question"]
    }
  },
  {
    name: "graph.search",
    description: "搜索本地图谱节点",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  }
];

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true, service: "local-memory-hub-mcp" });
    }

    if (req.method !== "POST" || req.url !== "/rpc") {
      return json(res, 404, { error: "not_found" });
    }

    const body = await readJson(req);
    const result = await handleRpc(body);
    return json(res, 200, {
      jsonrpc: "2.0",
      id: body.id ?? null,
      result
    });
  } catch (error) {
    return json(res, 200, {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message: error.message
      }
    });
  }
});

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  server.listen(port, "127.0.0.1", () => {
    console.log(`Local Memory Hub MCP-like server listening on http://127.0.0.1:${port}`);
  });
}

export async function handleRpc(body) {
  if (body.method === "tools/list") {
    return { tools };
  }
  if (body.method === "tools/call") {
    return callTool(body.params?.name, body.params?.arguments || {});
  }
  throw new Error(`Unsupported method: ${body.method}`);
}

async function callTool(name, args) {
  const startedAt = Date.now();
  try {
    const result = await callToolInner(name, args);
    await appendExternalCallLog({
      timestamp: new Date().toISOString(),
      tool: name,
      status: "success",
      duration_ms: Date.now() - startedAt,
      query_chars: String(args.query || "").length
    }, dataDir);
    return result;
  } catch (error) {
    await appendExternalCallLog({
      timestamp: new Date().toISOString(),
      tool: name,
      status: "failed",
      duration_ms: Date.now() - startedAt,
      query_chars: String(args.query || "").length,
      error: error.message
    }, dataDir);
    throw error;
  }
}

async function callToolInner(name, args) {
  if (name === "memory.search") {
    const data = await apiGet(`/api/search?q=${encodeURIComponent(args.query || "")}`);
    return {
      content: [{ type: "text", text: JSON.stringify(filterSafeResults(data.results), null, 2) }]
    };
  }
  if (name === "memory.get_context") {
    const data = await apiGet(`/api/search?q=${encodeURIComponent(args.query || "")}`);
    const context = filterSafeResults(data.results).slice(0, 5).map((item) => ({
      source_id: item.source_id,
      title: item.title,
      snippet: item.segment_text || item.extracted_preview || item.title,
      status: {
        parse_status: item.parse_status,
        memory_status: item.memory_status,
        pollution_status: item.pollution_status
      }
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(context, null, 2) }]
    };
  }
  if (name === "memory.ask") {
    const data = await apiPost("/api/ask", {
      question: args.question || "",
      provider_id: args.provider_id || "mock",
      persist_memory: false
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
  }
  if (name === "graph.search") {
    const data = await apiGet(`/api/graph/search?q=${encodeURIComponent(args.query || "")}`);
    return {
      content: [{ type: "text", text: JSON.stringify(filterSafeResults(data.nodes), null, 2) }]
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function apiGet(path) {
  const res = await fetch(`${apiBase}${path}`);
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
}

function filterSafeResults(items = []) {
  return items.filter((item) =>
    !["quarantined", "deleted"].includes(item.pollution_status) &&
    !["deleted", "source_deleted"].includes(item.import_status) &&
    item.trace_status !== "source_deleted"
  );
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
