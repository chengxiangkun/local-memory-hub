import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initDataDir } from "./data-store.js";
import { saveProviderConfig } from "./model-config-store.js";
import { resolveModelConfig } from "./model-config-resolver.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-model-config-resolver-"));
process.env.LMH_DATA_DIR = dataDir;

try {
  await initDataDir(dataDir);
  await saveProviderConfig(
    {
      provider_id: "deepseek",
      base_url: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      api_key: "secret-key",
      enabled: true
    },
    dataDir
  );

  // 回归核心：请求未带 provider_id，但调用方传入了已生效的 providerId（来自 chat 策略）。
  // 修复前 resolveModelConfig 会按默认 mock 解析为空，导致 deepseek key 永远加载不到。
  const resolved = await resolveModelConfig({ question: "x" }, dataDir, "deepseek");
  assert(resolved.base_url === "https://api.deepseek.com/v1", "应加载已生效 provider 的 base_url");
  assert(resolved.api_key === "secret-key", "应加载已生效 provider 的 api_key");
  assert(resolved.model === "deepseek-chat", "应加载已生效 provider 的 model");

  // 显式 body.config 优先级最高，直接透传。
  const overridden = await resolveModelConfig(
    { config: { base_url: "https://override.local/v1", api_key: "k", model: "m" } },
    dataDir,
    "deepseek"
  );
  assert(overridden.base_url === "https://override.local/v1", "body.config 应优先于已保存配置");

  // 生效 providerId 优先于 body.provider_id，二者不一致时以前者为准。
  const policyWins = await resolveModelConfig({ provider_id: "mock" }, dataDir, "deepseek");
  assert(policyWins.api_key === "secret-key", "生效 providerId 应优先于 body.provider_id");

  // 未传 providerId 时回退到 body.provider_id，保持向后兼容。
  const bodyFallback = await resolveModelConfig({ provider_id: "deepseek" }, dataDir);
  assert(bodyFallback.model === "deepseek-chat", "缺省 providerId 时应回退到 body.provider_id");

  // 无对应保存配置时返回空对象，由下游 provider 给出明确报错。
  const unknown = await resolveModelConfig({}, dataDir, "no-such-provider");
  assert(Object.keys(unknown).length === 0, "未配置 provider 应返回空对象");

  console.log("Model config resolver test passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
