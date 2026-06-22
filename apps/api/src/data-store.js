import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { resolveDataDir } from "./data-dir-resolver.js";

export function getDataDir() {
  return resolveDataDir();
}

export function hashContent(input) {
  return createHash("sha256").update(input).digest("hex");
}

export async function initDataDir(dataDir = getDataDir()) {
  try {
    const dirs = [
      dataDir,
      path.join(dataDir, "app-meta"),
      path.join(dataDir, "raw", "files"),
      path.join(dataDir, "raw", "text"),
      path.join(dataDir, "raw", "links"),
      path.join(dataDir, "extracted", "text"),
      path.join(dataDir, "extracted", "audio"),
      path.join(dataDir, "database"),
      path.join(dataDir, "index"),
      path.join(dataDir, "graph"),
      path.join(dataDir, "config"),
      path.join(dataDir, "logs"),
      path.join(dataDir, "backups"),
      path.join(dataDir, "trash")
    ];

    await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));

    await writeJsonIfMissing(path.join(dataDir, "app-meta", "app-version.json"), {
      app_version: "0.0.1",
      build: "spike",
      updated_at: new Date().toISOString()
    });

    await writeJsonIfMissing(path.join(dataDir, "app-meta", "schema-version.json"), {
      schema_version: 1,
      compatible_app_version: "0.0.1",
      updated_at: new Date().toISOString()
    });

    await writeJsonIfMissing(sourceDbPath(dataDir), []);

    return {
      data_dir: dataDir,
      schema_version: 1
    };
  } catch (error) {
    throw new Error(`数据目录不可用：${dataDir}（${error.code || error.message}）`, { cause: error });
  }
}

export function sourceDbPath(dataDir = getDataDir()) {
  return path.join(dataDir, "database", "sources.json");
}

export async function readSources(dataDir = getDataDir()) {
  await initDataDir(dataDir);
  return JSON.parse(await readFile(sourceDbPath(dataDir), "utf8"));
}

export async function writeSources(sources, dataDir = getDataDir()) {
  const file = sourceDbPath(dataDir);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(sources, null, 2));
  await rename(tmp, file);
}

export async function addSource(source, dataDir = getDataDir()) {
  const sources = await readSources(dataDir);
  const existing = sources.find((item) => item.content_hash === source.content_hash);
  if (existing) {
    return {
      source: existing,
      duplicate: true
    };
  }
  sources.unshift(source);
  await writeSources(sources, dataDir);
  return {
    source,
    duplicate: false
  };
}

export async function writeRawText(sourceId, text, dataDir = getDataDir()) {
  const file = path.join(dataDir, "raw", "text", `${sourceId}.txt`);
  await writeFile(file, text);
  return file;
}

export async function writeRawLink(sourceId, url, dataDir = getDataDir()) {
  const file = path.join(dataDir, "raw", "links", `${sourceId}.url.txt`);
  await writeFile(file, url);
  return file;
}

export async function writeExtractedText(sourceId, text, dataDir = getDataDir()) {
  const file = path.join(dataDir, "extracted", "text", `${sourceId}.txt`);
  await writeFile(file, text);
  return file;
}

export async function copyRawFile(sourceId, filePath, dataDir = getDataDir()) {
  const ext = path.extname(filePath);
  const target = path.join(dataDir, "raw", "files", `${sourceId}${ext}`);
  await copyFile(filePath, target);
  return target;
}

export async function writeRawUploadedFile(sourceId, fileName, bytes, dataDir = getDataDir()) {
  const ext = path.extname(fileName);
  const target = path.join(dataDir, "raw", "files", `${sourceId}${ext}`);
  await writeFile(target, bytes);
  return target;
}

export async function moveToTrash(filePath, dataDir = getDataDir()) {
  if (!filePath) return null;
  const trashDir = path.join(dataDir, "trash");
  await mkdir(trashDir, { recursive: true });
  const target = path.join(trashDir, `${Date.now()}-${path.basename(filePath)}`);
  await rename(filePath, target);
  return target;
}

export async function hashFile(filePath) {
  return hashContent(await readFile(filePath));
}

export async function getFileInfo(filePath) {
  const fileStat = await stat(filePath);
  return {
    name: path.basename(filePath),
    size: fileStat.size
  };
}

export function createSourceRecord(input) {
  const now = new Date().toISOString();
  return {
    source_id: randomUUID(),
    title: input.title || "未命名源资料",
    source_type: input.source_type,
    source_platform: input.source_platform || "local",
    entrypoint: input.entrypoint,
    original_url: input.original_url || null,
    canonical_url: input.canonical_url || input.original_url || null,
    local_file_path: input.local_file_path || null,
    content_hash: input.content_hash,
    import_status: "saved",
    parse_status: "parse_pending",
    memory_status: "memory_pending",
    trace_status: "traceable",
    pollution_status: "clean",
    created_at: now,
    updated_at: now
  };
}

async function writeJsonIfMissing(file, value) {
  try {
    await readFile(file, "utf8");
  } catch {
    await writeFile(file, JSON.stringify(value, null, 2));
  }
}
