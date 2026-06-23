import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * 腾讯文档开放平台 OpenAPI v2 客户端。
 *
 * 鉴权三件套(请求头):Access-Token / Client-Id / Open-Id,从环境变量读取
 * (持久化在 .env.local)。⚠️ 腾讯文档每应用免费累计 20000 次 API 调用,这里做
 * ~4 QPS 节流并尽量减少调用(增量同步只拉变化文档)。
 *
 * 文档正文经"异步导出 → 轮询 → 下载 docx(zip)→ 抽取 word/document.xml 文本"获取。
 */

const BASE_URL = "https://docs.qq.com";
const API_URL = `${BASE_URL}/openapi/drive/v2`;
const execFileAsync = promisify(execFile);

const MIN_GAP_MS = 250;
let lastCallAt = 0;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, lastCallAt + MIN_GAP_MS - now);
  lastCallAt = now + wait;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export function hasTencentCreds() {
  return Boolean(process.env.TENCENT_ACCESS_TOKEN && process.env.TENCENT_CLIENT_ID && process.env.TENCENT_OPEN_ID);
}

function authHeaders() {
  return {
    "Access-Token": process.env.TENCENT_ACCESS_TOKEN,
    "Client-Id": process.env.TENCENT_CLIENT_ID,
    "Open-Id": process.env.TENCENT_OPEN_ID
  };
}

// 从腾讯文档文件夹链接中解析 folderID:.../folder/<id>。无 folder 段则返回 null(=根目录)。
export function extractTencentFolderId(url) {
  if (!url) return null;
  const match = String(url).match(/\/folder\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

async function apiGet(pathAndQuery) {
  await throttle();
  const res = await fetch(`${API_URL}${pathAndQuery}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (data.ret !== 0) {
    throw new Error(`腾讯文档 API 失败:${pathAndQuery} ret=${data.ret} ${data.msg || res.status}`);
  }
  return data.data || {};
}

async function apiPost(pathOnly, body) {
  await throttle();
  const res = await fetch(`${API_URL}${pathOnly}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (data.ret !== 0) {
    throw new Error(`腾讯文档 API 失败:${pathOnly} ret=${data.ret} ${data.msg || res.status}`);
  }
  return data.data || {};
}

// 列出文件夹(folderId 为空=根目录)直接子项,分页拉全。
export async function listTencentFolder(folderId, options = {}) {
  const limit = options.limit || 50;
  const items = [];
  let start = 0;
  // 安全上限:最多翻 10 页(500 项),避免误拉大量节点耗尽调用额度。
  for (let page = 0; page < 10; page += 1) {
    const segment = folderId ? `/folders/${encodeURIComponent(folderId)}` : "/folders";
    const data = await apiGet(`${segment}?sortType=browse&asc=0&start=${start}&limit=${limit}`);
    const list = data.list || [];
    for (const it of list) {
      items.push({
        id: it.ID,
        title: it.title,
        type: it.type,
        url: it.url,
        last_modify_time: String(it.lastModifyTime || "")
      });
    }
    if (!list.length || data.next === undefined || data.next === null || list.length < limit) break;
    start = data.next;
  }
  return items;
}

// 导出文档正文为纯文本(异步导出 docx → 轮询 → 下载 → 解压抽取)。
export async function exportTencentDocText(fileId) {
  const created = await apiPost(`/files/${encodeURIComponent(fileId)}/async-export`, { exportType: "md" });
  const operationID = created.operationID;
  if (!operationID) throw new Error("腾讯文档导出未返回 operationID");

  let downloadUrl = "";
  for (let i = 0; i < 15; i += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    const progress = await apiGet(`/files/${encodeURIComponent(fileId)}/export-progress?operationID=${operationID}`);
    if (progress.url) { downloadUrl = progress.url; break; }
  }
  if (!downloadUrl) throw new Error("腾讯文档导出超时,未取得下载链接");

  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`腾讯文档导出文件下载失败:${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  return docxBufferToText(buffer);
}

// 把 docx(zip)缓冲解压出 word/document.xml 并抽取段落文本。
async function docxBufferToText(buffer) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lmh-tencent-"));
  const file = path.join(dir, "doc.docx");
  try {
    await writeFile(file, buffer);
    const { stdout } = await execFileAsync("unzip", ["-p", file, "word/document.xml"], { maxBuffer: 64 * 1024 * 1024, encoding: "buffer" });
    const xml = stdout.toString("utf8");
    const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
    const lines = [];
    for (const p of paragraphs) {
      const runs = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
      const line = unescapeXml(runs.join("")).trim();
      if (line) lines.push(line);
    }
    return lines.join("\n").trim();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function unescapeXml(value) {
  return String(value)
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
