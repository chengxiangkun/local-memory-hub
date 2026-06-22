import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { embedTexts, testEmbeddingProvider } from "./embedding-service.js";
import { saveProviderConfig } from "./model-config-store.js";
import { saveModelPolicy } from "./model-policy-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-embedding-"));
const originalFetch = globalThis.fetch;

try {
  await main();
  console.log("Embedding service test passed");
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  globalThis.fetch = originalFetch;
}

async function main() {
  const local = await embedTexts(["AI memory 中文"], dataDir, { provider_id: "local_weak" });
  assert(local.provider_id === "local_weak", "local provider should be selected");
  assert(local.embedding_model === "local-weak-bigram-v1", "local embedding model should be stable");
  assert(local.embedding_dimension === 32, "local embedding dimension should be stable");
  assert(local.fallback, "local weak embedding should be marked as fallback");
  assert(local.vectors[0].length === 32, "local vector should have 32 dimensions");

  await saveProviderConfig(
    {
      provider_id: "dashscope",
      base_url: "https://mock.local/v1",
      model: "qwen-plus",
      embedding_model: "text-embedding-v3",
      api_key: "secret"
    },
    dataDir
  );
  await saveModelPolicy({ task: "embedding", provider_id: "dashscope", mode: "balanced" }, dataDir);

  globalThis.fetch = async (url, options) => {
    assert(url === "https://mock.local/v1/embeddings", "embedding endpoint should use OpenAI-compatible path");
    assert(options.headers.authorization === "Bearer secret", "embedding request should use bearer token");
    const body = JSON.parse(options.body);
    assert(body.model === "text-embedding-v3", "embedding request should use configured embedding model");
    assert(Array.isArray(body.input), "embedding input should be an array");
    return {
      ok: true,
      json: async () => ({
        data: body.input.map((_, index) => ({ index, embedding: [index + 0.1, index + 0.2, index + 0.3] }))
      })
    };
  };

  const external = await embedTexts(["中英 graph memory", "第二条文本"], dataDir);
  assert(external.provider_id === "dashscope", "external embedding should follow policy");
  assert(external.embedding_model === "text-embedding-v3", "external embedding should expose model");
  assert(external.embedding_dimension === 3, "external embedding should expose response dimension");
  assert(!external.fallback, "external embedding should not be marked as fallback");
  assert(external.vectors.length === 2, "external embedding should preserve input count");

  const testResult = await testEmbeddingProvider({ provider_id: "dashscope" }, dataDir);
  assert(testResult.ok, "embedding provider test should succeed");
  assert(testResult.embedding_dimension === 3, "embedding provider test should return dimension");

  await saveModelPolicy({ task: "embedding", provider_id: "dashscope", mode: "fallback" }, dataDir);
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const fallback = await embedTexts(["外部失败时继续本地索引"], dataDir);
  assert(fallback.provider_id === "local_weak", "runtime embedding should fall back to local weak vectors");
  assert(fallback.fallback, "runtime fallback should be marked");

  let failed = false;
  try {
    await testEmbeddingProvider({ provider_id: "dashscope" }, dataDir);
  } catch {
    failed = true;
  }
  assert(failed, "explicit embedding provider test should not hide external failures");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
