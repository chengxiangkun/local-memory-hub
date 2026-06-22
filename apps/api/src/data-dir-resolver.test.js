import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getSystemDefaultDataDir, resolveDataDir } from "./data-dir-resolver.js";

const homeDir = path.join(os.tmpdir(), "lmh-home");
const env = {};

assertEqual(
  resolveDataDir({ dataDir: "./custom-data", env, homeDir, platform: "linux" }),
  path.resolve("./custom-data"),
  "explicit data dir wins"
);

assertEqual(
  resolveDataDir({ env: { LMH_DATA_DIR: "./env-data" }, homeDir, platform: "linux" }),
  path.resolve("./env-data"),
  "environment data dir wins"
);

assertEqual(
  getSystemDefaultDataDir({ env, homeDir, platform: "darwin" }),
  path.join(homeDir, "Library", "Application Support", "LocalMemoryHub"),
  "macOS default dir"
);

assertEqual(
  getSystemDefaultDataDir({ env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, homeDir, platform: "win32" }),
  path.join("C:\\Users\\me\\AppData\\Roaming", "LocalMemoryHub"),
  "Windows default dir"
);

const tmpDir = await mkdtemp(path.join(os.tmpdir(), "lmh-data-dir-"));
const settingsFile = path.join(tmpDir, "settings.json");
await writeFile(settingsFile, JSON.stringify({ data_dir: path.join(tmpDir, "saved") }));

assertEqual(
  resolveDataDir({ env, homeDir, platform: "linux", settingsFile }),
  path.join(tmpDir, "saved"),
  "saved data dir is used after explicit and env"
);

console.log("DataDirResolver test passed");

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}
