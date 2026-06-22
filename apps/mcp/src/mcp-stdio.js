import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { pathToFileURL } from "node:url";
import { listEnabledTools, callTool } from "./tools.js";

/**
 * 正式 MCP 服务(stdio 传输,官方 @modelcontextprotocol/sdk)。
 *
 * 供 Claude Desktop / Cursor / Codex 等标准 MCP 客户端接入。工具实现、权限门控、
 * 安全过滤(排除隔离/删除)与审计日志统一复用 tools.js,与 HTTP /rpc 行为一致。
 *
 * 客户端配置示例(以 Claude Desktop 为例):
 *   {
 *     "mcpServers": {
 *       "local-memory-hub": {
 *         "command": "node",
 *         "args": ["<repo>/apps/mcp/src/mcp-stdio.js"],
 *         "env": { "LMH_DATA_DIR": "<数据目录>", "LMH_API_BASE": "http://127.0.0.1:4317" }
 *       }
 *     }
 *   }
 */

export function createMcpServer() {
  const server = new Server(
    { name: "local-memory-hub", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: await listEnabledTools()
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return callTool(request.params.name, request.params.arguments || {});
  });

  return server;
}

export async function startStdioServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  startStdioServer().catch((error) => {
    console.error("MCP stdio server failed", error);
    process.exit(1);
  });
}
