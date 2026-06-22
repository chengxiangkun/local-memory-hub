import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { persistConversationTurn } from "./conversation-memory-service.js";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { initModelProviders } from "./model-provider.js";
import { parseSource } from "./parser-service.js";
import { assessConversationMemory, runQaMemoryAutoGovernance } from "./qa-memory-governance-service.js";
import { initSqlite, listSourcesSqlite } from "./sqlite-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-qa-governance-"));

try {
  await main();
  console.log("QA memory governance test passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  initModelProviders();
  await initDataDir(dataDir);
  await initSqlite(dataDir);

  const source = await handleImport(
    {
      entrypoint: "qa_governance_test",
      source_hint: "text",
      payload: {
        title: "技能资料",
        text: "我长期关注本地优先、知识图谱、资料导入、产品创意和工程架构。"
      }
    },
    dataDir
  );
  await parseSource(source.source.source_id, {}, dataDir);

  const lowSignal = assessConversationMemory({
    question: "这些资料有什么？",
    answer: "根据本地记忆，找到 3 条相关资料。\n[1] 技能资料",
    citations: [{ source_id: source.source.source_id, title: "技能资料", snippet: "本地优先" }]
  });
  assert(!lowSignal.should_persist, "mock-style low signal answer should not persist");

  const skipped = await persistConversationTurn(
    {
      question: "这些资料有什么？",
      answer: "根据本地记忆，找到 3 条相关资料。\n[1] 技能资料",
      citations: [{ source_id: source.source.source_id, title: "技能资料", snippet: "本地优先" }]
    },
    dataDir
  );
  assert(skipped.status === "skipped", "low signal conversation should be skipped");

  const meaningfulAnswer = [
    "根据资料，可以沉淀出一个长期偏好：你明显关注本地优先、知识图谱和低摩擦资料导入。",
    "这类偏好可以转成产品方向：先把资料可信进入系统，再用图谱和带引用问答做二次利用。",
    "它不是普通聊天记录，而是可长期复用的产品判断和个人偏好。"
  ].join("");

  const first = await persistConversationTurn(
    {
      question: "我适合做什么产品方向？",
      answer: meaningfulAnswer,
      citations: [{ source_id: source.source.source_id, title: "技能资料", snippet: "本地优先、知识图谱、产品创意" }]
    },
    dataDir
  );
  assert(first.status === "persisted", "meaningful conversation should persist");

  const exactDuplicate = await persistConversationTurn(
    {
      question: "我适合做什么产品方向？",
      answer: meaningfulAnswer,
      citations: [{ source_id: source.source.source_id, title: "技能资料", snippet: "本地优先、知识图谱、产品创意" }]
    },
    dataDir
  );
  assert(exactDuplicate.status === "skipped", "exact duplicate qa memory should be skipped");
  assert(exactDuplicate.reason === "duplicate_content_hash", "exact duplicate should be identified by content hash");

  const second = await persistConversationTurn(
    {
      question: "我适合做什么产品方向？",
      answer: `${meaningfulAnswer} 第二次回答会替代旧的重复问答记忆。`,
      citations: [{ source_id: source.source.source_id, title: "技能资料", snippet: "本地优先、知识图谱、产品创意" }]
    },
    dataDir
  );
  assert(second.status === "persisted", "latest duplicate conversation should persist");

  const semantic = await persistConversationTurn(
    {
      question: "哪些产品方向更适合我？",
      answer: `${meaningfulAnswer} 这个问题和产品方向判断高度接近，会进入语义重复候选治理。`,
      citations: [{ source_id: source.source.source_id, title: "技能资料", snippet: "本地优先、知识图谱、产品创意" }]
    },
    dataDir
  );
  assert(semantic.status === "persisted", "semantic duplicate candidate should persist first, then trigger governance");

  const governance = await runQaMemoryAutoGovernance(dataDir);
  assert(
    second.governance.quarantined_count >= 1 || semantic.governance.quarantined_count >= 1 || governance.quarantined_count >= 1,
    "duplicate qa memories should be quarantined"
  );
  assert(
    semantic.governance.semantic_candidates?.length >= 1 || governance.semantic_candidates?.length >= 1,
    "semantic duplicate qa memories should be reported as candidates"
  );

  const sources = await listSourcesSqlite(dataDir);
  const activeQa = sources.filter((item) => item.entrypoint === "qa_conversation" && item.pollution_status !== "quarantined");
  assert(activeQa.length === 1, "only one active qa memory should remain for duplicate question");
  assert(activeQa[0].source_id === semantic.source_id, "latest semantic qa memory should be kept");

}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
