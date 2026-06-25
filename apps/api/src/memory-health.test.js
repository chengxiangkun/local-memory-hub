import { rmSync } from "node:fs";
import { initDataDir } from "./data-store.js";
import { initSqlite } from "./sqlite-store.js";
import { runMemoryHealthCheck, getLastHealthReport, __parseReportForTest } from "./memory-health-service.js";

const dataDir = `/tmp/lmh-health-test-${Date.now()}`;
process.env.LMH_DATA_DIR = dataDir;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await initDataDir(dataDir);
  await initSqlite(dataDir);

  // 1. 报告解析器:从带前后缀输出抽 JSON,裁剪字段
  const parsed = __parseReportForTest(
    '检查结果:{"issues":[{"type":"矛盾","detail":"A 说端口 1883,B 说 8883","sources":["A","B"]},{"type":"过时","detail":"","sources":[]}]} 完'
  );
  assert(Array.isArray(parsed), "应返回数组");
  assert(parsed.length === 1, `应过滤掉 detail 为空的项,实际:${parsed.length}`);
  assert(parsed[0].type === "矛盾" && parsed[0].sources.length === 2, "应保留 type 与 sources");
  assert(Array.isArray(__parseReportForTest('{"issues":[]}')) && __parseReportForTest('{"issues":[]}').length === 0, "空 issues 应为 []");
  assert(__parseReportForTest("没有 JSON") === null, "无 JSON 返回 null");

  // 2. mock(无真实模型)下应跳过
  const report = await runMemoryHealthCheck(dataDir);
  assert(report.status === "skipped", `mock 下应跳过,实际:${report.status}`);

  // 3. 没跑过时,最近报告为 none
  const last = await getLastHealthReport(dataDir);
  assert(last.status === "none", `未生成报告时应为 none,实际:${last.status}`);

  console.log("memory-health test passed");
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
