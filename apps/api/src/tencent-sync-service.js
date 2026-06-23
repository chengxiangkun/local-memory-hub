import { handleImport } from "./import-pipeline.js";
import { parseSource } from "./parser-service.js";
import {
  listSourcesSqlite,
  purgeSourceDerivedData,
  updateSourceStatuses,
  markSourceExternalDeleted,
  setSourceRemoteMeta,
  appendGovernanceEvents
} from "./sqlite-store.js";
import { planFeishuSync } from "./feishu-sync-service.js";
import { hasTencentCreds, extractTencentFolderId, listTencentFolder } from "./tencent-client.js";

/**
 * 腾讯文档连接器增量同步:列出指定文件夹(或根目录)下的文档,按 lastModifyTime
 * 做新增/修改/删除增量;正文通过导出获取(见 parser-service extractText 的 tencent 分支)。
 * 复用 feishu 的 planFeishuSync(node_token=腾讯 fileID,edit_time=lastModifyTime)。
 */
export async function syncTencentDocsConnector(connector, dataDir) {
  if (!hasTencentCreds()) {
    return {
      status: "credentials_required",
      message: "未配置腾讯文档凭证(TENCENT_CLIENT_ID/ACCESS_TOKEN/OPEN_ID)。请在 docs.qq.com/open 控制台获取后写入 .env.local。"
    };
  }
  const rootUrl = connector.root_url || process.env.TENCENT_TEST_FOLDER_URL || "";
  const folderId = extractTencentFolderId(rootUrl); // null = 根目录
  const files = (await listTencentFolder(folderId)).filter((f) => f.type === "doc" || f.type === "sheet");
  const remoteNodes = files.map((f) => ({ node_token: f.id, title: f.title, url: f.url, edit_time: f.last_modify_time }));

  const localSources = (await listSourcesSqlite(dataDir)).filter(
    (s) => s.source_platform === "tencent_docs" && s.import_status !== "deleted"
  );
  const plan = planFeishuSync(remoteNodes, localSources);

  const imported = [];
  const updated = [];
  const deleted = [];

  for (const node of plan.toAdd) {
    imported.push(await importAndParse(node, dataDir));
  }
  for (const { node, source } of plan.toUpdate) {
    await purgeSourceDerivedData(source.source_id, dataDir);
    await updateSourceStatuses(
      source.source_id,
      { parse_status: "parse_pending", memory_status: "memory_pending", pollution_status: "clean", trace_status: "traceable" },
      dataDir
    );
    await setSourceRemoteMeta(source.source_id, { remote_node_token: node.node_token, remote_edit_time: node.edit_time }, dataDir);
    const parsed = await parseSource(source.source_id, {}, dataDir).catch((e) => ({ status: "failed", error: e.message }));
    await appendGovernanceEvents({ scope: "source", source_id: source.source_id, title: node.title, action: "reparsed", reason: "tencent_sync_modified" }, dataDir);
    updated.push({ source_id: source.source_id, title: node.title, parse_status: parsed.status });
  }
  for (const source of plan.toDelete) {
    await markSourceExternalDeleted(source.source_id, dataDir);
    await appendGovernanceEvents({ scope: "source", source_id: source.source_id, title: source.title || "", action: "external_deleted", reason: "tencent_sync_removed" }, dataDir);
    deleted.push(source.source_id);
  }

  return {
    status: "success",
    imported_count: imported.length,
    updated_count: updated.length,
    skipped_count: plan.toSkip.length,
    deleted_count: deleted.length,
    imported,
    updated,
    deleted
  };
}

async function importAndParse(node, dataDir) {
  const result = await handleImport(
    { entrypoint: "tencent_docs_connector_sync", source_hint: "url", payload: { title: node.title, url: node.url } },
    dataDir
  );
  // 先写远端元数据(含腾讯 fileID),再解析——extractText 依赖 remote_node_token 导出正文。
  await setSourceRemoteMeta(result.source.source_id, { remote_node_token: node.node_token, remote_edit_time: node.edit_time }, dataDir);
  const parsed = await parseSource(result.source.source_id, {}, dataDir).catch((e) => ({ status: "failed", error: e.message }));
  await appendGovernanceEvents({ scope: "source", source_id: result.source.source_id, title: node.title, action: "synced", reason: "tencent_sync_added" }, dataDir);
  return { title: result.source.title, source_id: result.source.source_id, import_status: result.status, parse_status: parsed.status };
}
