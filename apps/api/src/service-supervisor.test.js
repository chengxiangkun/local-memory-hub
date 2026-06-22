import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkServicePorts, planLocalServices, servicePidFilePath, stopLocalServices } from "./service-supervisor.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-supervisor-"));

const ports = await checkServicePorts({ apiPort: 4498, webPort: 3298 });
if (!ports.api || !ports.web) throw new Error(`expected test ports to be available: ${JSON.stringify(ports)}`);

const restartPlan = planLocalServices({ api: true, web: false });
if (!restartPlan.api || restartPlan.web) {
  throw new Error(`expected start to recover missing API without restarting busy web: ${JSON.stringify(restartPlan)}`);
}

const pidFile = servicePidFilePath(dataDir);
if (!pidFile.endsWith(path.join("app-meta", "service-pids.json"))) {
  throw new Error(`unexpected pid path: ${pidFile}`);
}

await mkdir(path.dirname(pidFile), { recursive: true });
await writeFile(pidFile, JSON.stringify({ api: 99999999, web: 99999998 }));
const results = await stopLocalServices({ dataDir });
if (results.length !== 2 || results.some((item) => item.stopped)) {
  throw new Error(`expected stale pids to be cleaned: ${JSON.stringify(results)}`);
}

try {
  await readFile(pidFile, "utf8");
  throw new Error("expected pid file to be removed");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

console.log("ServiceSupervisor test passed");
