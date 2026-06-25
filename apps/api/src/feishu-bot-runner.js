/**
 * 飞书 IM 机器人进程管理。
 *
 * 由 API 在本地启停 bot 长连接子进程,无需用户开终端跑命令。
 * 凭证用 connector-credentials 加密存储(FEISHU_BOT_APP_ID / FEISHU_BOT_APP_SECRET),
 * 启动时已解密进 process.env,子进程直接继承。
 * 日志写 <dataDir>/logs/feishu-bot.log。
 */

import { spawn } from "node:child_process";
import { openSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDataDir } from "./data-store.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// apps/api/src → apps/feishu-bot/src/index.js(开发态与打包后 apps/ 结构一致)。
const BOT_SCRIPT = path.resolve(SCRIPT_DIR, "../../feishu-bot/src/index.js");
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "../../..");

let child = null;

export function feishuBotConfigured() {
  return Boolean(process.env.FEISHU_BOT_APP_ID && process.env.FEISHU_BOT_APP_SECRET);
}

export function feishuBotStatus() {
  const running = Boolean(child && child.exitCode === null && !child.killed);
  return { configured: feishuBotConfigured(), running, pid: running ? child.pid : null };
}

export function startFeishuBot(dataDir = getDataDir()) {
  if (!feishuBotConfigured()) {
    return { ...feishuBotStatus(), error: "未配置飞书机器人 App ID / Secret" };
  }
  if (child && child.exitCode === null) return feishuBotStatus(); // 已在运行

  let stdio = "ignore";
  try {
    const logDir = path.join(dataDir, "logs");
    mkdirSync(logDir, { recursive: true });
    const fd = openSync(path.join(logDir, "feishu-bot.log"), "a");
    stdio = ["ignore", fd, fd];
  } catch {
    stdio = "ignore";
  }

  child = spawn(process.execPath, [BOT_SCRIPT], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio,
    windowsHide: true
  });
  child.once("exit", () => {
    child = null;
  });
  return feishuBotStatus();
}

export function stopFeishuBot() {
  if (child && child.exitCode === null) {
    child.kill();
    child = null;
  }
  return feishuBotStatus();
}
