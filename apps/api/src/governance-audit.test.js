import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initDataDir } from "./data-store.js";
import {
  insertMemorySegments,
  listMemorySegments,
  listAllMemorySegments,
  setSegmentPollutionStatus,
  appendGovernanceEvents,
  listGovernanceEvents
} from "./sqlite-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-governance-audit-"));
process.env.LMH_DATA_DIR = dataDir;

try {
  await initDataDir(dataDir);
  const sourceId = "src-test-1";
  await insertMemorySegments(
    [
      { segment_id: "seg-1", source_id: sourceId, segment_index: 0, text: "第一段：正常内容", pollution_status: "clean" },
      { segment_id: "seg-2", source_id: sourceId, segment_index: 1, text: "第二段：坏内容", pollution_status: "clean" }
    ],
    dataDir
  );

  // 片段级隔离：隔离 seg-2，应从普通检索排除，但仍保留在全量列表中以便恢复。
  await setSegmentPollutionStatus("seg-2", "quarantined", dataDir);
  const visible = await listMemorySegments(sourceId, dataDir);
  const all = await listAllMemorySegments(sourceId, dataDir);
  assert(visible.length === 1 && visible[0].segment_id === "seg-1", "隔离片段应从普通检索排除");
  assert(all.length === 2, "全量列表应包含隔离片段");
  assert(all.find((item) => item.segment_id === "seg-2").pollution_status === "quarantined", "seg-2 应标记为隔离");

  // 恢复片段。
  await setSegmentPollutionStatus("seg-2", "clean", dataDir);
  const restored = await listMemorySegments(sourceId, dataDir);
  assert(restored.length === 2, "恢复后片段应重新可见");

  // 治理审计事件落库与读取。
  await appendGovernanceEvents(
    [
      { scope: "segment", source_id: sourceId, segment_id: "seg-2", action: "quarantined", reason: "manual_segment_quarantine" },
      { scope: "source", source_id: sourceId, action: "deleted", reason: "manual_source_delete", detail: { trash_path: "/tmp/x" } }
    ],
    dataDir
  );
  const events = await listGovernanceEvents(dataDir, { limit: 10 });
  assert(events.length === 2, "应记录 2 条治理事件");
  assert(events.every((item) => item.detail && typeof item.detail === "object"), "事件 detail 应被解析为对象");
  const deleteEvent = events.find((item) => item.action === "deleted");
  assert(deleteEvent && deleteEvent.detail.trash_path === "/tmp/x", "删除事件应保留 detail 信息");

  console.log("Governance audit test passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
