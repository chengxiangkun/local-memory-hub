/**
 * 组装自包含运行时:把当前平台的 node 二进制 + 工程 + 依赖复制到
 * apps/desktop/src-tauri/runtime/,供 Tauri 作为 resources 打进 .app / .exe,
 * 实现脱离仓库的"开箱即用"。在每个平台(本机 / CI runner)各自运行,
 * 这样原生模块(better-sqlite3 / onnxruntime)二进制与平台匹配。
 */
import { cp, mkdir, rm, copyFile, chmod, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // apps/desktop
const repo = path.resolve(here, "../..");                  // 仓库根
const out = path.join(here, "src-tauri", "runtime");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// 1) node 二进制(当前运行的 node,平台/架构正确)
const nodeName = process.platform === "win32" ? "node.exe" : "node";
await copyFile(process.execPath, path.join(out, nodeName));
if (process.platform !== "win32") await chmod(path.join(out, nodeName), 0o755);

// 2) 工程文件(排除桌面构建产物 / 桌面自身)
for (const dir of ["apps/api", "apps/web", "apps/mcp", "packages"]) {
  const src = path.join(repo, dir);
  try { await stat(src); } catch { continue; }
  await cp(src, path.join(out, dir), { recursive: true });
}
for (const f of ["package.json", "package-lock.json"]) {
  await copyFile(path.join(repo, f), path.join(out, f)).catch(() => {});
}

// 3) 依赖(含原生 .node;排除桌面/CLI 开发依赖以减小体积)
await cp(path.join(repo, "node_modules"), path.join(out, "node_modules"), {
  recursive: true,
  filter: (s) => !s.includes(`${path.sep}@tauri-apps${path.sep}cli`)
});

console.log("[stage-runtime] 运行时已组装:", out);
