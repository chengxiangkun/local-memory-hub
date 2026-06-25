import assert from "node:assert";
import { rmSync } from "node:fs";
import { initModelProviders, routeChat } from "./model-provider.js";

const dataDir = `/tmp/lmh-cli-test-${Date.now()}`;
process.env.LMH_DATA_DIR = dataDir;

initModelProviders();

async function main() {
  // 用系统自带的 echo 当"假 CLI":base_url 指向 echo,args 会被原样打印 → stdout 非空 → answer
  const ok = await routeChat(
    { provider_id: "local_codex", question: "测试本地桥接", context: [], config: { base_url: "echo", model: "fake-cli" } },
    dataDir
  );
  assert(ok.provider_id === "local_codex", "provider_id 应为 local_codex");
  assert(ok.answer && ok.answer.length > 0, "echo 假 CLI 应返回非空 answer");
  assert(ok.answer.includes("exec"), "应能看到拼出的 codex exec 参数(证明 spawn 生效)");

  // 命令不存在 → 抛错且不崩
  let threw = false;
  try {
    await routeChat(
      { provider_id: "local_claude", question: "x", context: [], config: { base_url: "definitely-not-a-real-cmd-xyz123" } },
      dataDir
    );
  } catch (error) {
    threw = true;
    assert(/调用失败/.test(error.message), `错误信息应含"调用失败",实际:${error.message}`);
  }
  assert(threw, "不存在的命令应抛错而非崩溃");

  console.log("model-local-cli test passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
