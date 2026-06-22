import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listModelPolicies, saveModelPolicy } from "./model-policy-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-model-policy-api-"));

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const before = await listModelPolicies(dataDir);
  assert(before.some((item) => item.task === "chat"), "default chat policy should exist");

  const saved = await saveModelPolicy(
    {
      task: "chat",
      provider_id: "deepseek",
      mode: "save_tokens"
    },
    dataDir
  );
  assert(saved.provider_id === "deepseek", "policy should save provider");

  const after = await listModelPolicies(dataDir);
  const chat = after.find((item) => item.task === "chat");
  assert(chat.provider_id === "deepseek", "saved policy should be returned");

  console.log("Model policy API smoke test passed");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
