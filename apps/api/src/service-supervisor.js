import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

export async function checkServicePorts(options) {
  const api = await isPortAvailable(options.apiPort);
  const web = await isPortAvailable(options.webPort);
  return { api, web };
}

export async function startLocalServices(options) {
  const ports = await checkServicePorts(options);
  const plan = planLocalServices(ports);
  if (!plan.api && !plan.web) {
    const error = new Error("service_ports_unavailable");
    error.ports = ports;
    throw error;
  }

  const env = {
    ...process.env,
    LMH_DATA_DIR: options.dataDir,
    LMH_PORT: String(options.apiPort),
    LMH_WEB_PORT: String(options.webPort)
  };
  const api = plan.api ? spawnService("apps/api/src/server.js", options, env) : null;
  const web = plan.web ? spawnService("apps/web/src/server.js", options, env) : null;

  await writePidFile(options.dataDir, {
    api: api?.pid,
    web: web?.pid,
    apiPort: options.apiPort,
    webPort: options.webPort,
    dataDir: options.dataDir
  });

  return {
    stop: async () => {
      if (api) killChild(api);
      if (web) killChild(web);
      await removePidFile(options.dataDir);
    },
    exitPromise: Promise.race([
      api ? onceExit(api, "api") : never(),
      web ? onceExit(web, "web") : never()
    ])
  };
}

export function planLocalServices(ports) {
  return {
    api: Boolean(ports.api),
    web: Boolean(ports.web)
  };
}

export async function stopLocalServices(options) {
  const pidInfo = await readPidFile(options.dataDir);
  if (!pidInfo) return [];

  const results = [];
  for (const [name, pid] of Object.entries({ api: pidInfo.api, web: pidInfo.web })) {
    if (!pid) continue;
    try {
      process.kill(pid, "SIGTERM");
      results.push({ name, pid, stopped: true });
    } catch (error) {
      results.push({ name, pid, stopped: false, error: error.code || error.message });
    }
  }
  if (results.every((item) => item.stopped || item.error === "ESRCH")) {
    await removePidFile(options.dataDir);
  }
  return results;
}

export function servicePidFilePath(dataDir) {
  return path.join(dataDir, "app-meta", "service-pids.json");
}

async function writePidFile(dataDir, value) {
  await mkdir(path.dirname(servicePidFilePath(dataDir)), { recursive: true });
  await writeFile(servicePidFilePath(dataDir), JSON.stringify(value, null, 2));
}

async function readPidFile(dataDir) {
  try {
    return JSON.parse(await readFile(servicePidFilePath(dataDir), "utf8"));
  } catch {
    return null;
  }
}

async function removePidFile(dataDir) {
  await rm(servicePidFilePath(dataDir), { force: true });
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function killChild(child) {
  if (!child.killed) child.kill("SIGTERM");
}

function spawnService(script, options, env) {
  return spawn(process.execPath, [script], {
    cwd: options.projectRoot,
    env,
    stdio: options.stdio || "inherit"
  });
}

function onceExit(child, name) {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      resolve({ name, code, signal });
    });
  });
}

function never() {
  return new Promise(() => {});
}
