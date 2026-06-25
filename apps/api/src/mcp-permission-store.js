import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, initDataDir } from "./data-store.js";

/**
 * 外部 AI(MCP)工具权限与调用审计。
 *
 * 权限文件 config/mcp-permissions.local.json 与 apps/mcp/src/tools.js 共用同一路径,
 * UI 在这里读写,MCP 进程读取后据此过滤/拒绝工具。审计日志读取 logs/external-calls.log。
 */

// 写工具(外部 AI 能改本地数据)默认关闭,必须用户显式开启;读工具默认开启。
export const MCP_WRITE_TOOLS = new Set(["memory.import", "memory.import_batch", "memory.parse"]);
export const MCP_TOOL_NAMES = [
  "memory.search",
  "memory.get_context",
  "memory.ask",
  "graph.search",
  "memory.import",
  "memory.import_batch",
  "memory.parse"
];

// 单工具是否启用:写工具缺省 false(仅显式 true 才开),读工具缺省 true。
function toolEnabledFromStore(stored, name) {
  return MCP_WRITE_TOOLS.has(name) ? stored[name] === true : stored[name] !== false;
}

export function mcpPermissionPath(dataDir = getDataDir()) {
  return path.join(dataDir, "config", "mcp-permissions.local.json");
}

export async function getMcpPermissions(dataDir = getDataDir()) {
  await initDataDir(dataDir);
  let stored = {};
  try {
    const data = JSON.parse(await readFile(mcpPermissionPath(dataDir), "utf8"));
    stored = data.tools && typeof data.tools === "object" ? data.tools : {};
  } catch {
    stored = {};
  }
  return { tools: Object.fromEntries(MCP_TOOL_NAMES.map((name) => [name, toolEnabledFromStore(stored, name)])) };
}

export async function saveMcpPermissions(input = {}, dataDir = getDataDir()) {
  const current = (await getMcpPermissions(dataDir)).tools;
  const next = { ...current };
  if (input.tool && MCP_TOOL_NAMES.includes(input.tool)) {
    next[input.tool] = input.enabled !== false;
  }
  if (input.tools && typeof input.tools === "object") {
    for (const [key, value] of Object.entries(input.tools)) {
      if (MCP_TOOL_NAMES.includes(key)) next[key] = value !== false;
    }
  }
  const file = mcpPermissionPath(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ tools: next }, null, 2));
  return { tools: next };
}

export async function listExternalCalls(dataDir = getDataDir(), options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
  let text = "";
  try {
    text = await readFile(path.join(dataDir, "logs", "external-calls.log"), "utf8");
  } catch {
    return [];
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const parsed = [];
  for (const line of lines.slice(-limit)) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // 跳过损坏行
    }
  }
  return parsed.reverse();
}
