import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, initDataDir } from "./data-store.js";

export async function appendModelCallLog(entry, dataDir = getDataDir()) {
  await initDataDir(dataDir);
  const file = modelCallLogPath(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(sanitizeLogEntry(entry))}\n`);
}

export async function readModelCallLogs(dataDir = getDataDir()) {
  try {
    const content = await readFile(modelCallLogPath(dataDir), "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export function modelCallLogPath(dataDir = getDataDir()) {
  return path.join(dataDir, "logs", "model-calls.log");
}

function sanitizeLogEntry(value) {
  return JSON.parse(
    JSON.stringify(value, (key, item) => (key.toLowerCase().includes("api_key") ? "[redacted]" : item))
  );
}
