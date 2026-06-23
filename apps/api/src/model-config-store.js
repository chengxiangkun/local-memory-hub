import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, initDataDir } from "./data-store.js";
import { encryptSecret, decryptSecret } from "./secret-store.js";

export async function listProviderConfigs(dataDir = getDataDir()) {
  const configs = await readProviderConfigs(dataDir);
  return configs.map(toPublicConfig);
}

export async function getProviderConfig(providerId, dataDir = getDataDir()) {
  const configs = await readProviderConfigs(dataDir);
  const found = configs.find((item) => item.provider_id === providerId);
  if (!found) return null;
  // 落盘的是密文,供模型调用时解密为明文。
  return { ...found, api_key: await decryptSecret(found.api_key, dataDir) };
}

export async function saveProviderConfig(input, dataDir = getDataDir()) {
  if (!input.provider_id) throw new Error("模型配置缺少 provider_id");
  const configs = await readProviderConfigs(dataDir);
  const now = new Date().toISOString();
  const existing = configs.find((item) => item.provider_id === input.provider_id);
  const next = {
    provider_id: input.provider_id,
    base_url: input.base_url || existing?.base_url || "",
    model: input.model || existing?.model || "",
    embedding_model: input.embedding_model || existing?.embedding_model || "",
    // 新传入的明文 key 加密后落盘;未传则保留已有(已是密文)。
    api_key: input.api_key === undefined ? existing?.api_key || "" : await encryptSecret(input.api_key, dataDir),
    enabled: input.enabled !== false,
    updated_at: now,
    created_at: existing?.created_at || now
  };
  const merged = [next, ...configs.filter((item) => item.provider_id !== input.provider_id)];
  await writeProviderConfigs(merged, dataDir);
  return toPublicConfig(next);
}

export function providerConfigPath(dataDir = getDataDir()) {
  return path.join(dataDir, "config", "providers.local.json");
}

async function readProviderConfigs(dataDir) {
  await initDataDir(dataDir);
  try {
    const content = await readFile(providerConfigPath(dataDir), "utf8");
    const data = JSON.parse(content);
    return Array.isArray(data.providers) ? data.providers : [];
  } catch {
    return [];
  }
}

async function writeProviderConfigs(configs, dataDir) {
  await initDataDir(dataDir);
  const file = providerConfigPath(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ providers: configs }, null, 2));
  await chmod(file, 0o600).catch(() => {});
}

function toPublicConfig(config) {
  return {
    provider_id: config.provider_id,
    base_url: config.base_url || "",
    model: config.model || "",
    embedding_model: config.embedding_model || "",
    enabled: config.enabled !== false,
    has_api_key: Boolean(config.api_key),
    created_at: config.created_at,
    updated_at: config.updated_at
  };
}
