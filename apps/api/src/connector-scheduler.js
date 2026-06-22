import { listExternalConnectors } from "./external-connector-store.js";

/**
 * 轻量连接器自动同步调度器(进程内,本地优先,不用 webhook)。
 *
 * 根据每个连接器的 auto_sync_minutes 起 setInterval 定时触发同步;
 * auto_sync_minutes <= 0 表示关闭。连接器配置变更后调用 armConnectorSchedules
 * 重新编排。失败只记录,不影响主流程。
 */

const timers = new Map(); // platform -> intervalId

export async function armConnectorSchedules(dataDir, runSync) {
  // 清掉旧定时器
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();

  let connectors = [];
  try {
    connectors = await listExternalConnectors(dataDir);
  } catch {
    return;
  }

  for (const connector of connectors) {
    const minutes = Number(connector.auto_sync_minutes || 0);
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    if (connector.auth_status !== "connected") continue;
    const intervalMs = minutes * 60 * 1000;
    const timer = setInterval(() => {
      Promise.resolve(runSync(connector.platform)).catch((error) => {
        console.error(`连接器自动同步失败(${connector.platform})`, error.message);
      });
    }, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    timers.set(connector.platform, timer);
  }
  return timers.size;
}

export function clearConnectorSchedules() {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
}
