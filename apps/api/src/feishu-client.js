const FEISHU_BASE_URL = "https://open.feishu.cn";

// 飞书频控(2026-06 核对):多级限频,典型 1000 次/分 + 50 次/秒;修改节点
// 状态/结构类接口更严(5 QPS + 每日 10000 次);超限返回 HTTP 429 并带建议等待。
// 飞书无"终身累计总次数"限制,按 QPS/QPM/每日 维度。tenant_access_token 有效期约
// 2 小时,这里做缓存复用,避免每次同步/解析都重新换取,显著减少调用次数。
// 为安全留足余量,所有调用经过 ~4 QPS 的串行节流。
const MIN_CALL_GAP_MS = 250;
let lastCallAt = 0;
const tokenCache = new Map(); // appId -> { token, expireAt }

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, lastCallAt + MIN_CALL_GAP_MS - now);
  lastCallAt = now + wait;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export function extractFeishuDocxToken(url) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const docxIndex = parts.indexOf("docx");
  if (docxIndex < 0 || !parts[docxIndex + 1]) throw new Error("不是有效的飞书 docx 链接");
  return parts[docxIndex + 1];
}

export function extractFeishuWikiToken(url) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const wikiIndex = parts.indexOf("wiki");
  if (wikiIndex < 0 || !parts[wikiIndex + 1]) throw new Error("不是有效的飞书 wiki 链接");
  return parts[wikiIndex + 1];
}

export async function getFeishuTenantAccessToken({ appId, appSecret }) {
  if (!appId || !appSecret) throw new Error("缺少飞书 APP_ID 或 APP_SECRET");
  const cached = tokenCache.get(appId);
  // 提前 2 分钟过期,避免边界失效。
  if (cached && cached.expireAt > Date.now() + 120000) return cached.token;
  const data = await feishuPost("/open-apis/auth/v3/tenant_access_token/internal", {
    app_id: appId,
    app_secret: appSecret
  });
  if (!data.tenant_access_token) throw new Error(`飞书 token 响应缺少 tenant_access_token：${data.msg || data.code}`);
  const expireSeconds = Number(data.expire) > 0 ? Number(data.expire) : 7200;
  tokenCache.set(appId, { token: data.tenant_access_token, expireAt: Date.now() + expireSeconds * 1000 });
  return data.tenant_access_token;
}

export async function fetchFeishuDocxBlocks({ tenantAccessToken, documentId }) {
  if (!tenantAccessToken) throw new Error("缺少飞书 tenant_access_token");
  if (!documentId) throw new Error("缺少飞书 document_id");

  const items = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({
      page_size: "500",
      document_revision_id: "-1"
    });
    if (pageToken) query.set("page_token", pageToken);
    const data = await feishuGet(`/open-apis/docx/v1/documents/${documentId}/blocks?${query}`, tenantAccessToken);
    items.push(...(data.items || []));
    pageToken = data.page_token || "";
  } while (pageToken);
  return items;
}

export async function resolveFeishuDocumentId({ tenantAccessToken, url }) {
  const parsed = new URL(url);
  if (parsed.pathname.includes("/docx/")) return extractFeishuDocxToken(url);
  if (!parsed.pathname.includes("/wiki/")) throw new Error("暂只支持飞书 docx/wiki 链接");

  const node = await fetchFeishuWikiNode({ tenantAccessToken, wikiToken: extractFeishuWikiToken(url) });
  if (node.obj_type !== "docx") {
    throw new Error(`飞书 wiki 节点不是 docx 文档：${node.obj_type || node.node_type || "unknown"}`);
  }
  return node.obj_token;
}

export async function resolveFeishuWikiNodeDocumentId({ tenantAccessToken, nodeToken }) {
  const node = await fetchFeishuWikiNode({ tenantAccessToken, wikiToken: nodeToken });
  if (node.obj_type !== "docx") return null;
  return node.obj_token;
}

export async function fetchFeishuWikiNode({ tenantAccessToken, wikiToken }) {
  if (!tenantAccessToken) throw new Error("缺少飞书 tenant_access_token");
  if (!wikiToken) throw new Error("缺少飞书 wiki token");
  try {
    const query = new URLSearchParams({ token: wikiToken });
    const data = await feishuGet(`/open-apis/wiki/v2/spaces/get_node?${query}`, tenantAccessToken);
    return data.node || data;
  } catch (error) {
    if (!error.message.includes("HTTP 404")) throw error;
  }

  const spaces = await fetchFeishuWikiSpaces({ tenantAccessToken });
  for (const space of spaces) {
    try {
      const data = await feishuGet(`/open-apis/wiki/v2/spaces/${space.space_id}/nodes/${wikiToken}`, tenantAccessToken);
      return data.node || data;
    } catch (error) {
      if (!error.message.includes("HTTP 404")) throw error;
    }
  }
  throw new Error(`飞书 wiki 节点不存在或当前应用无权访问：${wikiToken}`);
}

export async function fetchFeishuWikiChildren({ tenantAccessToken, wikiUrl }) {
  const root = await fetchFeishuWikiNode({ tenantAccessToken, wikiToken: extractFeishuWikiToken(wikiUrl) });
  const nodeToken = root.node_token || root.token || extractFeishuWikiToken(wikiUrl);
  const spaceId = root.space_id;
  if (!spaceId) throw new Error("飞书 wiki 节点响应缺少 space_id，无法读取目录子节点");
  const items = [];
  let pageToken = "";
  do {
    const data = await fetchFeishuWikiChildrenPage({ tenantAccessToken, spaceId, nodeToken, pageToken });
    items.push(...(data.items || data.nodes || []));
    pageToken = data.page_token || "";
  } while (pageToken);
  return { root, items };
}

async function fetchFeishuWikiChildrenPage({ tenantAccessToken, spaceId, nodeToken, pageToken }) {
  const query = new URLSearchParams({ page_size: "50" });
  if (pageToken) query.set("page_token", pageToken);
  return feishuGet(
    `/open-apis/wiki/v2/spaces/${spaceId}/nodes?parent_node_token=${encodeURIComponent(nodeToken)}&${query}`,
    tenantAccessToken
  );
}

export async function fetchFeishuWikiSpaces({ tenantAccessToken }) {
  const items = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ page_size: "50" });
    if (pageToken) query.set("page_token", pageToken);
    const data = await feishuGet(`/open-apis/wiki/v2/spaces?${query}`, tenantAccessToken);
    items.push(...(data.items || []));
    pageToken = data.page_token || "";
  } while (pageToken);
  return items;
}

export function feishuBlocksToText(blocks) {
  return blocks
    .map(blockToText)
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function feishuGet(path, token) {
  await throttle();
  const res = await fetch(`${FEISHU_BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  return parseFeishuResponse(res, path);
}

async function feishuPost(path, body) {
  await throttle();
  const res = await fetch(`${FEISHU_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  });
  return parseFeishuResponse(res, path);
}

async function parseFeishuResponse(res, path) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new Error(`飞书 API 调用失败：${path} HTTP ${res.status} code ${data.code ?? "-"} ${data.msg || ""}`.trim());
  }
  return data.data || data;
}

function blockToText(block) {
  const value = block.text?.elements || block.heading1?.elements || block.heading2?.elements || block.heading3?.elements;
  if (Array.isArray(value)) return value.map(elementToText).join("").trim();
  return collectText(block).join("").trim();
}

function elementToText(element) {
  return element.text_run?.content || element.mention_user?.name || element.mention_doc?.title || "";
}

function collectText(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectText);
  const direct = value.text_run?.content || value.mention_user?.name || value.mention_doc?.title;
  if (direct) return [direct];
  const text = [];
  for (const [key, child] of Object.entries(value)) {
    if (["block_id", "parent_id", "children", "block_type", "document_id"].includes(key)) continue;
    if (typeof child === "string" && ["content", "title", "name"].includes(key)) text.push(child);
    else if (typeof child === "object") text.push(...collectText(child));
  }
  return text;
}

export function summarizeFeishuBlocks(blocks, limit = 5) {
  return blocks.slice(0, limit).map((block) => summarizeShape(block));
}

function summarizeShape(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 2) return typeof value;
  if (Array.isArray(value)) return [`array(${value.length})`, summarizeShape(value[0], depth + 1)];
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, summarizeShape(child, depth + 1)]));
}
