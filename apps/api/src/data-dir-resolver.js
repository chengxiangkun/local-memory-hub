import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveDataDir(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || os.platform();
  const homeDir = options.homeDir || os.homedir();
  const explicitDir = options.dataDir || env.LMH_DATA_DIR;

  if (explicitDir) return path.resolve(explicitDir);

  const defaultDir = getSystemDefaultDataDir({ env, platform, homeDir });
  const savedDir = readSavedDataDir(options.settingsFile || path.join(defaultDir, "config", "settings.json"));
  return savedDir ? path.resolve(savedDir) : defaultDir;
}

export function getSystemDefaultDataDir(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || os.platform();
  const homeDir = options.homeDir || os.homedir();

  if (platform === "darwin") return path.join(homeDir, "Library", "Application Support", "LocalMemoryHub");
  if (platform === "win32") return path.join(env.APPDATA || homeDir, "LocalMemoryHub");
  return path.join(homeDir, ".local", "share", "local-memory-hub");
}

function readSavedDataDir(settingsFile) {
  try {
    const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
    return typeof settings.data_dir === "string" && settings.data_dir.trim() ? settings.data_dir : null;
  } catch {
    return null;
  }
}
