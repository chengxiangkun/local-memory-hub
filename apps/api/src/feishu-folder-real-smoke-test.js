import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initDataDir } from "./data-store.js";
import {
  fetchFeishuWikiChildren,
  getFeishuTenantAccessToken
} from "./feishu-client.js";
import { handleImport } from "./import-pipeline.js";
import { loadLocalEnv } from "./local-env.js";
import { parseSource } from "./parser-service.js";
import { listSourcesSqlite } from "./sqlite-store.js";

await loadLocalEnv();
await main().catch((error) => {
  console.error(error.cause?.message || error.message);
  process.exit(1);
});

async function main() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const folderUrl = process.env.FEISHU_TEST_FOLDER_URL;
  if (!appId || !appSecret || !folderUrl) {
    throw new Error("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_TEST_FOLDER_URL");
  }

  const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-feishu-folder-"));
  await initDataDir(dataDir);
  const tenantAccessToken = await getFeishuTenantAccessToken({ appId, appSecret });
  const folder = await fetchFeishuWikiChildren({ tenantAccessToken, wikiUrl: folderUrl });

  let parsedCount = 0;
  let savedCount = 0;
  for (const child of folder.items) {
    const url = `${new URL(folderUrl).origin}/wiki/${child.node_token}`;
    const imported = await handleImport(
      {
        entrypoint: "feishu_folder_real_smoke_test",
        source_hint: "url",
        payload: { title: child.title || child.node_token, url }
      },
      dataDir
    );
    savedCount += imported.status === "success" ? 1 : 0;
    if (child.obj_type === "docx") {
      const parsed = await parseSource(imported.source.source_id, {}, dataDir);
      if (parsed.status === "success") parsedCount += 1;
    }
  }

  const sources = await listSourcesSqlite(dataDir);
  if (folder.items.length === 0) throw new Error("飞书文件夹没有子节点");
  if (sources.length !== folder.items.length) throw new Error("飞书文件夹子节点未全部保存为源资料");

  console.log("Feishu folder real smoke test passed");
  console.log(JSON.stringify({
    folder_title: folder.root.title,
    child_count: folder.items.length,
    saved_count: savedCount,
    parsed_docx_count: parsedCount,
    sources: sources.map((source) => ({
      title: source.title,
      platform: source.source_platform,
      parse_status: source.parse_status,
      memory_status: source.memory_status
    }))
  }, null, 2));
}
