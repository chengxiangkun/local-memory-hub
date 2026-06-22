import { embedTexts } from "./embedding-service.js";
import { extractMultilingualTokens } from "./text-tokenizer.js";
import { listMemorySegments, listSourcesSqlite, quarantineSourceCascade } from "./sqlite-store.js";

const LOW_SIGNAL_ANSWER_PATTERNS = [
  /^根据本地记忆，找到\s*\d+\s*条相关资料/,
  /当前没有检索到足够的本地资料/,
  /请提供更多具体信息/,
  /请提供具体的资料内容/,
  /无法从现有资料中找到答案/
];

export function assessConversationMemory({ question, answer, citations = [] }) {
  const normalizedQuestion = normalizeQuestion(question);
  const normalizedAnswer = String(answer || "").trim();
  const citationCount = Array.isArray(citations) ? citations.length : 0;
  const reasons = [];
  let score = 0;

  if (normalizedQuestion.length >= 4) score += 1;
  if (normalizedAnswer.length >= 120) score += 2;
  if (normalizedAnswer.length >= 320) score += 1;
  if (citationCount > 0) score += 1;
  if (citationCount >= 3) score += 1;
  if (looksLikeUserInsight(normalizedQuestion, normalizedAnswer)) score += 2;

  if (!normalizedQuestion || !normalizedAnswer) reasons.push("empty_question_or_answer");
  if (citationCount === 0) reasons.push("no_citations");
  if (LOW_SIGNAL_ANSWER_PATTERNS.some((pattern) => pattern.test(normalizedAnswer))) {
    reasons.push("low_signal_answer");
  }
  if (normalizedAnswer.length < 80) reasons.push("answer_too_short");

  return {
    should_persist: reasons.length === 0 && score >= 4,
    score,
    reasons,
    normalized_question: normalizedQuestion
  };
}

export async function runQaMemoryAutoGovernance(dataDir, options = {}) {
  const sources = (await listSourcesSqlite(dataDir))
    .filter((source) => source.entrypoint === "qa_conversation" && source.pollution_status !== "quarantined")
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  const records = await buildQaGovernanceRecords(sources, dataDir);
  await attachQuestionVectors(records, dataDir);
  const seenContentHashes = new Set();
  const seenQuestions = new Set();
  const quarantined = [];
  const kept = [];
  const semanticCandidates = [];

  for (const record of records) {
    const exactDuplicate = record.content_hash && seenContentHashes.has(record.content_hash);
    const questionDuplicate = record.normalized_question && seenQuestions.has(record.normalized_question);
    const semanticDuplicate = exactDuplicate || questionDuplicate
      ? null
      : findSemanticDuplicate(record, kept, options);
    const reason = exactDuplicate
      ? "duplicate_qa_content_hash"
      : questionDuplicate
        ? "duplicate_qa_question"
        : semanticDuplicate
          ? "semantic_duplicate_qa_question"
          : !record.normalized_question
            ? "empty_qa_question"
            : "";

    if (reason) {
      if (!options.dryRun) await quarantineSourceCascade(record.source_id, dataDir);
      const quarantinedItem = {
        source_id: record.source_id,
        title: record.title,
        reason
      };
      if (semanticDuplicate) {
        quarantinedItem.duplicate_of = semanticDuplicate.source_id;
        quarantinedItem.semantic_score = semanticDuplicate.semantic_score;
        quarantinedItem.vector_score = semanticDuplicate.vector_score;
        quarantinedItem.lexical_score = semanticDuplicate.lexical_score;
        semanticCandidates.push(quarantinedItem);
      }
      quarantined.push(quarantinedItem);
      continue;
    }
    seenContentHashes.add(record.content_hash);
    seenQuestions.add(record.normalized_question);
    kept.push(record);
  }

  return {
    status: "success",
    scanned_count: records.length,
    kept_count: kept.length,
    quarantined_count: quarantined.length,
    kept: kept.map((record) => ({ source_id: record.source_id, title: record.title })),
    quarantined,
    semantic_candidates: semanticCandidates
  };
}

function normalizeQuestion(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[？?。.!！]+$/g, "")
    .toLowerCase();
}

async function buildQaGovernanceRecords(sources, dataDir) {
  const records = [];
  for (const source of sources) {
    const segments = await listMemorySegments(source.source_id, dataDir);
    const text = segments.map((segment) => segment.text).join("\n");
    const question = extractQuestionFromQaText(text) || source.title.replace(/^问答记忆：/, "");
    records.push({
      source_id: source.source_id,
      title: source.title,
      content_hash: source.content_hash,
      question,
      normalized_question: normalizeQuestion(question)
    });
  }
  return records;
}

async function attachQuestionVectors(records, dataDir) {
  const questions = records.map((record) => record.normalized_question);
  if (questions.every((question) => !question)) return;
  try {
    const embedded = await embedTexts(questions, dataDir);
    records.forEach((record, index) => {
      record.question_vector = embedded.vectors[index];
      record.embedding_provider = embedded.provider_id;
      record.embedding_model = embedded.embedding_model;
    });
  } catch {
    records.forEach((record) => {
      record.question_vector = null;
    });
  }
}

function findSemanticDuplicate(record, kept, options) {
  if (!record.normalized_question || !record.question_vector) return null;
  const threshold = Number(options.semanticThreshold || 0.64);
  const lexicalThreshold = Number(options.semanticLexicalThreshold || 0.25);
  let best = null;

  for (const candidate of kept) {
    if (!candidate.question_vector) continue;
    const vectorScore = cosine(record.question_vector, candidate.question_vector);
    const lexicalScore = tokenOverlap(
      extractMultilingualTokens(record.normalized_question),
      extractMultilingualTokens(candidate.normalized_question)
    );
    const semanticScore = vectorScore * 0.75 + lexicalScore * 0.25;
    const matched = vectorScore >= 0.86 || (vectorScore >= threshold && lexicalScore >= lexicalThreshold) || semanticScore >= 0.58;
    if (!matched) continue;
    if (!best || semanticScore > best.semantic_score) {
      best = {
        source_id: candidate.source_id,
        semantic_score: roundScore(semanticScore),
        vector_score: roundScore(vectorScore),
        lexical_score: roundScore(lexicalScore)
      };
    }
  }
  return best;
}

function extractQuestionFromQaText(text) {
  const match = String(text || "").match(/## 用户问题\s+([\s\S]*?)\s+## 回答/);
  return match?.[1]?.trim() || "";
}

function tokenOverlap(leftTokens, rightTokens) {
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const right = new Set(rightTokens);
  const intersection = leftTokens.filter((token) => right.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function roundScore(value) {
  return Math.round(value * 1000) / 1000;
}

function looksLikeUserInsight(question, answer) {
  const text = `${question} ${answer}`;
  return /我|我的|日记|偏好|习惯|技能|规划|计划|方案|创意|总结|反思|长期|记住|住哪里|地点/.test(text);
}
