import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { getVersionInfo, migrateIfNeeded } from "./migration-service.js";
import { initModelProviders } from "./model-provider.js";
import { parseSource } from "./parser-service.js";
import { listMemorySegments, listVectors } from "./sqlite-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-migration-"));

try {
  await main();
  console.log("Migration smoke test passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  initModelProviders();
  await initDataDir(dataDir);
  const imported = await handleImport(
    {
      entrypoint: "migration_smoke_test",
      source_hint: "text",
      payload: {
        title: "升级保留测试",
        text: "升级后这条源资料应该仍然存在。"
      }
    },
    dataDir
  );
  await parseSource(imported.source.source_id, {}, dataDir);

  await mkdir(path.join(dataDir, "app-meta"), { recursive: true });
  await writeFile(
    path.join(dataDir, "app-meta", "schema-version.json"),
    JSON.stringify(
      {
        schema_version: 1,
        compatible_app_version: "0.0.1",
        updated_at: new Date().toISOString()
      },
      null,
      2
    )
  );

  const before = await getVersionInfo(dataDir);
  assert(before.needs_migration, "version should need migration");

  const migrated = await migrateIfNeeded(dataDir);
  assert(migrated.status === "migrated", "migration should run");
  assert(migrated.source_count_before === migrated.source_count_after, "source count should be preserved");

  const after = await getVersionInfo(dataDir);
  assert(!after.needs_migration, "version should be up to date");
  assert(after.schema_version === 4, "migration should update to schema version 4");
  const segments = await listMemorySegments(imported.source.source_id, dataDir);
  assert(segments[0].content_hash, "migration should expose segment content hash");
  assert(segments[0].parser_version, "migration should expose segment parser version");
  assert(segments[0].updated_at, "migration should expose segment updated_at");
  const vectors = await listVectors(dataDir);
  assert(vectors[0].embedding_model, "migration should expose vector embedding model");
  assert(vectors[0].embedding_dimension, "migration should expose vector embedding dimension");
  console.log(JSON.stringify(migrated, null, 2));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
