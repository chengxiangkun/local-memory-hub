import { readFile } from "node:fs/promises";
import path from "node:path";
import { appendExternalCallLog } from "./external-call-log.js";

/**
 * MCP 工具的共享实现。HTTP /rpc(server.js)与正式 MCP stdio(mcp-stdio.js)
 * 都复用这里:统一的工具定义、权限门控、安全过滤(排除隔离/删除内容)与审计日志。
 */

const apiBase = () => process.env.LMH_API_BASE || "http://127.0.0.1:4317";
const dataDir = () => process.env.LMH_DATA_DIR || null;

export const TOOLS = [
  {
    name: "memory.search",
    description: "搜索本地记忆和源资料",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
  },
  {
    name: "memory.get_context",
    description: "获取可供外部 AI 使用的本地上下文",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
  },
  {
    name: "memory.ask",
    description: "基于本地记忆生成回答",
    inputSchema: { type: "object", properties: { question: { type: "string" }, provider_id: { type: "string" } }, required: ["question"] }
  },
  {
    name: "graph.search",
    description: "搜索本地图谱节点",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
  },
  {
    name: "memory.import",
    description: "向本地记忆导入单条资料(写操作,默认禁用)。source_hint: text|url|file",
    inputSchema: {
      type: "object",
      properties: {
        source_hint: { type: "string" },
        title: { type: "string" },
        text: { type: "string" },
        url: { type: "string" },
        file_path: { type: "string" },
        auto_parse: { type: "boolean" }
      }
    }
  },
  {
    name: "memory.import_batch",
    description: "批量导入多条资料到本地记忆(写操作,默认禁用)。sources: 每项含 source_hint + text/url/file_path",
    inputSchema: {
      type: "object",
      properties: {
        sources: { type: "array", items: { type: "object" } },
        auto_parse: { type: "boolean" }
      },
      required: ["sources"]
    }
  },
  {
    name: "memory.parse",
    description: "触发解析某条已导入的源资料(写操作,默认禁用)。",
    inputSchema: { type: "object", properties: { source_id: { type: "string" } }, required: ["source_id"] }
  }
];

// 读取工具权限:{ [toolName]: boolean }。缺省全部启用。
export async function loadMcpPermissions() {
  const dir = dataDir();
  if (!dir) return {};
  try {
    const content = await readFile(path.join(dir, "config", "mcp-permissions.local.json"), "utf8");
    const data = JSON.parse(content);
    return data.tools && typeof data.tools === "object" ? data.tools : {};
  } catch {
    return {};
  }
}

// 写工具(能改本地数据)缺省关闭,仅显式 true 才启用;读工具缺省开启。
const WRITE_TOOLS = new Set(["memory.import", "memory.import_batch", "memory.parse"]);

export function isToolEnabled(permissions, name) {
  return WRITE_TOOLS.has(name) ? permissions[name] === true : permissions[name] !== false;
}

export async function listEnabledTools() {
  const permissions = await loadMcpPermissions();
  return TOOLS.filter((tool) => isToolEnabled(permissions, tool.name));
}

export async function callTool(name, args = {}) {
  const permissions = await loadMcpPermissions();
  if (!isToolEnabled(permissions, name)) {
    throw new Error(`工具已被本地权限设置禁用：${name}`);
  }
  const startedAt = Date.now();
  try {
    const result = await callToolInner(name, args);
    await appendExternalCallLog({
      timestamp: new Date().toISOString(),
      tool: name,
      status: "success",
      duration_ms: Date.now() - startedAt,
      query_chars: String(args.query || args.question || "").length
    }, dataDir());
    return result;
  } catch (error) {
    await appendExternalCallLog({
      timestamp: new Date().toISOString(),
      tool: name,
      status: "failed",
      duration_ms: Date.now() - startedAt,
      query_chars: String(args.query || args.question || "").length,
      error: error.message
    }, dataDir());
    throw error;
  }
}

async function callToolInner(name, args) {
  if (name === "memory.search") {
    const data = await apiGet(`/api/search?q=${encodeURIComponent(args.query || "")}`);
    return { content: [{ type: "text", text: JSON.stringify(filterSafeResults(data.results), null, 2) }] };
  }
  if (name === "memory.get_context") {
    const data = await apiGet(`/api/search?q=${encodeURIComponent(args.query || "")}`);
    const context = filterSafeResults(data.results).slice(0, 5).map((item) => ({
      source_id: item.source_id,
      title: item.title,
      snippet: item.segment_text || item.extracted_preview || item.title,
      status: { parse_status: item.parse_status, memory_status: item.memory_status, pollution_status: item.pollution_status }
    }));
    return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
  }
  if (name === "memory.ask") {
    const data = await apiPost("/api/ask", { question: args.question || "", provider_id: args.provider_id || "mock", persist_memory: false });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
  if (name === "graph.search") {
    const data = await apiGet(`/api/graph/search?q=${encodeURIComponent(args.query || "")}`);
    return { content: [{ type: "text", text: JSON.stringify(filterSafeResults(data.nodes), null, 2) }] };
  }
  if (name === "memory.import") {
    const data = await apiPost("/api/import", buildImportRequest(args));
    if (args.auto_parse && data.source?.source_id) {
      await apiPost("/api/parse", { source_id: data.source.source_id });
    }
    return { content: [{ type: "text", text: JSON.stringify({ status: data.status, source_id: data.source?.source_id, title: data.source?.title }, null, 2) }] };
  }
  if (name === "memory.import_batch") {
    const sources = (args.sources || []).map((item) => buildImportRequest(item));
    const data = await apiPost("/api/import/batch", { sources, auto_parse: Boolean(args.auto_parse) });
    return { content: [{ type: "text", text: JSON.stringify(data.summary || data, null, 2) }] };
  }
  if (name === "memory.parse") {
    const data = await apiPost("/api/parse", { source_id: args.source_id });
    return { content: [{ type: "text", text: JSON.stringify({ status: data.status, source_id: data.source_id, segment_count: data.segment_count }, null, 2) }] };
  }
  throw new Error(`Unknown tool: ${name}`);
}

// 把扁平的导入参数规整成 handleImport 期望的 { entrypoint, source_hint, payload } 形状。
function buildImportRequest(a = {}) {
  const payload = {};
  if (a.text != null) payload.text = a.text;
  if (a.url != null) payload.url = a.url;
  if (a.file_path != null) payload.file_path = a.file_path;
  if (a.title != null) payload.title = a.title;
  const source_hint = a.source_hint || (a.url ? "url" : a.file_path ? "file" : "text");
  return { entrypoint: "external_mcp", source_hint, payload };
}

export function filterSafeResults(items = []) {
  return items.filter((item) =>
    !["quarantined", "deleted"].includes(item.pollution_status) &&
    !["deleted", "source_deleted"].includes(item.import_status) &&
    item.trace_status !== "source_deleted"
  );
}

async function apiGet(p) {
  const res = await fetch(`${apiBase()}${p}`);
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
}

async function apiPost(p, body) {
  const res = await fetch(`${apiBase()}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
}
