import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  addSource,
  copyRawFile,
  createSourceRecord,
  hashContent,
  initDataDir,
  readSources,
  sourceDbPath,
  writeExtractedText,
  writeRawLink,
  writeRawText
} from "./data-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-data-dir-"));

try {
  await main();
  console.log("Data directory smoke test passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  const info = await initDataDir(dataDir);
  assertEqual(info.data_dir, dataDir, "init should return data dir");
  assertEqual(info.schema_version, 1, "schema version should initialize");

  for (const relativePath of [
    "app-meta",
    "raw/files",
    "raw/text",
    "raw/links",
    "extracted/text",
    "database",
    "index",
    "graph",
    "config",
    "logs",
    "backups",
    "trash"
  ]) {
    await assertDirectory(path.join(dataDir, relativePath));
  }

  const appVersion = JSON.parse(await readFile(path.join(dataDir, "app-meta", "app-version.json"), "utf8"));
  const schemaVersion = JSON.parse(await readFile(path.join(dataDir, "app-meta", "schema-version.json"), "utf8"));
  assertEqual(appVersion.app_version, "0.0.1", "app version should initialize");
  assertEqual(schemaVersion.schema_version, 1, "schema version file should initialize");
  assertEqual(JSON.stringify(await readSources(dataDir)), "[]", "source db should initialize as empty array");

  const sourceId = "source-001";
  const rawTextFile = await writeRawText(sourceId, "第一条本地文本", dataDir);
  assertEqual(await readFile(rawTextFile, "utf8"), "第一条本地文本", "raw text should be persisted");

  const rawLinkFile = await writeRawLink(sourceId, "https://example.com/a?b=1", dataDir);
  assertEqual(await readFile(rawLinkFile, "utf8"), "https://example.com/a?b=1", "raw link should be persisted");

  const extractedFile = await writeExtractedText(sourceId, "抽取后的文本", dataDir);
  assertEqual(await readFile(extractedFile, "utf8"), "抽取后的文本", "extracted text should be persisted");

  const sourceFile = path.join(dataDir, "fixture.txt");
  await writeFile(sourceFile, "文件字节内容");
  const copiedFile = await copyRawFile(sourceId, sourceFile, dataDir);
  assertEqual(await readFile(copiedFile, "utf8"), "文件字节内容", "raw file should be copied");

  const record = createSourceRecord({
    title: "重复检测",
    source_type: "text",
    entrypoint: "data_dir_smoke_test",
    content_hash: hashContent("same content")
  });
  const first = await addSource(record, dataDir);
  const second = await addSource({ ...record, source_id: "different-id" }, dataDir);
  assertEqual(first.duplicate, false, "first source should be inserted");
  assertEqual(second.duplicate, true, "duplicate content should not insert twice");
  assertEqual((await readSources(dataDir)).length, 1, "duplicate source count should remain one");

  await assertPathExists(sourceDbPath(dataDir));

  const invalidDataDir = path.join(dataDir, "not-a-directory");
  await writeFile(invalidDataDir, "this path is a file");
  try {
    await initDataDir(invalidDataDir);
    throw new Error("expected invalid data dir to fail");
  } catch (error) {
    if (!error.message.includes("数据目录不可用")) throw error;
  }
}

async function assertDirectory(dir) {
  const fileStat = await stat(dir);
  if (!fileStat.isDirectory()) throw new Error(`expected directory: ${dir}`);
}

async function assertPathExists(file) {
  await stat(file);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}
