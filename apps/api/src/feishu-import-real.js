import { initDataDir } from "./data-store.js";
import {
  fetchFeishuWikiChildren,
  getFeishuTenantAccessToken
} from "./feishu-client.js";
import { handleImport } from "./import-pipeline.js";
import { loadLocalEnv } from "./local-env.js";
import { parseSource } from "./parser-service.js";
import { initSqlite } from "./sqlite-store.js";

await loadLocalEnv();
await main().catch((error) => {
  console.error(error.cause?.message || error.message);
  process.exit(1);
});

async function main() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const docUrl = process.env.FEISHU_TEST_DOC_URL;
  const folderUrl = process.env.FEISHU_TEST_FOLDER_URL;
  if (!appId || !appSecret || (!docUrl && !folderUrl)) {
    throw new Error("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET，以及 FEISHU_TEST_DOC_URL 或 FEISHU_TEST_FOLDER_URL");
  }

  const dataInfo = await initDataDir();
  await initSqlite(dataInfo.data_dir);
  const imported = [];

  if (docUrl) imported.push(await importFeishuUrl("飞书文档", docUrl, dataInfo.data_dir));
  if (folderUrl) {
    const tenantAccessToken = await getFeishuTenantAccessToken({ appId, appSecret });
    const folder = await fetchFeishuWikiChildren({ tenantAccessToken, wikiUrl: folderUrl });
    for (const child of folder.items) {
      imported.push(await importFeishuUrl(child.title || child.node_token, `${new URL(folderUrl).origin}/wiki/${child.node_token}`, dataInfo.data_dir));
    }
  }

  console.log("Feishu import completed");
  console.log(JSON.stringify({
    data_dir: dataInfo.data_dir,
    imported_count: imported.length,
    imported
  }, null, 2));
}

async function importFeishuUrl(title, url, dataDir) {
  const result = await handleImport(
    {
      entrypoint: "feishu_real_import",
      source_hint: "url",
      payload: { title, url }
    },
    dataDir
  );
  const parsed = await parseSource(result.source.source_id, {}, dataDir).catch((error) => ({
    status: "failed",
    error: error.message
  }));
  return {
    title: result.source.title,
    status: result.status,
    parse_status: parsed.status,
    source_id: result.source.source_id
  };
}
