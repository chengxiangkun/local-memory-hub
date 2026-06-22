import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSourceFolder, listSourceFolders, moveSourceToFolder } from "./source-folder-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-folders-"));

const initial = await listSourceFolders(dataDir);
assert.ok(initial.folders.some((item) => item.folder_id === "uncategorized"));
assert.deepEqual(initial.assignments, {});

const folder = await createSourceFolder({ name: "产品资料" }, dataDir);
assert.equal(folder.name, "产品资料");

const moved = await moveSourceToFolder({ source_id: "source-1", folder_id: folder.folder_id }, dataDir);
assert.equal(moved.folder_id, folder.folder_id);

const after = await listSourceFolders(dataDir);
assert.equal(after.assignments["source-1"], folder.folder_id);
assert.ok(after.folders.some((item) => item.name === "产品资料"));

console.log("source folder store test passed");
