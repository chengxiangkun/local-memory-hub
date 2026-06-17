import { randomUUID } from "node:crypto";
import { insertVectors, listVectors } from "./sqlite-store.js";
import { getDataDir } from "./data-store.js";

const DIMENSIONS = 32;

export async function indexSegments(segments, dataDir = getDataDir()) {
  const now = new Date().toISOString();
  const vectors = segments.map((segment) => ({
    vector_id: randomUUID(),
    source_id: segment.source_id,
    segment_id: segment.segment_id,
    vector_json: JSON.stringify(embedText(segment.text)),
    pollution_status: "clean",
    created_at: now
  }));
  await insertVectors(vectors, dataDir);
  return vectors;
}

export async function vectorSearch(query, dataDir = getDataDir()) {
  const queryVector = embedText(query);
  const vectors = await listVectors(dataDir);
  return vectors
    .map((item) => ({
      source_id: item.source_id,
      segment_id: item.segment_id,
      title: item.title,
      text: item.text,
      score: cosine(queryVector, JSON.parse(item.vector_json))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function embedText(text) {
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  const tokens = String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  for (const token of tokens.length ? tokens : [String(text)]) {
    const index = Math.abs(hash(token)) % DIMENSIONS;
    vector[index] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function cosine(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function hash(input) {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = (value << 5) - value + input.charCodeAt(i);
    value |= 0;
  }
  return value;
}
