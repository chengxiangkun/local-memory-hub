import { getDataDir } from "./data-store.js";
import { listMemorySegments, listSourcesSqlite, searchAllSqlite } from "./sqlite-store.js";
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

// 父文档召回(连坐召回):命中任一片段后,把该源的全部片段按 segment_index 顺序补齐,
// 作为 parent_text 附在条目上(供模型读全文,治"召回了对的文档但答错/碎片化")。
// parent_text 仅用于喂模型(buildPrompt),不改展示用的 snippet,避免引用卡片过长。
// 隔离过滤天然保留:listMemorySegments 已排除 quarantined。
export async function expandToParentDocs(results, dataDir = getDataDir(), options = {}) {
  const maxSources = options.maxSources || 3;
  const maxCharsPerSource = options.maxCharsPerSource || 4000;
  const seen = new Set();
  const expanded = [];
  for (const item of results || []) {
    if (!item.source_id || seen.has(item.source_id)) continue;
    seen.add(item.source_id);
    let parentText = "";
    let segmentCount = 0;
    try {
      const segments = await listMemorySegments(item.source_id, dataDir);
      segmentCount = segments.length;
      parentText = assembleSegments(segments, maxCharsPerSource);
    } catch {
      parentText = "";
    }
    if (!parentText) parentText = stringOrEmpty(item.segment_text || item.snippet);
    expanded.push({ ...item, index: expanded.length + 1, parent_text: parentText, parent_segment_count: segmentCount });
    if (expanded.length >= maxSources) break;
  }
  return expanded;
}

function assembleSegments(segments, maxChars) {
  let text = "";
  for (const segment of segments) {
    const piece = String(segment.text || "");
    if (!piece) continue;
    if (text.length + piece.length + 1 > maxChars) {
      const remaining = maxChars - text.length;
      if (remaining > 40) text += `${text ? "\n" : ""}${piece.slice(0, remaining)} …(后续片段略)`;
      break;
    }
    text += `${text ? "\n" : ""}${piece}`;
  }
  return text;
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
