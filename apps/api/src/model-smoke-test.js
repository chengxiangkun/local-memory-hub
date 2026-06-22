import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { persistConversationTurn } from "./conversation-memory-service.js";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { getUserHabitProfile } from "./memory-organizer-agent.js";
import { initModelProviders, listProviderTemplates, routeChat } from "./model-provider.js";
import { parseSource } from "./parser-service.js";
import { appendQaMessage, clearQaSession, getOrCreateQaSession, initSqlite, listQaMessages, listRecentQaMessages, searchAllSqlite } from "./sqlite-store.js";
import { vectorSearch } from "./vector-service.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-model-"));

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const runId = Date.now();
  initModelProviders();
  await initDataDir(dataDir);
  await initSqlite(dataDir);

  const providers = listProviderTemplates();
  const deepseek = providers.find((item) => item.provider_id === "deepseek");
  assert(deepseek, "providers should include DeepSeek");
  assert(deepseek.default_base_url && deepseek.default_model, "DeepSeek should include default config");
  assert(providers.some((item) => item.provider_id === "dashscope"), "providers should include DashScope");

  const imported = await handleImport(
    {
      entrypoint: "onboarding",
      source_hint: "text",
      payload: {
        title: "模型问答测试",
        text: "DeepSeek 和通义千问都应该作为模型供应商配置模板出现。"
      }
    },
    dataDir
  );
  await parseSource(imported.source.source_id, {}, dataDir);

  const answer = await routeChat(
    {
      provider_id: "mock",
      question: `DeepSeek 和通义千问是否支持？${runId}`,
      context: [imported.source]
    },
    dataDir
  );
  assert(answer.answer.includes("本地记忆") || answer.answer.includes("相关资料"), "mock answer should respond");
  assert(answer.citations.length >= 1, "mock answer should include citations");

  const session = await getOrCreateQaSession(null, dataDir);
  await appendQaMessage({
    session_id: session.session_id,
    role: "user",
    content: `上一轮问题 ${runId}`
  }, dataDir);
  await appendQaMessage({
    session_id: session.session_id,
    role: "assistant",
    content: `上一轮回答 ${runId}`,
    model: "mock-memory-chat",
    citations: answer.citations
  }, dataDir);
  const messages = await listQaMessages(session.session_id, dataDir);
  assert(messages.length === 2, "qa session should persist messages");
  assert(messages[1].citations.length >= 1, "assistant message should persist citations");
  const recent = await listRecentQaMessages(session.session_id, dataDir, { limit: 1 });
  assert(recent.length === 1 && recent[0].role === "assistant", "recent qa history should return latest messages");

  const conversationMemory = await persistConversationTurn(
    {
      question: `DeepSeek 和通义千问是否支持？${runId}`,
      answer: [
        `DeepSeek 和通义千问都应该作为模型供应商配置模板出现。${runId}`,
        "这条问答沉淀的是模型供应商选择偏好：本地记忆系统需要优先支持国内常用模型，同时保留 OpenAI-Compatible 扩展。",
        "后续模型路由、解析兜底和问答任务都可以复用这类 provider 配置。"
      ].join(""),
      citations: answer.citations
    },
    dataDir
  );
  assert(conversationMemory.status === "persisted", "ask should persist conversation memory");
  assert(conversationMemory.source_id, "conversation memory should include source_id");

  const conversationSearch = await searchAllSqlite(String(runId), dataDir);
  assert(
    conversationSearch.some((item) => item.source_id === conversationMemory.source_id),
    "conversation memory should be searchable"
  );

  const vector = await vectorSearch(String(runId), dataDir);
  assert(
    vector.some((item) => item.source_id === conversationMemory.source_id),
    "conversation memory should be indexed into vector store"
  );

  const habits = await getUserHabitProfile(dataDir);
  assert(habits.evidence.qa_memory_count >= 1, "habit profile should analyze qa conversation memory");
  await clearQaSession(session.session_id, dataDir);
  assert((await listQaMessages(session.session_id, dataDir)).length === 0, "qa session clear should remove messages");

  console.log("Model smoke test passed");
  console.log(
    JSON.stringify(
      {
        provider_count: providers.length,
        citations: answer.citations.length,
        conversation_memory: conversationMemory.status,
        qa_memory_count: habits.evidence.qa_memory_count
      },
      null,
      2
    )
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
