import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  extractFeishuWikiToken,
  feishuBlocksToText,
  fetchFeishuDocxBlocks,
  fetchFeishuWikiChildren,
  getFeishuTenantAccessToken,
  resolveFeishuDocumentId,
  summarizeFeishuBlocks
} from "./feishu-client.js";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { loadLocalEnv } from "./local-env.js";
import { parseSource } from "./parser-service.js";
import { listSourceFolders } from "./source-folder-store.js";

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

  if (!appId || !appSecret || !docUrl) {
    throw new Error("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_TEST_DOC_URL");
  }

  const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-feishu-real-"));
  await initDataDir(dataDir);
  const tenantAccessToken = await getFeishuTenantAccessToken({ appId, appSecret });
  const documentId = await resolveFeishuDocumentId({ tenantAccessToken, url: docUrl });
  const blocks = await fetchFeishuDocxBlocks({ tenantAccessToken, documentId });
  const text = feishuBlocksToText(blocks);

  if (blocks.length === 0) throw new Error("飞书文档块为空，请确认应用权限和文档授权");
  if (process.env.FEISHU_DEBUG_BLOCKS === "1") {
    console.log(JSON.stringify({ block_shapes: summarizeFeishuBlocks(blocks) }, null, 2));
  }
  if (!text) throw new Error("飞书文档已读取，但当前块解析未提取到文本");

  const imported = await handleImport(
    {
      entrypoint: "feishu_real_smoke_test",
      source_hint: "url",
      payload: { title: "飞书真实接入测试", url: docUrl }
    },
    dataDir
  );
  const parsed = await parseSource(imported.source.source_id, {}, dataDir);
  const folders = await listSourceFolders(dataDir);
  if (parsed.status !== "success") throw new Error(`飞书链接解析失败：${parsed.status}`);
  if (folders.assignments[imported.source.source_id] !== "feishu-space") {
    throw new Error("飞书链接没有自动归入飞书空间");
  }

  const folder = folderUrl
    ? await fetchFeishuWikiChildren({ tenantAccessToken, wikiUrl: folderUrl })
    : null;

  console.log("Feishu real smoke test passed");
  console.log(JSON.stringify({
    document_id: documentId,
    wiki_token: docUrl.includes("/wiki/") ? extractFeishuWikiToken(docUrl) : null,
    block_count: blocks.length,
    text_chars: text.length,
    segment_count: parsed.segment_count,
    graph_node_count: parsed.graph_node_count,
    folder: folder ? {
      node_token: folder.root.node_token,
      title: folder.root.title,
      child_count: folder.items.length,
      children: folder.items.slice(0, 5).map((item) => ({
        title: item.title,
        obj_type: item.obj_type,
        node_token: item.node_token
      }))
    } : null
  }, null, 2));
}
