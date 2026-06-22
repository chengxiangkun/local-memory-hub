import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initDataDir } from "./data-store.js";
import {
  insertMemorySegments,
  insertVectors,
  countSourceVectors,
  purgeSourceDerivedData,
  listAllMemorySegments
} from "./sqlite-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-source-detail-"));
process.env.LMH_DATA_DIR = dataDir;

try {
  await initDataDir(dataDir);
  const sourceId = "src-detail-1";
  await insertMemorySegments(
    [
      { segment_id: "seg-a", source_id: sourceId, segment_index: 0, text: "片段A", pollution_status: "clean" },
      { segment_id: "seg-b", source_id: sourceId, segment_index: 1, text: "片段B", pollution_status: "quarantined" }
    ],
    dataDir
  );
  await insertVectors(
    [
      { vector_id: "vec-a", source_id: sourceId, segment_id: "seg-a", vector_json: "[0.1,0.2]", embedding_provider: "local_weak", embedding_model: "lw", embedding_dimension: 2, chunk_hash: "a", pollution_status: "clean", created_at: new Date().toISOString() },
      { vector_id: "vec-b", source_id: sourceId, segment_id: "seg-b", vector_json: "[0.3,0.4]", embedding_provider: "local_weak", embedding_model: "lw", embedding_dimension: 2, chunk_hash: "b", pollution_status: "quarantined", created_at: new Date().toISOString() }
    ],
    dataDir
  );

  // 向量计数：总数 2，未隔离的有效数 1。
  const counts = await countSourceVectors(sourceId, dataDir);
  assert(counts.total === 2, `向量总数应为 2，实际 ${counts.total}`);
  assert(counts.active === 1, `有效向量应为 1，实际 ${counts.active}`);

  // 全量片段应包含隔离片段。
  const before = await listAllMemorySegments(sourceId, dataDir);
  assert(before.length === 2, "清场前应有 2 个片段");

  // 清场：删除该源全部派生数据。
  await purgeSourceDerivedData(sourceId, dataDir);
  const after = await listAllMemorySegments(sourceId, dataDir);
  const countsAfter = await countSourceVectors(sourceId, dataDir);
  assert(after.length === 0, "清场后片段应为空");
  assert(countsAfter.total === 0, "清场后向量应为空");

  console.log("Source detail test passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
