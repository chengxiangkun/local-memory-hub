import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleImport } from "./import-pipeline.js";
import { moveToTrash } from "./data-store.js";
import { getSourceById, initSqlite, markSourceDeleted, markSourceExternalDeleted, quarantineSourceCascade } from "./sqlite-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-delete-scope-"));

const file = path.join(dataDir, "delete-me.md");
await writeFile(file, "删除范围测试");
await initSqlite(dataDir);

const imported = await handleImport(
  {
    entrypoint: "delete_scope_test",
    source_hint: "file",
    payload: { title: "删除范围测试", file_path: file }
  },
  dataDir
);

const source = await getSourceById(imported.source.source_id, dataDir);
const trashPath = await moveToTrash(source.local_file_path, dataDir);
await markSourceExternalDeleted(source.source_id, dataDir);
const externalDeleted = await getSourceById(source.source_id, dataDir);
assert(externalDeleted.trace_status === "external_deleted", "external deletion should be visible");
assert(externalDeleted.import_status === "saved", "external deletion should not delete local source");

await quarantineSourceCascade(source.source_id, dataDir);
await markSourceDeleted(source.source_id, dataDir);

const deleted = await getSourceById(source.source_id, dataDir);
assert(deleted.import_status === "deleted", "source should be marked deleted");
assert(deleted.pollution_status === "quarantined", "deleted source should be quarantined");
assert((await readFile(trashPath, "utf8")).includes("删除范围测试"), "source file should move to trash");

console.log("Delete scope smoke test passed");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
