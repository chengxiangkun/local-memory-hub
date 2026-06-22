import { randomUUID } from "node:crypto";
import { clearVectors, insertVectors, listMemorySegments, listSourcesSqlite, listVectors } from "./sqlite-store.js";
import { getDataDir } from "./data-store.js";
import { embedTexts } from "./embedding-service.js";
import { extractMultilingualTokens } from "./text-tokenizer.js";

export async function indexSegments(segments, dataDir = getDataDir()) {
  const now = new Date().toISOString();
  const embedded = await embedTexts(segments.map((segment) => segment.text), dataDir);
  const vectors = segments.map((segment, index) => ({
    vector_id: randomUUID(),
    source_id: segment.source_id,
    segment_id: segment.segment_id,
    vector_json: JSON.stringify(embedded.vectors[index]),
    embedding_provider: embedded.provider_id,
    embedding_model: embedded.embedding_model,
    embedding_dimension: embedded.embedding_dimension,
    chunk_hash: segment.content_hash || segment.segment_id,
    pollution_status: "clean",
    created_at: now
  }));
  await insertVectors(vectors, dataDir);
  return vectors;
}

export async function vectorSearch(query, dataDir = getDataDir(), options = {}) {
  const embedded = await embedTexts([query], dataDir);
  const queryVector = embedded.vectors[0];
  const queryTokens = extractMultilingualTokens(query);
  const vectors = await listVectors(dataDir);
  return vectors
    .filter((item) => options.includeConversationMemory !== false || item.entrypoint !== "qa_conversation")
    .filter((item) =>
      item.embedding_provider === embedded.provider_id &&
      item.embedding_model === embedded.embedding_model &&
      Number(item.embedding_dimension) === embedded.embedding_dimension
    )
    .map((item) => {
      const vectorScore = cosine(queryVector, JSON.parse(item.vector_json));
      const lexicalScore = tokenOverlap(queryTokens, extractMultilingualTokens(`${item.title} ${item.text}`));
      return {
        source_id: item.source_id,
        segment_id: item.segment_id,
        title: item.title,
        text: item.text,
        embedding_provider: item.embedding_provider,
        embedding_model: item.embedding_model,
        embedding_dimension: Number(item.embedding_dimension),
        score: vectorScore * 0.75 + lexicalScore * 0.25,
        vector_score: vectorScore,
        lexical_score: lexicalScore
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export async function rebuildVectorIndex(dataDir = getDataDir()) {
  await clearVectors(dataDir);
  const sources = (await listSourcesSqlite(dataDir)).filter((source) =>
    source.pollution_status !== "quarantined" && source.import_status !== "deleted"
  );
  let sourceCount = 0;
  let vectorCount = 0;
  let embeddingProvider = "";
  let embeddingModel = "";
  let embeddingDimension = 0;

  for (const source of sources) {
    const segments = await listMemorySegments(source.source_id, dataDir);
    if (segments.length === 0) continue;
    const vectors = await indexSegments(segments, dataDir);
    embeddingProvider = vectors[0]?.embedding_provider || embeddingProvider;
    embeddingModel = vectors[0]?.embedding_model || embeddingModel;
    embeddingDimension = vectors[0]?.embedding_dimension || embeddingDimension;
    sourceCount += 1;
    vectorCount += vectors.length;
  }

  return {
    status: "success",
    source_count: sourceCount,
    vector_count: vectorCount,
    embedding_provider: embeddingProvider,
    embedding_model: embeddingModel,
    embedding_dimension: embeddingDimension
  };
}

function tokenOverlap(leftTokens, rightTokens) {
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const right = new Set(rightTokens);
  const intersection = leftTokens.filter((token) => right.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function cosine(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}
