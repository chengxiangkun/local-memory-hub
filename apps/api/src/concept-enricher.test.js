import { rmSync } from "node:fs";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { parseSource } from "./parser-service.js";
import { initSqlite, getGraph } from "./sqlite-store.js";
import { enrichConceptNode } from "./concept-enricher.js";

const dataDir = `/tmp/lmh-concept-test-${Date.now()}`;
process.env.LMH_DATA_DIR = dataDir;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await initDataDir(dataDir);
  await initSqlite(dataDir);

  const imported = await handleImport(
    {
      entrypoint: "manual",
      source_hint: "text",
      payload: {
        title: "MQTT 与 Kafka 对比",
        text: "MQTT 是轻量级物联网消息协议,基于发布订阅。Kafka 是高吞吐分布式消息队列。两者都用于消息传递,但场景不同。"
      }
    },
    dataDir
  );
  await parseSource(imported.source.source_id, {}, dataDir);

  const graph = await getGraph(dataDir, {});
  assert(graph.nodes.length >= 1, "应生成图谱节点");
  const node = graph.nodes[0];

  // mock(无真实模型)下应跳过,并把 concept_status 落为 skipped
  const result = await enrichConceptNode(node.node_id, dataDir);
  assert(result.status === "skipped", `mock 下应跳过,实际:${result.status}`);

  const graph2 = await getGraph(dataDir, {});
  const updated = graph2.nodes.find((n) => n.node_id === node.node_id);
  assert(updated.concept_status === "skipped", `concept_status 应为 skipped,实际:${updated.concept_status}`);

  // 不存在的节点 → skipped(no_node),不报错
  const none = await enrichConceptNode("", dataDir);
  assert(none.status === "skipped", "空 node_id 应跳过");

  console.log("concept-enricher test passed");
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
