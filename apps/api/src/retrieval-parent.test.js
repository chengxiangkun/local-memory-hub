import { rmSync } from "node:fs";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { parseSource } from "./parser-service.js";
import { initSqlite, listMemorySegments, setSegmentPollutionStatus } from "./sqlite-store.js";
import { expandToParentDocs } from "./retrieval-service.js";

const dataDir = `/tmp/lmh-parent-test-${Date.now()}`;
process.env.LMH_DATA_DIR = dataDir;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await initDataDir(dataDir);
  await initSqlite(dataDir);

  // 构造一篇足够长、会被切成多片段的文档,首尾各埋一个独特标记。
  const filler = "这是一段用于撑长文档的说明文字,反复描述系统的配置与使用细节。".repeat(40);
  const text = `标记ALPHA 开头部分。\n${filler}\n中间部分继续描述。\n${filler}\n标记OMEGA 结尾部分。`;
  const imported = await handleImport(
    { entrypoint: "manual", source_hint: "text", payload: { title: "多片段长文档", text } },
    dataDir
  );
  const sourceId = imported.source.source_id;
  await parseSource(sourceId, {}, dataDir);

  const segments = await listMemorySegments(sourceId, dataDir);
  assert(segments.length >= 2, `应切成多片段,实际:${segments.length}`);

  // 模拟"只命中其中一个片段":构造一条 result,只带 source_id 和某片段文本
  const hit = [{ source_id: sourceId, segment_text: segments[1].text, snippet: segments[1].text, title: "多片段长文档" }];
  const expanded = await expandToParentDocs(hit, dataDir);
  assert(expanded.length === 1, "应返回 1 个源");
  const parent = expanded[0].parent_text;
  assert(parent.includes("标记ALPHA"), "父文档应补齐到开头片段(标记ALPHA)");
  assert(parent.includes("标记OMEGA"), "父文档应补齐到结尾片段(标记OMEGA)");
  assert(expanded[0].parent_segment_count === segments.length, "补齐片段数应等于全部片段数");

  // 隔离首片段后,父文档不应再包含该片段内容
  await setSegmentPollutionStatus(segments[0].segment_id, "quarantined", dataDir);
  const expanded2 = await expandToParentDocs(hit, dataDir);
  assert(!expanded2[0].parent_text.includes("标记ALPHA"), "隔离的片段不应出现在父文档补齐结果中");

  console.log("retrieval parent-doc test passed");
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
