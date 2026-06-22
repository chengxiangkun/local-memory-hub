import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { persistConversationTurn } from "./conversation-memory-service.js";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { routeChat, initModelProviders } from "./model-provider.js";
import { parseSource } from "./parser-service.js";
import { retrieveQuestionContext } from "./retrieval-service.js";
import { initSqlite, searchAllSqlite } from "./sqlite-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-retrieval-"));

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  initModelProviders();
  await initDataDir(dataDir);
  await initSqlite(dataDir);

  const imported = await handleImport(
    {
      entrypoint: "local_note",
      source_hint: "text",
      payload: {
        title: "春和雅苑入住笔记",
        text: "春和雅苑在本地记忆系统里是一条用于验证中文检索的样本。物业、楼栋和入住计划都应该能被问答引用。"
      }
    },
    dataDir
  );
  await parseSource(imported.source.source_id, {}, dataDir);

  const qaMemory = await persistConversationTurn(
    {
      question: "春和雅苑有什么信息？",
      answer: [
        "春和雅苑是一条问答回归样本，它代表用户关注的居住地点、物业、楼栋和入住计划。",
        "这条问答沉淀的价值不是普通聊天记录，而是后续检索时可复用的地点偏好和资料追溯样例。",
        "回答必须保留原始源资料引用，避免问答记忆反过来污染真实资料召回。"
      ].join(""),
      citations: [{ source_id: imported.source.source_id, title: "春和雅苑入住笔记", snippet: "验证中文检索" }]
    },
    dataDir
  );
  assert(qaMemory.status === "persisted", "conversation memory should persist");

  const rawSearch = await searchAllSqlite("春和雅苑", dataDir);
  assert(
    rawSearch.some((item) => item.entrypoint === "qa_conversation"),
    "plain search should still find Q&A memory for organizer use"
  );

  const context = await retrieveQuestionContext("春和雅苑入住计划", dataDir);
  assert(context.length >= 1, "question retrieval should find local source context");
  assert(
    context.some((item) => item.source_id === imported.source.source_id),
    "question retrieval should recall the original source"
  );
  assert(
    !context.some((item) => item.entrypoint === "qa_conversation"),
    "question retrieval should exclude Q&A memory by default"
  );
  assert(
    context.every((item) => item.index && item.title && item.snippet && !JSON.stringify(item).includes("undefined")),
    "retrieval context should expose stable citation fields"
  );

  const answer = await routeChat(
    {
      provider_id: "mock",
      question: "春和雅苑入住计划是什么？",
      context
    },
    dataDir
  );
  assert(answer.citations.length >= 1, "mock answer should cite retrieved context");
  assert(
    answer.citations.every((item) => item.index && item.title && item.snippet && !JSON.stringify(item).includes("undefined")),
    "answer citations should not contain undefined fields"
  );

  console.log("Retrieval service test passed");
  console.log(
    JSON.stringify(
      {
        context_count: context.length,
        first_hit: context[0].title,
        citation_count: answer.citations.length
      },
      null,
      2
    )
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
