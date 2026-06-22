#!/usr/bin/env node

import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { resolveDataDir as resolveRuntimeDataDir } from "../../../apps/api/src/data-dir-resolver.js";
import {
  checkServicePorts,
  startLocalServices,
  stopLocalServices
} from "../../../apps/api/src/service-supervisor.js";

const COMMANDS = new Set(["start", "stop", "doctor", "data-dir", "help"]);
const args = process.argv.slice(2);
const command = COMMANDS.has(args[0]) ? args[0] : "help";
const options = parseOptions(args.slice(command === "help" ? 0 : 1));

const projectRoot = await findProjectRoot();
const dataDir = resolveDataDir(options);
const apiPort = Number(options.port || process.env.LMH_PORT || 4317);
const webPort = Number(options.webPort || process.env.LMH_WEB_PORT || 3100);

if (command === "help") {
  printHelp();
} else if (command === "data-dir") {
  await handleDataDir();
} else if (command === "doctor") {
  await handleDoctor();
} else if (command === "stop") {
  await handleStop();
} else if (command === "start") {
  await handleStart();
}

async function handleStart() {
  await mkdir(dataDir, { recursive: true });
  console.log("Local Memory Hub CLI Spike");
  console.log(`数据目录：${dataDir}`);
  console.log(`API：http://127.0.0.1:${apiPort}`);
  console.log(`Web：http://127.0.0.1:${webPort}`);
  console.log("按 Ctrl+C 停止本地服务。");

  let services;
  try {
    services = await startLocalServices({ dataDir, apiPort, webPort, projectRoot });
  } catch (error) {
    if (error.message === "service_ports_unavailable") {
      console.error(`端口不可用：API ${error.ports.api ? "可用" : "占用"}，Web ${error.ports.web ? "可用" : "占用"}`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const shutdown = async () => {
    await services.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await services.exitPromise;
  await services.stop();
}

async function handleStop() {
  const results = await stopLocalServices({ dataDir });
  if (results.length === 0) {
    console.log("没有找到由 CLI Spike 启动的服务记录。");
    return;
  }
  for (const result of results) {
    if (result.stopped) {
      console.log(`已停止 ${result.name} 服务：pid=${result.pid}`);
    } else {
      console.log(`${result.name} 服务无需停止：pid=${result.pid} ${result.error}`);
    }
  }
}

async function handleDoctor() {
  await mkdir(dataDir, { recursive: true });
  const ports = await checkServicePorts({ apiPort, webPort });
  const checks = [
    ["Node 版本", Number(process.versions.node.split(".")[0]) >= 20, process.version],
    ["项目根目录", Boolean(projectRoot), projectRoot],
    ["数据目录", Boolean(await realpath(dataDir).catch(() => "")), dataDir],
    [`API 端口 ${apiPort}`, ports.api, ports.api ? "未占用" : "已占用"],
    [`Web 端口 ${webPort}`, ports.web, ports.web ? "未占用" : "已占用"]
  ];
  let ok = true;
  for (const [name, pass, detail] of checks) {
    ok = ok && pass;
    console.log(`${pass ? "✓" : "✗"} ${name}：${detail}`);
  }
  process.exitCode = ok ? 0 : 1;
}

async function handleDataDir() {
  await mkdir(dataDir, { recursive: true });
  console.log(dataDir);
}

function parseOptions(rawArgs) {
  const result = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const item = rawArgs[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = rawArgs[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function resolveDataDir(parsedOptions) {
  return resolveRuntimeDataDir({ dataDir: parsedOptions.dataDir });
}

async function findProjectRoot() {
  let currentDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
  for (let index = 0; index < 6; index += 1) {
    const candidate = path.join(currentDir, "package.json");
    const packageJson = await import(`file://${candidate}`, { with: { type: "json" } }).catch(() => null);
    if (packageJson?.default?.name === "local-memory-hub") return currentDir;
    currentDir = path.dirname(currentDir);
  }
  throw new Error("无法定位 local-memory-hub 项目根目录");
}

function printHelp() {
  console.log(`Local Memory Hub CLI Spike

用法：
  lmh-spike start [--data-dir DIR] [--port PORT] [--web-port PORT]
  lmh-spike stop [--data-dir DIR]
  lmh-spike doctor [--data-dir DIR] [--port PORT] [--web-port PORT]
  lmh-spike data-dir [--data-dir DIR]
`);
}
