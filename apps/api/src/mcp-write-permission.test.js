import assert from "node:assert";
import { rmSync } from "node:fs";
import { isToolEnabled } from "../../mcp/src/tools.js";
import { getMcpPermissions, saveMcpPermissions } from "./mcp-permission-store.js";

const dataDir = `/tmp/lmh-wperm-${Date.now()}`;
process.env.LMH_DATA_DIR = dataDir;

async function main() {
  // isToolEnabled:读工具默认开,写工具默认关,显式值优先
  assert(isToolEnabled({}, "memory.search") === true, "读工具默认应开");
  assert(isToolEnabled({}, "memory.import") === false, "写工具默认应关");
  assert(isToolEnabled({}, "memory.import_batch") === false, "批量写默认应关");
  assert(isToolEnabled({ "memory.import": true }, "memory.import") === true, "显式开则开");
  assert(isToolEnabled({ "memory.import": false }, "memory.import") === false, "显式关则关");

  // getMcpPermissions 默认:写工具 false、读工具 true
  const perms = await getMcpPermissions(dataDir);
  assert(perms.tools["memory.search"] === true, "读工具默认 true");
  assert(perms.tools["memory.import"] === false, "写工具默认 false");
  assert(perms.tools["memory.parse"] === false, "解析写工具默认 false");

  // 显式开启后持久化为 true
  await saveMcpPermissions({ tool: "memory.import", enabled: true }, dataDir);
  const perms2 = await getMcpPermissions(dataDir);
  assert(perms2.tools["memory.import"] === true, "开启后应为 true");
  // 其他写工具仍默认关
  assert(perms2.tools["memory.import_batch"] === false, "未开启的写工具仍 false");

  console.log("mcp-write-permission test passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
