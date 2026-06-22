import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-mcp-stdio-"));

async function connectClient() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["apps/mcp/src/mcp-stdio.js"],
    env: { ...process.env, LMH_DATA_DIR: dataDir }
  });
  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

try {
  // 默认:列出全部 4 个工具
  const client = await connectClient();
  const list = await client.listTools();
  assert(list.tools.length === 4, `默认应列出 4 个工具,实际 ${list.tools.length}`);
  assert(list.tools.some((t) => t.name === "memory.search"), "应包含 memory.search");
  await client.close();

  // 权限禁用 graph.search 后,列表应少一个且不含它
  await mkdir(path.join(dataDir, "config"), { recursive: true });
  await writeFile(
    path.join(dataDir, "config", "mcp-permissions.local.json"),
    JSON.stringify({ tools: { "graph.search": false } })
  );
  const client2 = await connectClient();
  const list2 = await client2.listTools();
  assert(list2.tools.length === 3, `禁用后应剩 3 个工具,实际 ${list2.tools.length}`);
  assert(!list2.tools.some((t) => t.name === "graph.search"), "禁用的 graph.search 不应出现");

  // 调用被禁用的工具应被拒绝
  let rejected = false;
  try {
    await client2.callTool({ name: "graph.search", arguments: { query: "x" } });
  } catch {
    rejected = true;
  }
  assert(rejected, "调用被禁用工具应被拒绝");
  await client2.close();

  console.log("MCP stdio test passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
