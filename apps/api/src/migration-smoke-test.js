import { writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = `http://127.0.0.1:${process.env.LMH_PORT || 4317}`;
const dataDir = process.env.LMH_DATA_DIR;

async function main() {
  if (!dataDir) throw new Error("LMH_DATA_DIR is required");

  const imported = await post("/api/import", {
    entrypoint: "onboarding",
    source_hint: "text",
    payload: {
      title: "升级保留测试",
      text: "升级后这条源资料应该仍然存在。"
    }
  });
  await post("/api/parse", { source_id: imported.source.source_id });

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

  const before = await get("/api/system/version");
  assert(before.needs_migration, "version should need migration");

  const migrated = await post("/api/system/migrate", {});
  assert(migrated.status === "migrated", "migration should run");
  assert(migrated.source_count_before === migrated.source_count_after, "source count should be preserved");

  const after = await get("/api/system/version");
  assert(!after.needs_migration, "version should be up to date");

  console.log("Migration smoke test passed");
  console.log(JSON.stringify(migrated, null, 2));
}

async function get(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`);
  return res.json();
}

async function post(pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
