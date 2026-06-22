import { handleImport } from "./import-pipeline.js";
import { parseSource } from "./parser-service.js";
import {
  extractFeishuWikiToken,
  fetchFeishuWikiChildren,
  fetchFeishuWikiNode,
  getFeishuTenantAccessToken
} from "./feishu-client.js";

export async function syncFeishuConnector(connector, dataDir) {
  const rootUrl = connector.root_url || process.env.FEISHU_TEST_FOLDER_URL || process.env.FEISHU_TEST_DOC_URL;
  if (!rootUrl) throw new Error("飞书连接器缺少同步链接");

  const urls = await resolveSyncUrls(rootUrl);
  const imported = [];
  for (const item of urls) {
    imported.push(await importAndParse(item, dataDir));
  }
  return {
    status: "success",
    imported_count: imported.length,
    parsed_count: imported.filter((item) => ["success", "already_parsed", "llm_fallback_success"].includes(item.parse_status)).length,
    imported
  };
}

async function resolveSyncUrls(rootUrl) {
  const parsed = new URL(rootUrl);
  if (!parsed.pathname.includes("/wiki/")) return [{ title: "飞书文档", url: rootUrl }];

  const tenantAccessToken = await getFeishuTenantAccessToken({
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET
  });
  const node = await fetchFeishuWikiNode({ tenantAccessToken, wikiToken: extractFeishuWikiToken(rootUrl) });
  if (!node.has_child) return [{ title: node.title || "飞书文档", url: rootUrl }];

  const folder = await fetchFeishuWikiChildren({ tenantAccessToken, wikiUrl: rootUrl });
  return folder.items.map((item) => ({
    title: item.title || item.node_token,
    url: `${parsed.origin}/wiki/${item.node_token}`
  }));
}

async function importAndParse(item, dataDir) {
  const result = await handleImport({
    entrypoint: "feishu_connector_sync",
    source_hint: "url",
    payload: item
  }, dataDir);
  const parsed = await parseSource(result.source.source_id, { llm_fallback: true }, dataDir).catch((error) => ({
    status: "failed",
    error: error.message
  }));
  return {
    title: result.source.title,
    source_id: result.source.source_id,
    import_status: result.status,
    parse_status: parsed.status,
    error: parsed.error || null
  };
}
