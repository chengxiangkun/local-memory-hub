import { rmSync } from "node:fs";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { parseSource } from "./parser-service.js";
import { getSourceById, initSqlite } from "./sqlite-store.js";
import { __parseMetadataForTest, enrichSourceMetadata } from "./metadata-enricher.js";

const dataDir = `/tmp/lmh-meta-test-${Date.now()}`;
process.env.LMH_DATA_DIR = dataDir;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await initDataDir(dataDir);
  await initSqlite(dataDir);

  // 1. 纯解析器:能从带前后缀的输出里抽出 JSON,并裁剪/校验字段
  const parsed = __parseMetadataForTest(
    '好的,元数据如下:{"summary":"MQTT 配置笔记","keywords":["MQTT","端口","broker"],"questions":["MQTT 怎么配置?","broker 端口是多少?"]} 完毕'
  );
  assert(parsed && parsed.summary === "MQTT 配置笔记", "应解析出 summary");
  assert(parsed.keywords.length === 3, "应解析出 3 个关键词");
  assert(parsed.questions.length === 2, "应解析出 2 个问题");
  assert(__parseMetadataForTest("这里没有 JSON") === null, "无 JSON 应返回 null");
  assert(__parseMetadataForTest('{"summary":"","keywords":[],"questions":[]}') === null, "全空应返回 null");

  // 2. 集成:mock(无真实问答模型)下解析会 best-effort 跳过元数据,并落 metadata_status=skipped
  const imported = await handleImport(
    {
      entrypoint: "manual",
      source_hint: "text",
      payload: {
        title: "数据采集通讯模块使用说明",
        text: "本模块通过 MQTT 协议采集数据。配置时在 broker 设置端口 1883,并填写主题前缀。"
      }
    },
    dataDir
  );
  const sourceId = imported.source.source_id;
  await parseSource(sourceId, {}, dataDir); // 内部 best-effort enrich → mock 跳过

  const src = await getSourceById(sourceId, dataDir);
  assert(src.metadata_status === "skipped", `mock 下应跳过元数据,实际:${src.metadata_status}`);

  // 直接调用也应跳过(显式)
  const result = await enrichSourceMetadata(sourceId, dataDir);
  assert(result.status === "skipped", `显式调用 mock 下应跳过,实际:${result.status}`);

  console.log("metadata-enricher test passed");
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
