import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, initDataDir } from "./data-store.js";

const SUPPORTED_PLATFORMS = new Set(["feishu", "tencent_docs"]);

export async function listExternalConnectors(dataDir = getDataDir()) {
  const connectors = await readConnectors(dataDir);
  return connectors.map(toPublicConnector);
}

export async function saveExternalConnector(input, dataDir = getDataDir()) {
  if (!SUPPORTED_PLATFORMS.has(input.platform)) {
    throw new Error("暂只支持飞书和腾讯文档连接器");
  }
  const connectors = await readConnectors(dataDir);
  const now = new Date().toISOString();
  const existing = connectors.find((item) => item.platform === input.platform);
  const next = {
    connector_id: existing?.connector_id || randomUUID(),
    platform: input.platform,
    account_name: input.account_name || existing?.account_name || platformName(input.platform),
    root_url: input.root_url || existing?.root_url || "",
    auth_status: input.auth_status || existing?.auth_status || "disconnected",
    sync_mode: input.sync_mode || existing?.sync_mode || "manual",
    preserve_remote_structure: input.preserve_remote_structure !== false,
    sync_updates_as_revision: input.sync_updates_as_revision !== false,
    delete_remote_cleanup: input.delete_remote_cleanup === true,
    auto_sync_minutes: normalizeAutoSyncMinutes(
      input.auto_sync_minutes !== undefined ? input.auto_sync_minutes : existing?.auto_sync_minutes
    ),
    last_sync_at: existing?.last_sync_at || null,
    created_at: existing?.created_at || now,
    updated_at: now
  };
  const merged = [next, ...connectors.filter((item) => item.platform !== input.platform)];
  await writeConnectors(merged, dataDir);
  return toPublicConnector(next);
}

export async function markConnectorSync(input, dataDir = getDataDir()) {
  const connectors = await readConnectors(dataDir);
  const existing = connectors.find((item) => item.platform === input.platform);
  if (!existing) throw new Error("连接器未配置");
  if (existing.auth_status === "disconnected") throw new Error("连接器尚未授权，不能同步");
  const now = new Date().toISOString();
  const next = {
    ...existing,
    auth_status: "connected",
    last_sync_at: now,
    updated_at: now
  };
  const merged = [next, ...connectors.filter((item) => item.platform !== input.platform)];
  await writeConnectors(merged, dataDir);
  return {
    connector: toPublicConnector(next),
    result: {
      status: "queued",
      message: "同步任务已登记。真实平台 API 适配器接入后会在这里执行拉取。"
    }
  };
}

export function externalConnectorPath(dataDir = getDataDir()) {
  return path.join(dataDir, "config", "external-connectors.local.json");
}

async function readConnectors(dataDir) {
  await initDataDir(dataDir);
  try {
    const content = await readFile(externalConnectorPath(dataDir), "utf8");
    const data = JSON.parse(content);
    return Array.isArray(data.connectors) ? data.connectors : [];
  } catch {
    return [];
  }
}

async function writeConnectors(connectors, dataDir) {
  await initDataDir(dataDir);
  const file = externalConnectorPath(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ connectors }, null, 2), { mode: 0o600 });
  await chmod(file, 0o600).catch(() => {});
}

function toPublicConnector(connector) {
  return {
    connector_id: connector.connector_id,
    platform: connector.platform,
    display_name: platformName(connector.platform),
    account_name: connector.account_name,
    root_url: connector.root_url || "",
    auth_status: connector.auth_status,
    sync_mode: connector.sync_mode,
    preserve_remote_structure: connector.preserve_remote_structure !== false,
    sync_updates_as_revision: connector.sync_updates_as_revision !== false,
    delete_remote_cleanup: connector.delete_remote_cleanup === true,
    auto_sync_minutes: normalizeAutoSyncMinutes(connector.auto_sync_minutes),
    last_sync_at: connector.last_sync_at,
    created_at: connector.created_at,
    updated_at: connector.updated_at
  };
}

// 自动同步间隔(分钟)。0 表示关闭;最小 5 分钟,避免频繁拉取。
function normalizeAutoSyncMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.max(5, Math.min(1440, Math.round(minutes)));
}

function platformName(platform) {
  if (platform === "feishu") return "飞书文档";
  if (platform === "tencent_docs") return "腾讯文档";
  return platform;
}
