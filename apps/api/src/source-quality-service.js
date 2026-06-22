import { extractMultilingualTokens } from "./text-tokenizer.js";

const DEFAULT_MIN_CHARS = 80;
const DEFAULT_MIN_TOKENS = 8;
const DEFAULT_MIN_SCORE = 50;
const MAX_REPEATED_LINE_RATIO = 0.55;
const MAX_NOISE_RATIO = 0.42;

const LOW_VALUE_PATTERNS = [
  /^\s*(ok|test|测试|hello|你好)\s*$/i,
  /^(.)\1{20,}$/,
  /无法识别|未识别到文本|本地解析失败/
];

export function assessSourceTextQuality({ title = "", text = "", sourceType = "" } = {}, options = {}) {
  const normalizedText = normalizeText(text);
  const tokens = extractMultilingualTokens(`${title}\n${normalizedText}`);
  const lines = normalizedText.split("\n").map((line) => line.trim()).filter(Boolean);
  const repeatedLineRatio = calculateRepeatedLineRatio(lines);
  const noiseRatio = calculateNoiseRatio(normalizedText);
  const reasons = [];
  let score = 100;

  if (normalizedText.length < (options.minChars || DEFAULT_MIN_CHARS)) {
    reasons.push("text_too_short");
    score -= 35;
  }
  if (tokens.length < (options.minTokens || DEFAULT_MIN_TOKENS)) {
    reasons.push("too_few_meaningful_tokens");
    score -= 30;
  }
  if (repeatedLineRatio > MAX_REPEATED_LINE_RATIO) {
    reasons.push("too_many_repeated_lines");
    score -= 25;
  }
  if (noiseRatio > MAX_NOISE_RATIO) {
    reasons.push("text_noise_too_high");
    score -= 25;
  }
  if (LOW_VALUE_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    reasons.push("low_value_placeholder_text");
    score -= 45;
  }

  const shouldIndex = reasons.length === 0 || score >= (options.minScore || DEFAULT_MIN_SCORE);
  return {
    should_index: shouldIndex,
    score: Math.max(0, Math.min(100, score)),
    reasons,
    metrics: {
      char_count: normalizedText.length,
      token_count: tokens.length,
      line_count: lines.length,
      repeated_line_ratio: Number(repeatedLineRatio.toFixed(2)),
      noise_ratio: Number(noiseRatio.toFixed(2)),
      source_type: sourceType
    }
  };
}

export function formatSourceQualityReasons(reasons = []) {
  const labels = {
    text_too_short: "文本过短",
    too_few_meaningful_tokens: "有效关键词过少",
    too_many_repeated_lines: "重复行过多",
    text_noise_too_high: "疑似乱码或噪声过高",
    low_value_placeholder_text: "疑似占位或低价值文本"
  };
  return reasons.map((reason) => labels[reason] || reason).join("、") || "质量不足";
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function calculateRepeatedLineRatio(lines) {
  if (lines.length < 4) return 0;
  const counts = new Map();
  for (const line of lines) {
    if (line.length < 4) continue;
    counts.set(line, (counts.get(line) || 0) + 1);
  }
  const repeated = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return repeated / lines.length;
}

function calculateNoiseRatio(text) {
  if (!text) return 1;
  const meaningful = text.match(/[\p{Script=Han}A-Za-z0-9]/gu)?.length || 0;
  return 1 - meaningful / text.length;
}
