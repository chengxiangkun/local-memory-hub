import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, initDataDir } from "./data-store.js";

const DEFAULT_POLICIES = [
  { task: "chat", provider_id: "mock", mode: "balanced" },
  { task: "parse_fallback", provider_id: "mock", mode: "balanced" },
  { task: "embedding", provider_id: "local_weak", mode: "fallback" }
];

export async function listModelPolicies(dataDir = getDataDir()) {
  const saved = await readPolicies(dataDir);
  return mergePolicies(saved);
}

export async function getModelPolicy(task, dataDir = getDataDir()) {
  return (await listModelPolicies(dataDir)).find((item) => item.task === task) || null;
}

export async function saveModelPolicy(input, dataDir = getDataDir()) {
  if (!input.task) throw new Error("模型策略缺少 task");
  if (!input.provider_id) throw new Error("模型策略缺少 provider_id");
  const policies = (await readPolicies(dataDir)).filter((item) => item.task !== input.task);
  const next = {
    task: input.task,
    provider_id: input.provider_id,
    mode: input.mode || "balanced",
    updated_at: new Date().toISOString()
  };
  await writePolicies([next, ...policies], dataDir);
  return next;
}

export function modelPolicyPath(dataDir = getDataDir()) {
  return path.join(dataDir, "config", "model-policies.json");
}

async function readPolicies(dataDir) {
  await initDataDir(dataDir);
  try {
    const content = await readFile(modelPolicyPath(dataDir), "utf8");
    const data = JSON.parse(content);
    return Array.isArray(data.policies) ? data.policies : [];
  } catch {
    return [];
  }
}

async function writePolicies(policies, dataDir) {
  await initDataDir(dataDir);
  const file = modelPolicyPath(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ policies }, null, 2));
}

function mergePolicies(saved) {
  return DEFAULT_POLICIES.map((policy) => saved.find((item) => item.task === policy.task) || policy)
    .concat(saved.filter((item) => !DEFAULT_POLICIES.some((policy) => policy.task === item.task)));
}
