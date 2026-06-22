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
import {
  extractFeishuWikiToken,
  fetchFeishuWikiChildren,
  fetchFeishuWikiNode,
  getFeishuTenantAccessToken
} from "./feishu-client.js";

/**
 * 纯函数:对比远端节点与本地源,产出增量同步计划。无网络/无 DB,便于测试。
 *
 * @param {Array<{node_token,title,url,edit_time}>} remoteNodes 远端文档节点
 * @param {Array<{source_id,remote_node_token,remote_edit_time}>} localSources 本连接器已导入的本地源
 * @returns {{toAdd:Array, toUpdate:Array, toSkip:Array, toDelete:Array}}
 */
export function planFeishuSync(remoteNodes, localSources) {
  const localByToken = new Map(
    localSources.filter((item) => item.remote_node_token).map((item) => [item.remote_node_token, item])
  );
  const remoteTokens = new Set(remoteNodes.map((node) => node.node_token));

  const toAdd = [];
  const toUpdate = [];
  const toSkip = [];
  for (const node of remoteNodes) {
    const existing = localByToken.get(node.node_token);
    if (!existing) {
      toAdd.push(node);
    } else if (String(node.edit_time || "") !== String(existing.remote_edit_time || "")) {
      toUpdate.push({ node, source: existing });
    } else {
      toSkip.push({ node, source: existing });
    }
  }

  const toDelete = localSources.filter(
    (item) => item.remote_node_token && !remoteTokens.has(item.remote_node_token)
  );

  return { toAdd, toUpdate, toSkip, toDelete };
}

export async function syncFeishuConnector(connector, dataDir) {
  const rootUrl = connector.root_url || process.env.FEISHU_TEST_FOLDER_URL || process.env.FEISHU_TEST_DOC_URL;
  if (!rootUrl) throw new Error("飞书连接器缺少同步链接");

  const tenantAccessToken = await getFeishuTenantAccessToken({
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET
  });
  const remoteNodes = await resolveRemoteNodes({ tenantAccessToken, rootUrl });

  const localSources = (await listSourcesSqlite(dataDir)).filter(
    (item) => item.source_platform === "feishu" && item.import_status !== "deleted"
  );

  const plan = planFeishuSync(remoteNodes, localSources);
  const imported = [];
  const updated = [];
  const deleted = [];

  for (const node of plan.toAdd) {
    const result = await importAndParse(node, dataDir);
    await setSourceRemoteMeta(result.source_id, { remote_node_token: node.node_token, remote_edit_time: node.edit_time }, dataDir);
    await appendGovernanceEvents({ scope: "source", source_id: result.source_id, title: node.title, action: "synced", reason: "feishu_sync_added" }, dataDir);
    imported.push(result);
  }

  for (const { node, source } of plan.toUpdate) {
    await purgeSourceDerivedData(source.source_id, dataDir);
    await updateSourceStatuses(
      source.source_id,
      { parse_status: "parse_pending", memory_status: "memory_pending", pollution_status: "clean", trace_status: "traceable" },
      dataDir
    );
    const parsed = await parseSource(source.source_id, { llm_fallback: true }, dataDir).catch((error) => ({ status: "failed", error: error.message }));
    await setSourceRemoteMeta(source.source_id, { remote_node_token: node.node_token, remote_edit_time: node.edit_time }, dataDir);
    await appendGovernanceEvents({ scope: "source", source_id: source.source_id, title: node.title, action: "reparsed", reason: "feishu_sync_modified" }, dataDir);
    updated.push({ source_id: source.source_id, title: node.title, parse_status: parsed.status });
  }

  for (const source of plan.toDelete) {
    await markSourceExternalDeleted(source.source_id, dataDir);
    await appendGovernanceEvents({ scope: "source", source_id: source.source_id, title: source.title || "", action: "external_deleted", reason: "feishu_sync_removed" }, dataDir);
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

// 把同步根链接解析为远端文档节点列表(带 node_token + obj_edit_time 用于增量判定)。
async function resolveRemoteNodes({ tenantAccessToken, rootUrl }) {
  const parsed = new URL(rootUrl);
  if (!parsed.pathname.includes("/wiki/")) {
    // 非 wiki 单文档:无稳定 node_token,用链接本身作为键。
    return [{ node_token: rootUrl, title: "飞书文档", url: rootUrl, edit_time: "" }];
  }

  const node = await fetchFeishuWikiNode({ tenantAccessToken, wikiToken: extractFeishuWikiToken(rootUrl) });
  if (!node.has_child) {
    return [{
      node_token: node.node_token || extractFeishuWikiToken(rootUrl),
      title: node.title || "飞书文档",
      url: rootUrl,
      edit_time: String(node.obj_edit_time || "")
    }];
  }

  const folder = await fetchFeishuWikiChildren({ tenantAccessToken, wikiUrl: rootUrl });
  return (folder.items || [])
    .filter((item) => (item.obj_type || "docx") === "docx")
    .map((item) => ({
      node_token: item.node_token,
      title: item.title || item.node_token,
      url: `${parsed.origin}/wiki/${item.node_token}`,
      edit_time: String(item.obj_edit_time || "")
    }));
}

async function importAndParse(node, dataDir) {
  const result = await handleImport(
    { entrypoint: "feishu_connector_sync", source_hint: "url", payload: { title: node.title, url: node.url } },
    dataDir
  );
  const parsed = await parseSource(result.source.source_id, { llm_fallback: true }, dataDir).catch((error) => ({ status: "failed", error: error.message }));
  return {
    title: result.source.title,
    source_id: result.source.source_id,
    import_status: result.status,
    parse_status: parsed.status,
    error: parsed.error || null
  };
}
