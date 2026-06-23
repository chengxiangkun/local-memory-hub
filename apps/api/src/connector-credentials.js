/**
 * 连接器凭证(飞书/腾讯文档)的本地加密存储,支持在 UI 配置而非手改 .env.local。
 *
 * - 保存:AES-256-GCM 加密(复用 secret-store)写入 <dataDir>/connector-credentials.json,
 *   同时写入 process.env 立即生效。
 * - 启动:loadConnectorCredentials 解密载入 process.env(在 loadLocalEnv 之后调用,
 *   故 UI 配置的凭证优先于 .env.local)。
 * - 对外只暴露"是否已配置"的状态,绝不返回明文。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { encryptSecret, decryptSecret } from "./secret-store.js";

export const CONNECTOR_CREDENTIAL_KEYS = {
  feishu: ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
  tencent_docs: ["TENCENT_CLIENT_ID", "TENCENT_ACCESS_TOKEN", "TENCENT_OPEN_ID"]
};

const ALL_KEYS = Object.values(CONNECTOR_CREDENTIAL_KEYS).flat();
const FILE_NAME = "connector-credentials.json";

function credentialPath(dataDir) {
  return path.join(dataDir, FILE_NAME);
}

async function readStore(dataDir) {
  try {
    return JSON.parse(await readFile(credentialPath(dataDir), "utf8"));
  } catch {
    return {};
  }
}

export async function loadConnectorCredentials(dataDir) {
  const store = await readStore(dataDir);
  for (const key of ALL_KEYS) {
    if (!store[key]) continue;
    try {
      process.env[key] = await decryptSecret(store[key], dataDir);
    } catch {
      /* 损坏的值忽略,回退到 .env.local */
    }
  }
}

export async function saveConnectorCredentials(values, dataDir) {
  const store = await readStore(dataDir);
  for (const key of ALL_KEYS) {
    const value = values?.[key];
    // 未提供或留空 → 保留原值(不清空已配置的凭证)
    if (value === undefined || value === null || String(value).trim() === "") continue;
    const trimmed = String(value).trim();
    store[key] = await encryptSecret(trimmed, dataDir);
    process.env[key] = trimmed;
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(credentialPath(dataDir), JSON.stringify(store, null, 2));
  return connectorCredentialStatus();
}

// 只返回每个 key 是否已配置,绝不返回明文。
export function connectorCredentialStatus() {
  const status = {};
  for (const key of ALL_KEYS) status[key] = Boolean(process.env[key]);
  return status;
}
