import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, initDataDir } from "./data-store.js";
import { dbPath, initSqlite, listSourcesSqlite } from "./sqlite-store.js";

const LATEST_SCHEMA_VERSION = 2;

export async function getVersionInfo(dataDir = getDataDir()) {
  await initDataDir(dataDir);
  const appVersion = await readJson(path.join(dataDir, "app-meta", "app-version.json"));
  const schemaVersion = await readJson(path.join(dataDir, "app-meta", "schema-version.json"));
  return {
    data_dir: dataDir,
    app_version: appVersion.app_version,
    schema_version: schemaVersion.schema_version,
    latest_schema_version: LATEST_SCHEMA_VERSION,
    needs_migration: schemaVersion.schema_version < LATEST_SCHEMA_VERSION
  };
}

export async function migrateIfNeeded(dataDir = getDataDir()) {
  await initDataDir(dataDir);
  await initSqlite(dataDir);
  const before = await getVersionInfo(dataDir);
  if (!before.needs_migration) {
    return { status: "up_to_date", ...before };
  }

  const backup = await backupBeforeMigration(dataDir);
  const startedAt = new Date().toISOString();
  const sourcesBefore = await listSourcesSqlite(dataDir);

  await writeJson(path.join(dataDir, "app-meta", "schema-version.json"), {
    schema_version: LATEST_SCHEMA_VERSION,
    compatible_app_version: "0.0.1",
    updated_at: new Date().toISOString()
  });

  const finishedAt = new Date().toISOString();
  await appendMigrationHistory(dataDir, {
    from_schema_version: before.schema_version,
    to_schema_version: LATEST_SCHEMA_VERSION,
    started_at: startedAt,
    finished_at: finishedAt,
    status: "success",
    backup
  });

  const sourcesAfter = await listSourcesSqlite(dataDir);
  return {
    status: "migrated",
    data_dir: dataDir,
    from_schema_version: before.schema_version,
    to_schema_version: LATEST_SCHEMA_VERSION,
    backup,
    source_count_before: sourcesBefore.length,
    source_count_after: sourcesAfter.length
  };
}

async function backupBeforeMigration(dataDir) {
  const backupDir = path.join(dataDir, "backups", `migration-${Date.now()}`);
  await mkdir(backupDir, { recursive: true });
  const db = dbPath(dataDir);
  const schemaFile = path.join(dataDir, "app-meta", "schema-version.json");
  const dbBackup = path.join(backupDir, "main.sqlite");
  const schemaBackup = path.join(backupDir, "schema-version.json");

  try {
    await copyFile(db, dbBackup);
  } catch {
    // DB may not exist yet.
  }
  await copyFile(schemaFile, schemaBackup);
  return backupDir;
}

async function appendMigrationHistory(dataDir, entry) {
  const file = path.join(dataDir, "app-meta", "migration-history.json");
  let history = [];
  try {
    history = JSON.parse(await readFile(file, "utf8"));
  } catch {
    history = [];
  }
  history.push(entry);
  await writeJson(file, history);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2));
}
