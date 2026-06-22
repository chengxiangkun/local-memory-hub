import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initDataDir } from "./data-store.js";
import { readModelCallLogs } from "./model-call-log.js";
import { initModelProviders, routeChat } from "./model-provider.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-model-provider-"));
process.env.LMH_DATA_DIR = dataDir;
globalThis.fetch = async (url, options = {}) => {
  assert(String(url).endsWith("/chat/completions"), "compatible adapter should call chat completions");
  assert(options.headers?.authorization?.startsWith("Bearer "), "compatible adapter should send bearer token");
  const body = JSON.parse(options.body || "{}");
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: `本地兼容模型响应：${body.model}` } }]
    })
  };
};

try {
  await initDataDir(dataDir);
  initModelProviders();

  const response = await routeChat(
    {
      provider_id: "deepseek",
      question: "测试 DeepSeek 兼容调用",
      context: [{ title: "测试资料", extracted_preview: "不要记录 api key" }],
      config: {
        base_url: "https://mock.local/v1",
        api_key: "secret-key-should-not-appear",
        model: "deepseek-test"
      }
    },
    dataDir
  );
  assert(response.answer.includes("deepseek-test"), "deepseek alias should use OpenAI-compatible adapter");

  try {
    await routeChat(
      {
        provider_id: "deepseek",
        question: "缺少 key",
        config: {
          base_url: "https://mock.local/v1",
          model: "deepseek-test"
        }
      },
      dataDir
    );
    throw new Error("expected missing api key to fail");
  } catch (error) {
    assert(error.message.includes("需要 base_url、api_key 和 model"), `unexpected error: ${error.message}`);
  }

  const logs = await readModelCallLogs(dataDir);
  assert(logs.length >= 2, "model calls should be logged");
  assert(logs.some((item) => item.status === "success"), "success call should be logged");
  assert(logs.some((item) => item.status === "failed"), "failed call should be logged");
  assert(!JSON.stringify(logs).includes("secret-key-should-not-appear"), "api key must not be logged");

  console.log("Model provider unit test passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
