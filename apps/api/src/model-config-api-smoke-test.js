import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listProviderConfigs, saveProviderConfig } from "./model-config-store.js";
import { listProviderTemplates } from "./model-provider.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-model-config-api-"));

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const saved = await saveProviderConfig(
    {
      provider_id: "deepseek",
      base_url: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      api_key: "api-key-must-not-leak"
    },
    dataDir
  );

  assert(saved.has_api_key, "saved config should report key presence");
  assert(!JSON.stringify(saved).includes("api-key-must-not-leak"), "save response must not leak api key");

  const configs = await listProviderConfigs(dataDir);
  assert(configs.some((item) => item.provider_id === "deepseek" && item.has_api_key), "config list should include deepseek");
  assert(!JSON.stringify(configs).includes("api-key-must-not-leak"), "config list must not leak api key");

  const deepseek = mergeProviderTemplatesWithConfigs(configs).find((item) => item.provider_id === "deepseek");
  assert(deepseek.configured, "provider list should mark deepseek configured");
  assert(deepseek.configured_model === "deepseek-chat", "provider list should expose configured model");
  assert(!JSON.stringify(deepseek).includes("api-key-must-not-leak"), "provider list must not leak api key");

  console.log("Model config API smoke test passed");
}

function mergeProviderTemplatesWithConfigs(configs) {
  return listProviderTemplates().map((template) => {
    const config = configs.find((item) => item.provider_id === template.provider_id);
    return {
      ...template,
      configured: Boolean(config?.enabled && (!template.requires_key || config.has_api_key)),
      configured_model: config?.model || "",
      configured_base_url: config?.base_url || ""
    };
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
