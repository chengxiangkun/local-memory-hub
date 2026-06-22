import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getModelPolicy, listModelPolicies, saveModelPolicy } from "./model-policy-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-model-policy-"));

const defaults = await listModelPolicies(dataDir);
assert(defaults.some((item) => item.task === "chat" && item.provider_id === "mock"), "default chat policy should exist");
assert(
  defaults.some((item) => item.task === "embedding" && item.provider_id === "local_weak"),
  "default embedding policy should use local weak vectors"
);

await saveModelPolicy({ task: "chat", provider_id: "deepseek", mode: "save_tokens" }, dataDir);
const chat = await getModelPolicy("chat", dataDir);
assert(chat.provider_id === "deepseek", "saved chat provider should win");
assert(chat.mode === "save_tokens", "saved mode should win");

const parse = await getModelPolicy("parse_fallback", dataDir);
assert(parse.provider_id === "mock", "parse fallback should keep default");

const embedding = await getModelPolicy("embedding", dataDir);
assert(embedding.provider_id === "local_weak", "embedding policy should keep default");

console.log("Model policy store test passed");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
