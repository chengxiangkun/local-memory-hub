import { listSourcesSqlite, searchAllSqlite } from "./sqlite-store.js";

/**
 * Lightweight local memory organizer.
 *
 * V1 keeps this deterministic and cheap: it extracts simple habit signals from
 * local Q&A memory instead of calling an LLM on every run. Later versions can
 * plug in a model-backed summarizer behind the same service boundary.
 */
export async function getUserHabitProfile(dataDir) {
  const qaSources = (await listSourcesSqlite(dataDir)).filter((source) => source.entrypoint === "qa_conversation");
  const recentQa = await searchAllSqlite("问答对话记忆", dataDir);
  const keywordCounts = countKeywords(recentQa.map((item) => `${item.title} ${item.segment_text || item.extracted_preview || ""}`));

  return {
    profile_version: 1,
    updated_at: new Date().toISOString(),
    evidence: {
      qa_memory_count: qaSources.length,
      analyzed_context_count: recentQa.length
    },
    habits: {
      frequent_keywords: keywordCounts.slice(0, 12),
      likely_preferences: inferPreferences(keywordCounts)
    },
    maintenance_policy: {
      local_first: true,
      editable_later: true,
      can_delete_by_source: true,
      token_saving_mode: "deterministic_first_llm_when_needed"
    }
  };
}

function countKeywords(texts) {
  const stopWords = new Set(["这是", "一个", "以及", "可以", "应该", "来自", "用户", "回答", "问题", "引用", "来源", "问答", "记忆"]);
  const counts = new Map();
  for (const text of texts) {
    for (const token of String(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
      if (token.length < 2 || stopWords.has(token)) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword));
}

function inferPreferences(keywordCounts) {
  const keywords = new Set(keywordCounts.map((item) => item.keyword));
  const preferences = [];
  if (keywords.has("本地") || keywords.has("隐私")) preferences.push("偏好本地优先和隐私可控");
  if (keywords.has("图谱") || keywords.has("关系")) preferences.push("关注图谱关系和知识探索");
  if (keywords.has("导入") || keywords.has("解析")) preferences.push("关注低摩擦资料导入和解析质量");
  if (keywords.has("模型") || keywords.has("token")) preferences.push("关注模型调用成本和 token 节省");
  return preferences;
}
