import http from "node:http";
import { pathToFileURL } from "node:url";
import { TOOLS, listEnabledTools, callTool } from "./tools.js";

/**
 * MCP-like HTTP /rpc 服务(向后兼容的 HTTP JSON-RPC 入口)。
 * 工具实现、权限门控与审计统一在 tools.js,正式 MCP stdio(mcp-stdio.js)共用。
 */

const port = Number(process.env.LMH_MCP_PORT || 4318);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true, service: "local-memory-hub-mcp", tools: TOOLS.length });
    }

    if (req.method !== "POST" || req.url !== "/rpc") {
      return json(res, 404, { error: "not_found" });
    }

    const body = await readJson(req);
    const result = await handleRpc(body);
    return json(res, 200, { jsonrpc: "2.0", id: body.id ?? null, result });
  } catch (error) {
    return json(res, 200, { jsonrpc: "2.0", id: null, error: { code: -32000, message: error.message } });
  }
});

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  server.listen(port, "127.0.0.1", () => {
    console.log(`Local Memory Hub MCP-like server listening on http://127.0.0.1:${port}`);
  });
}

export async function handleRpc(body) {
  if (body.method === "tools/list") {
    return { tools: await listEnabledTools() };
  }
  if (body.method === "tools/call") {
    return callTool(body.params?.name, body.params?.arguments || {});
  }
  throw new Error(`Unsupported method: ${body.method}`);
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
