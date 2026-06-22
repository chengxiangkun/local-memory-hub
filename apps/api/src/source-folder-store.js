import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, initDataDir } from "./data-store.js";

const DEFAULT_FOLDERS = [
  { folder_id: "local-imports", parent_folder_id: null, name: "本地导入", origin: "local", sort_order: 10 },
  { folder_id: "feishu-space", parent_folder_id: null, name: "飞书空间", origin: "feishu", sort_order: 20 },
  { folder_id: "tencent-docs-space", parent_folder_id: null, name: "腾讯文档", origin: "tencent_docs", sort_order: 30 },
  { folder_id: "uncategorized", parent_folder_id: null, name: "未分类", origin: "local", sort_order: 999 }
];

export async function listSourceFolders(dataDir = getDataDir()) {
  const store = await readFolderStore(dataDir);
  return {
    folders: normalizeFolders(store.folders),
    assignments: store.assignments || {}
  };
}

export async function createSourceFolder(input, dataDir = getDataDir()) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("文件夹名称不能为空");
  const store = await readFolderStore(dataDir);
  const now = new Date().toISOString();
  const folder = {
    folder_id: randomUUID(),
    parent_folder_id: input.parent_folder_id || null,
    name,
    origin: input.origin || "local",
    external_parent_id: input.external_parent_id || null,
    sort_order: Number(input.sort_order || 100),
    created_at: now,
    updated_at: now
  };
  const folders = [...normalizeFolders(store.folders), folder];
  await writeFolderStore({ folders, assignments: store.assignments || {} }, dataDir);
  return folder;
}

export async function moveSourceToFolder(input, dataDir = getDataDir()) {
  if (!input.source_id) throw new Error("缺少 source_id");
  if (!input.folder_id) throw new Error("缺少 folder_id");
  const store = await readFolderStore(dataDir);
  const folders = normalizeFolders(store.folders);
  if (!folders.some((item) => item.folder_id === input.folder_id)) {
    throw new Error("目标文件夹不存在");
  }
  const assignments = {
    ...(store.assignments || {}),
    [input.source_id]: input.folder_id
  };
  await writeFolderStore({ folders, assignments }, dataDir);
  return {
    source_id: input.source_id,
    folder_id: input.folder_id
  };
}

export function sourceFolderPath(dataDir = getDataDir()) {
  return path.join(dataDir, "config", "source-folders.local.json");
}

async function readFolderStore(dataDir) {
  await initDataDir(dataDir);
  try {
    const content = await readFile(sourceFolderPath(dataDir), "utf8");
    const data = JSON.parse(content);
    return {
      folders: normalizeFolders(data.folders),
      assignments: data.assignments || {}
    };
  } catch {
    return {
      folders: normalizeFolders([]),
      assignments: {}
    };
  }
}

async function writeFolderStore(store, dataDir) {
  await initDataDir(dataDir);
  const file = sourceFolderPath(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(store, null, 2));
}

function normalizeFolders(folders) {
  const byId = new Map();
  for (const folder of DEFAULT_FOLDERS) {
    byId.set(folder.folder_id, withDates(folder));
  }
  for (const folder of folders || []) {
    byId.set(folder.folder_id, withDates(folder));
  }
  return [...byId.values()].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-CN"));
}

function withDates(folder) {
  const now = new Date().toISOString();
  return {
    external_parent_id: null,
    created_at: folder.created_at || now,
    updated_at: folder.updated_at || now,
    ...folder
  };
}
