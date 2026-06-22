import { getDataDir } from "./data-store.js";
import { checkServicePorts } from "./service-supervisor.js";
import { runSystemDoctor } from "./system-doctor.js";

const apiPort = Number(process.env.LMH_PORT || 4317);
const webPort = Number(process.env.LMH_WEB_PORT || 3100);
const dataDir = process.env.LMH_DATA_DIR || getDataDir();

const [doctor, ports] = await Promise.all([
  runSystemDoctor({ dataDir }),
  checkServicePorts({ apiPort, webPort })
]);

console.log(`数据目录：${dataDir}`);
console.log(`API 端口 ${apiPort}：${ports.api ? "可启动" : "已占用或不可用"}`);
console.log(`Web 端口 ${webPort}：${ports.web ? "可启动" : "已占用或不可用"}`);
console.log(`整体状态：${formatOverallStatus(doctor.overall_status)}`);

for (const check of doctor.checks) {
  console.log(`${formatCheckStatus(check)} ${check.label}：${check.message}`);
}

function formatOverallStatus(status) {
  if (status === "ok") return "正常";
  if (status === "degraded") return "可运行，部分能力缺失";
  return "阻塞";
}

function formatCheckStatus(check) {
  if (check.status === "ok") return "OK";
  if (check.required) return "缺失";
  return "可选";
}
