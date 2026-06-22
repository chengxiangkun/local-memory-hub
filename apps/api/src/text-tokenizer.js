export function extractMultilingualTokens(text) {
  const normalized = String(text)
    .toLowerCase()
    .replaceAll(/([一-鿿㐀-䶿])([a-z0-9])/g, "$1 $2")
    .replaceAll(/([a-z0-9])([一-鿿㐀-䶿])/g, "$1 $2");
  const parts = normalized.split(/[^a-z0-9一-鿿㐀-䶿]+/u).filter(Boolean);
  const tokens = [];

  for (const part of parts) {
    if (/^[a-z0-9]+$/.test(part)) {
      if (part.length >= 2 && !STOP_WORDS.has(part)) tokens.push(part);
      continue;
    }

    const cjkRuns = part.match(/[一-鿿㐀-䶿]+/g) || [];
    for (const run of cjkRuns) {
      if (run.length === 1) {
        if (!STOP_WORDS.has(run)) tokens.push(run);
        continue;
      }
      if (run.length <= 4 && !STOP_WORDS.has(run)) tokens.push(run);
      for (let index = 0; index < run.length - 1; index += 1) {
        const bigram = run.slice(index, index + 2);
        if (!STOP_WORDS.has(bigram)) tokens.push(bigram);
      }
    }
  }

  return [...new Set(tokens)];
}

const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "都", "一个", "这", "那", "可以", "需要", "进行",
  "the", "a", "an", "is", "are", "to", "of", "in", "for", "and", "or", "with", "on", "this", "that"
]);
