import http from "node:http";

const port = Number(process.env.LMH_MCP_PORT || 4318);
const apiBase = process.env.LMH_API_BASE || "http://127.0.0.1:4317";

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

server.listen(port, "127.0.0.1", () => {
  console.log(`Local Memory Hub MCP-like server listening on http://127.0.0.1:${port}`);
});

async function handleRpc(body) {
  if (body.method === "tools/list") {
    return { tools };
  }
  if (body.method === "tools/call") {
    return callTool(body.params?.name, body.params?.arguments || {});
  }
  throw new Error(`Unsupported method: ${body.method}`);
}

async function callTool(name, args) {
  if (name === "memory.search") {
    const data = await apiGet(`/api/search?q=${encodeURIComponent(args.query || "")}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data.results, null, 2) }]
    };
  }
  if (name === "memory.get_context") {
    const data = await apiGet(`/api/search?q=${encodeURIComponent(args.query || "")}`);
    const context = data.results.slice(0, 5).map((item) => ({
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
  if (name === "graph.search") {
    const data = await apiGet(`/api/graph/search?q=${encodeURIComponent(args.query || "")}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data.nodes, null, 2) }]
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function apiGet(path) {
  const res = await fetch(`${apiBase}${path}`);
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
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
