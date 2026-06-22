import { getDataDir } from "./data-store.js";
import { loadLocalEnv } from "./local-env.js";
import { startLocalServices, stopLocalServices } from "./service-supervisor.js";

await loadLocalEnv();
const command = process.argv[2] || "start";
const dataDir = process.env.LMH_DATA_DIR || getDataDir();
const apiPort = Number(process.env.LMH_PORT || 4317);
const webPort = Number(process.env.LMH_WEB_PORT || 3100);
const projectRoot = process.cwd();

if (command === "stop") {
  const results = await stopLocalServices({ dataDir });
  console.log(JSON.stringify({ status: "stopped", results }, null, 2));
} else {
  try {
    if (command === "restart") {
      const results = await stopLocalServices({ dataDir });
      console.log(JSON.stringify({ status: "stopped", results }, null, 2));
    }
    const services = await startLocalServices({ dataDir, apiPort, webPort, projectRoot });
    console.log(`Local Memory Hub API: http://127.0.0.1:${apiPort}`);
    console.log(`Local Memory Hub Web: http://127.0.0.1:${webPort}`);
    await services.exitPromise;
  } catch (error) {
    if (error.message === "service_ports_unavailable") {
      console.error(`端口已被占用：API ${apiPort}，Web ${webPort}`);
      console.error(`先执行：lsof -ti tcp:${apiPort} -ti tcp:${webPort} | xargs kill`);
      process.exit(1);
    }
    throw error;
  }
}
