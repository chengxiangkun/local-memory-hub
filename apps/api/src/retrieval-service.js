import { getDataDir } from "./data-store.js";
import { listSourcesSqlite, searchAllSqlite } from "./sqlite-store.js";
import { vectorSearch } from "./vector-service.js";

const DEFAULT_LIMIT = 5;

export async function retrieveQuestionContext(question, dataDir = getDataDir(), options = {}) {
  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) return [];

  const limit = options.limit || DEFAULT_LIMIT;
  const [lexicalResults, vectorResults] = await Promise.all([
    searchAllSqlite(normalizedQuestion, dataDir, { includeConversationMemory: false }),
    vectorSearch(normalizedQuestion, dataDir, { includeConversationMemory: false })
  ]);

  return mergeAndNormalizeResults([
    ...lexicalResults.map((item) => ({ ...item, hit_reason: "keyword" })),
    ...vectorResults.map((item) => ({
      ...item,
      segment_text: item.text,
      hit_reason: item.lexical_score > 0 ? "vector_keyword" : "vector"
    }))
  ]).slice(0, limit);
}

export async function listFallbackQuestionContext(dataDir = getDataDir(), options = {}) {
  const limit = options.limit || DEFAULT_LIMIT;
  const sources = (await listSourcesSqlite(dataDir))
    .filter((source) =>
      source.entrypoint !== "qa_conversation" &&
      source.import_status !== "deleted" &&
      source.pollution_status !== "quarantined" &&
      source.memory_status === "memory_indexed"
    )
    .slice(0, limit);

  return normalizeResults(sources.map((source) => ({ ...source, hit_reason: "recent_memory" })));
}

export function normalizeCitation(item, index = 0) {
  const sourceId = stringOrEmpty(item.source_id);
  const title = stringOrEmpty(item.title) || sourceId || "未命名来源";
  const snippet = firstNonEmpty(item.snippet, item.segment_text, item.extracted_preview, item.text, item.title);

  return {
    index: Number.isFinite(Number(item.index)) ? Number(item.index) : index + 1,
    source_id: sourceId,
    segment_id: stringOrEmpty(item.segment_id),
    title,
    snippet: snippet || "该来源没有可展示的文本片段。",
    hit_reason: item.hit_reason || item.match_reason || "retrieval",
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : undefined,
    vector_score: Number.isFinite(Number(item.vector_score)) ? Number(item.vector_score) : undefined,
    lexical_score: Number.isFinite(Number(item.lexical_score)) ? Number(item.lexical_score) : undefined,
    entrypoint: item.entrypoint || "",
    source_type: item.source_type || "",
    source_platform: item.source_platform || "",
    segment_text: stringOrEmpty(item.segment_text || item.text),
    extracted_preview: stringOrEmpty(item.extracted_preview)
  };
}

function mergeAndNormalizeResults(results) {
  const bySource = new Map();
  for (const item of results) {
    if (!item.source_id) continue;
    const existing = bySource.get(item.source_id);
    if (!existing || scoreResult(item) > scoreResult(existing)) {
      bySource.set(item.source_id, item);
    }
  }
  return normalizeResults([...bySource.values()].sort((left, right) => scoreResult(right) - scoreResult(left)));
}

function normalizeResults(results) {
  return results.map((item, index) => normalizeCitation(item, index));
}

function scoreResult(item) {
  if (Number.isFinite(Number(item.score))) return Number(item.score);
  if (item.hit_reason === "keyword") return 0.7;
  if (item.hit_reason === "recent_memory") return 0.1;
  return 0;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = stringOrEmpty(value);
    if (text) return text;
  }
  return "";
}

function stringOrEmpty(value) {
  return String(value || "").trim();
}
