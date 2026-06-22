import { getProviderConfig } from "./model-config-store.js";
import { getModelPolicy } from "./model-policy-store.js";
import { listProviderTemplates } from "./model-provider.js";
import { getDataDir } from "./data-store.js";
import { extractMultilingualTokens } from "./text-tokenizer.js";

const LOCAL_WEAK_DIMENSIONS = 32;

export async function embedTexts(texts, dataDir = getDataDir(), options = {}) {
  const normalizedTexts = texts.map((text) => String(text || ""));
  const policy = options.policy || await getModelPolicy("embedding", dataDir);
  const providerId = options.provider_id || policy?.provider_id || "local_weak";
  if (providerId === "local_weak") {
    return buildEmbeddingResult({
      providerId,
      model: "local-weak-bigram-v1",
      vectors: normalizedTexts.map(embedLocalWeak),
      fallback: true
    });
  }

  try {
    const config = options.config || await resolveEmbeddingConfig(providerId, dataDir);
    const vectors = await callOpenAICompatibleEmbeddings(normalizedTexts, config, providerId);
    return buildEmbeddingResult({
      providerId,
      model: config.model,
      vectors,
      fallback: false
    });
  } catch (error) {
    if (options.allow_fallback === false || policy?.mode !== "fallback") throw error;
    return buildEmbeddingResult({
      providerId: "local_weak",
      model: "local-weak-bigram-v1",
      vectors: normalizedTexts.map(embedLocalWeak),
      fallback: true,
      fallbackReason: error.message
    });
  }
}

export async function testEmbeddingProvider(input = {}, dataDir = getDataDir()) {
  const result = await embedTexts([input.text || "AI记忆图谱需要理解 graph memory 和中文主题。"], dataDir, {
    provider_id: input.provider_id,
    config: input.config,
    allow_fallback: false
  });
  return {
    ok: true,
    provider_id: result.provider_id,
    embedding_model: result.embedding_model,
    embedding_dimension: result.embedding_dimension,
    fallback: result.fallback
  };
}

async function resolveEmbeddingConfig(providerId, dataDir) {
  const saved = await getProviderConfig(providerId, dataDir);
  const template = listProviderTemplates().find((item) => item.provider_id === providerId);
  const baseUrl = saved?.base_url || template?.default_base_url;
  const apiKey = saved?.api_key;
  const model = saved?.embedding_model || saved?.model || template?.default_embedding_model || template?.default_model;
  if (!baseUrl || !apiKey || !model) {
    throw new Error(`${template?.display_name || providerId} embedding 需要 base_url、api_key 和 model`);
  }
  return { base_url: baseUrl, api_key: apiKey, model };
}

async function callOpenAICompatibleEmbeddings(texts, config, providerId) {
  const res = await fetch(`${config.base_url.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.api_key}`
    },
    body: JSON.stringify({
      model: config.model,
      input: texts
    })
  });
  if (!res.ok) throw new Error(`${providerId} embedding 调用失败：${res.status}`);
  const data = await res.json();
  const vectors = (data.data || [])
    .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
    .map((item) => item.embedding);
  if (vectors.length !== texts.length || vectors.some((vector) => !Array.isArray(vector))) {
    throw new Error(`${providerId} embedding 响应格式不正确`);
  }
  return vectors;
}

function buildEmbeddingResult({ providerId, model, vectors, fallback }) {
  const dimension = vectors[0]?.length || 0;
  return {
    provider_id: providerId,
    embedding_model: model,
    embedding_dimension: dimension,
    vectors,
    fallback
  };
}

function embedLocalWeak(text) {
  const vector = Array.from({ length: LOCAL_WEAK_DIMENSIONS }, () => 0);
  const tokens = extractMultilingualTokens(text);

  for (const token of tokens.length ? tokens : [String(text)]) {
    const index = Math.abs(hash(token)) % LOCAL_WEAK_DIMENSIONS;
    vector[index] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function hash(input) {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = (value << 5) - value + input.charCodeAt(i);
    value |= 0;
  }
  return value;
}
