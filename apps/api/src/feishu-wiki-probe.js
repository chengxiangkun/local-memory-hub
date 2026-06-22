import { extractFeishuWikiToken, getFeishuTenantAccessToken } from "./feishu-client.js";
import { loadLocalEnv } from "./local-env.js";

const baseUrl = "https://open.feishu.cn";

await loadLocalEnv();
await main().catch((error) => {
  console.error(error.cause?.message || error.message);
  process.exit(1);
});

async function main() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const urls = [process.env.FEISHU_TEST_DOC_URL, process.env.FEISHU_TEST_FOLDER_URL].filter(Boolean);
  if (!appId || !appSecret || urls.length === 0) throw new Error("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_TEST_DOC_URL");

  const tenantAccessToken = await getFeishuTenantAccessToken({ appId, appSecret });

  await probePath("/open-apis/wiki/v2/spaces?page_size=50", tenantAccessToken);
  for (const url of urls) {
    const token = extractFeishuWikiToken(url);
    const node = await probeNode(token, tenantAccessToken);
    if (node?.space_id) {
      const nodeToken = node.node_token || node.token || token;
      await probePath(`/open-apis/wiki/v2/spaces/${node.space_id}/nodes?parent_node_token=${encodeURIComponent(nodeToken)}&page_size=50`, tenantAccessToken);
    }
  }
}

async function probeNode(token, tenantAccessToken) {
  const body = await probePath(`/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(token)}`, tenantAccessToken);
  const node = body?.data?.node;
  if (node) {
    console.log(JSON.stringify({
      token,
      node_summary: {
        title: node.title,
        obj_type: node.obj_type,
        has_child: node.has_child,
        space_id: node.space_id,
        node_token: node.node_token || node.token || null,
        obj_token: node.obj_token || null
      }
    }, null, 2));
  }
  return node;
}

async function probePath(path, tenantAccessToken) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${tenantAccessToken}` }
  });
  const text = await res.text();
  console.log(JSON.stringify({
    path,
    http_status: res.status,
    body_preview: text.slice(0, 220)
  }, null, 2));
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
