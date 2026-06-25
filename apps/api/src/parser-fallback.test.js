import { rmSync, writeFileSync } from "node:fs";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { isVisualOrBinarySource, parseSource } from "./parser-service.js";
import { getSourceById, initSqlite } from "./sqlite-store.js";

const dataDir = `/tmp/lmh-fallback-test-${Date.now()}`;
process.env.LMH_DATA_DIR = dataDir;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await initDataDir(dataDir);
  await initSqlite(dataDir);

  // 1. 守卫:图片/音视频判为二进制(不可文本兜底),文本/链接不是
  assert(isVisualOrBinarySource({ source_type: "file", local_file_path: "/x/a.png" }) === true, "png 应判为二进制");
  assert(isVisualOrBinarySource({ source_type: "file", local_file_path: "/x/a.mp4" }) === true, "mp4 应判为二进制");
  assert(isVisualOrBinarySource({ source_type: "file", local_file_path: "/x/a.txt" }) === false, "txt 不应判为二进制");
  assert(isVisualOrBinarySource({ source_type: "text", local_file_path: "" }) === false, "text 不应判为二进制");

  // 2. 集成:导入图片 + 开启兜底解析,绝不能 llm_fallback_success / 入记忆
  //    (旧 bug:文本模型收不到图,只会写一段"已帮你兜底"的安慰话并入库)
  const imgPath = `${dataDir}-fake.png`;
  writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]));
  const imported = await handleImport(
    { entrypoint: "manual", source_hint: "file", payload: { file_path: imgPath, title: "测试图片.png" } },
    dataDir
  );
  const sid = imported.source.source_id;
  const result = await parseSource(sid, { llm_fallback: true }, dataDir);
  assert(result.status !== "llm_fallback_success", `图片不应走兜底成功,实际:${result.status}`);
  const src = await getSourceById(sid, dataDir);
  assert(src.memory_status !== "memory_indexed", `图片解析失败不应入记忆,实际 memory_status=${src.memory_status}`);
  assert(["parse_failed", "quality_rejected"].includes(src.parse_status), `应为失败/质检拒绝,实际 ${src.parse_status}`);

  console.log(`parser-fallback (#29) test passed: status=${result.status} parse_status=${src.parse_status} memory_status=${src.memory_status}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(`${dataDir}-fake.png`, { force: true });
    } catch {
      /* ignore */
    }
  });
