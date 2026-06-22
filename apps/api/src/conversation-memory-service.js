import { handleImport } from "./import-pipeline.js";
import { parseSource } from "./parser-service.js";
import { assessConversationMemory, runQaMemoryAutoGovernance } from "./qa-memory-governance-service.js";

/**
 * Persists Q&A turns as first-class local memory.
 *
 * The Q&A page is not only a retrieval surface. Each completed turn can become
 * a traceable source record, then reuse the normal parse/vector/graph pipeline.
 */
export async function persistConversationTurn({ question, answer, citations = [] }, dataDir) {
  const normalizedQuestion = String(question || "").trim();
  const normalizedAnswer = String(answer || "").trim();
  if (!normalizedQuestion || !normalizedAnswer) {
    return { status: "skipped", reason: "empty_question_or_answer" };
  }
  const assessment = assessConversationMemory({
    question: normalizedQuestion,
    answer: normalizedAnswer,
    citations
  });
  if (!assessment.should_persist) {
    await runQaMemoryAutoGovernance(dataDir).catch(() => null);
    return {
      status: "skipped",
      reason: "auto_governance_low_signal",
      governance: assessment
    };
  }

  const text = buildConversationText({
    question: normalizedQuestion,
    answer: normalizedAnswer,
    citations
  });
  const imported = await handleImport(
    {
      entrypoint: "qa_conversation",
      source_hint: "text",
      payload: {
        title: `问答记忆：${normalizedQuestion.slice(0, 40)}`,
        text
      }
    },
    dataDir
  );
  if (imported.status === "duplicate") {
    await runQaMemoryAutoGovernance(dataDir).catch(() => null);
    return {
      status: "skipped",
      reason: "duplicate_content_hash",
      source_id: imported.source.source_id,
      duplicate: true
    };
  }

  const parsed = await parseSource(imported.source.source_id, { llm_fallback: false }, dataDir);
  const governance = await runQaMemoryAutoGovernance(dataDir).catch((error) => ({
    status: "failed",
    error: error.message
  }));
  return {
    status: parsed.status === "success" ? "persisted" : "parse_failed",
    source_id: imported.source.source_id,
    duplicate: imported.status === "duplicate",
    parse_status: parsed.status,
    segment_count: parsed.segment_count || 0,
    graph_node_count: parsed.graph_node_count || 0,
    governance
  };
}

function buildConversationText({ question, answer, citations }) {
  const citationText = citations
    .map((item) => `- [${item.index || "-"}] ${item.title || item.source_id || "未知来源"}：${item.snippet || ""}`)
    .join("\n");

  return [
    "# 问答对话记忆",
    "",
    "## 用户问题",
    question,
    "",
    "## 回答",
    answer,
    "",
    "## 引用来源",
    citationText || "无引用来源",
    "",
    "## 记忆整理提示",
    "这条记录来自问答页面，应作为用户关注点、表达习惯和长期偏好的候选信号。"
  ].join("\n");
}
