import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export async function appendExternalCallLog(entry, dataDir) {
  if (!dataDir) return;
  const file = path.join(dataDir, "logs", "external-calls.log");
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(entry)}\n`);
}
