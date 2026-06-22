import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getProviderConfig,
  listProviderConfigs,
  providerConfigPath,
  saveProviderConfig
} from "./model-config-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-model-config-"));

const saved = await saveProviderConfig(
  {
    provider_id: "deepseek",
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    embedding_model: "text-embedding-v3",
    api_key: "secret-key"
  },
  dataDir
);

assert(saved.has_api_key, "public config should expose key presence");
assert(saved.api_key === undefined, "public config must not expose api key");
assert(saved.embedding_model === "text-embedding-v3", "public config should expose embedding model");

const configs = await listProviderConfigs(dataDir);
assert(configs.length === 1, "config should be listed");
assert(!JSON.stringify(configs).includes("secret-key"), "list must not expose api key");

const privateConfig = await getProviderConfig("deepseek", dataDir);
assert(privateConfig.api_key === "secret-key", "private config should keep api key for model call");
assert(privateConfig.embedding_model === "text-embedding-v3", "private config should keep embedding model");

const raw = await readFile(providerConfigPath(dataDir), "utf8");
assert(raw.includes("secret-key"), "spike config file stores key locally");

const fileMode = (await stat(providerConfigPath(dataDir))).mode & 0o777;
assert(fileMode === 0o600, `provider config should be owner-only, got ${fileMode.toString(8)}`);

console.log("Model config store test passed");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
