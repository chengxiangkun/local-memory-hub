import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./local-env.js";
import { loadConnectorCredentials, saveConnectorCredentials, connectorCredentialStatus } from "./connector-credentials.js";
import { feishuBotStatus, startFeishuBot, stopFeishuBot, feishuBotConfigured } from "./feishu-bot-runner.js";
import { persistConversationTurn } from "./conversation-memory-service.js";
import { initDataDir, moveToTrash } from "./data-store.js";
import { testEmbeddingProvider } from "./embedding-service.js";
import { listExternalConnectors, markConnectorSync, saveExternalConnector } from "./external-connector-store.js";
import { armConnectorSchedules } from "./connector-scheduler.js";
import { handleImport } from "./import-pipeline.js";
import { syncFeishuConnector } from "./feishu-sync-service.js";
import { syncTencentDocsConnector } from "./tencent-sync-service.js";
import { getUserHabitProfile } from "./memory-organizer-agent.js";
import { getProviderConfig, listProviderConfigs, saveProviderConfig } from "./model-config-store.js";
import { resolveModelConfig } from "./model-config-resolver.js";
import { getModelPolicy, listModelPolicies, saveModelPolicy } from "./model-policy-store.js";
import { getVersionInfo, migrateIfNeeded } from "./migration-service.js";
import { initModelProviders, listProviderTemplates, routeChat } from "./model-provider.js";
import { parseSource, rebuildGraphIndex } from "./parser-service.js";
import { enrichSourceMetadata } from "./metadata-enricher.js";
import {
  runMemoryHealthCheck,
  getLastHealthReport,
  listHealthCheckRuns,
  getHealthSchedule,
  saveHealthSchedule,
  maybeRunScheduledHealthCheck
} from "./memory-health-service.js";
import { enrichConceptNode } from "./concept-enricher.js";
import { runQaMemoryAutoGovernance } from "./qa-memory-governance-service.js";
import { expandToParentDocs, listFallbackQuestionContext, retrieveQuestionContext } from "./retrieval-service.js";
import { createSourceFolder, listSourceFolders, moveSourceToFolder } from "./source-folder-store.js";
import { runSystemDoctor } from "./system-doctor.js";
import { getMcpPermissions, saveMcpPermissions, listExternalCalls } from "./mcp-permission-store.js";
import { rebuildVectorIndex, vectorSearch } from "./vector-service.js";
import { EMBEDDING_CATALOG, getCatalogEntry } from "./embedding-catalog.js";
import { getEmbeddingConfig, saveEmbeddingConfig, defaultModelPath } from "./embedding-config-store.js";
import { isModelDownloaded, downloadModel } from "./embedding-local-runtime.js";
import {
  getGraph,
  getGraphByNodeType,
  getGraphCommunities,
  getGraphNeighbors,
  getImpactScope,
  getSourceById,
  getOrCreateQaSession,
  createQaSession,
  initSqlite,
  appendQaMessage,
  clearQaSession,
  listQaSessions,
  renameQaSession,
  deleteQaSession,
  listQaMessages,
  listRecentQaMessages,
  listMemorySegments,
  listAllMemorySegments,
  getMemorySegmentById,
  setSegmentPollutionStatus,
  countSourceVectors,
  purgeSourceDerivedData,
  updateSourceStatuses,
  appendGovernanceEvents,
  listGovernanceEvents,
  listSourcesSqlite,
  quarantineSourceCascade,
  markSourceDeleted,
  markSourceExternalDeleted,
  restoreSourceCascade,
  searchAllSqlite,
  searchGraph,
  searchGraphSubgraph
} from "./sqlite-store.js";

const port = Number(process.env.LMH_PORT || 4317);
const execFileAsync = promisify(execFile);
await loadLocalEnv();
const dataInfo = await initDataDir();
await loadConnectorCredentials(dataInfo.data_dir);
// 飞书 IM 机器人:已配置则随服务自动起长连接(失败不影响主服务)。
if (feishuBotConfigured()) {
  try { startFeishuBot(dataInfo.data_dir); } catch { /* 忽略,UI 可手动启动 */ }
}
await initSqlite(dataInfo.data_dir);
initModelProviders();
runQaMemoryAutoGovernance(dataInfo.data_dir).catch((error) => {
  console.error("QA memory auto governance failed", error);
});

// 连接器同步:手动触发与自动调度共用。先登记同步状态,再按平台执行拉取。
async function runConnectorSync(platform) {
  const synced = await markConnectorSync({ platform }, dataInfo.data_dir);
  if (platform === "feishu") {
    return { connector: synced.connector, result: await syncFeishuConnector(synced.connector, dataInfo.data_dir) };
  }
  if (platform === "tencent_docs") {
    return { connector: synced.connector, result: await syncTencentDocsConnector(synced.connector, dataInfo.data_dir) };
  }
  return synced;
}

// 启动时按连接器 auto_sync_minutes 编排自动同步(默认关闭)。
armConnectorSchedules(dataInfo.data_dir, runConnectorSync).catch((error) => {
  console.error("连接器自动同步编排失败", error.message);
});

// 本地 embedding 模型下载状态(进程内,按目录条目 id)。
const embeddingDownloadStatus = new Map();

async function buildEmbeddingCatalogView(dataDir) {
  const config = await getEmbeddingConfig(dataDir);
  const catalog = [];
  for (const entry of EMBEDDING_CATALOG) {
    const override = config.overrides[entry.id] || {};
    const modelRef = override.model_ref || entry.model_ref;
    const view = {
      ...entry,
      model_ref: modelRef,
      active: config.active_id === entry.id,
      download: embeddingDownloadStatus.get(entry.id) || null
    };
    if (entry.runtime === "transformers") {
      view.downloaded = await isModelDownloaded(modelRef, config.model_path);
    } else if (entry.runtime === "openai") {
      view.configured = Boolean(override.api_key && (override.base_url || entry.default_base_url) && (override.model || entry.model_ref));
      view.base_url = override.base_url || entry.default_base_url || "";
      view.model = override.model || entry.model_ref || "";
      view.has_api_key = Boolean(override.api_key);
    } else {
      view.downloaded = true;
    }
    catalog.push(view);
  }
  return { catalog, active_id: config.active_id, model_path: config.model_path };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return json(res, 204, null);
    }

    if (req.method === "GET" && req.url === "/health") {
      const version = await getVersionInfo();
      return json(res, 200, {
        ok: true,
        service: "local-memory-hub-api",
        data_dir: version.data_dir,
        schema_version: version.schema_version,
        latest_schema_version: version.latest_schema_version
      });
    }

    if (req.method === "GET" && req.url === "/api/system/version") {
      return json(res, 200, await getVersionInfo());
    }

    if (req.method === "GET" && req.url === "/api/system/doctor") {
      return json(res, 200, await runSystemDoctor({ dataDir: dataInfo.data_dir }));
    }

    if (req.method === "POST" && req.url === "/api/system/migrate") {
      return json(res, 200, await migrateIfNeeded());
    }

    if (req.method === "GET" && req.url === "/api/sources") {
      return json(res, 200, {
        sources: await listSourcesSqlite()
      });
    }

    if (req.method === "GET" && req.url === "/api/models/providers") {
      return json(res, 200, {
        providers: await mergeProviderTemplatesWithConfigs(dataInfo.data_dir)
      });
    }

    if (req.method === "GET" && req.url === "/api/models/configs") {
      return json(res, 200, {
        configs: await listProviderConfigs(dataInfo.data_dir)
      });
    }

    if (req.method === "POST" && req.url === "/api/models/configs") {
      const body = await readJson(req);
      return json(res, 200, {
        config: await saveProviderConfig(body, dataInfo.data_dir)
      });
    }

    if (req.method === "POST" && req.url === "/api/models/test") {
      const body = await readJson(req);
      const saved = await getProviderConfig(body.provider_id, dataInfo.data_dir);
      const result = await routeChat({
        provider_id: body.provider_id,
        task: "model_test",
        question: "请只回复 OK",
        context: [],
        config: {
          base_url: body.base_url || saved?.base_url,
          model: body.model || saved?.model,
          api_key: body.api_key || saved?.api_key
        }
      }, dataInfo.data_dir);
      return json(res, 200, {
        ok: true,
        provider_id: result.provider_id,
        model: result.model,
        preview: String(result.answer || "").slice(0, 80)
      });
    }

    if (req.method === "POST" && req.url === "/api/models/embedding/test") {
      const body = await readJson(req);
      const saved = await getProviderConfig(body.provider_id, dataInfo.data_dir);
      return json(res, 200, await testEmbeddingProvider({
        provider_id: body.provider_id,
        text: body.text,
        config: {
          base_url: body.base_url || saved?.base_url,
          model: body.embedding_model || body.model || saved?.embedding_model || saved?.model,
          api_key: body.api_key || saved?.api_key
        }
      }, dataInfo.data_dir));
    }

    if (req.method === "GET" && req.url === "/api/models/policies") {
      return json(res, 200, {
        policies: await listModelPolicies(dataInfo.data_dir)
      });
    }

    if (req.method === "POST" && req.url === "/api/models/policies") {
      const body = await readJson(req);
      return json(res, 200, {
        policy: await saveModelPolicy(body, dataInfo.data_dir)
      });
    }

    if (req.method === "GET" && req.url === "/api/memory/habits") {
      return json(res, 200, await getUserHabitProfile());
    }

    // 注意：必须放在下面 "/api/qa/session" 的 startsWith 匹配之前，
    // 否则复数 "/api/qa/sessions" 会被单个会话路由吞掉。
    if (req.method === "GET" && req.url === "/api/qa/sessions") {
      return json(res, 200, {
        sessions: await listQaSessions(dataInfo.data_dir)
      });
    }

    if (req.method === "GET" && req.url?.startsWith("/api/qa/session")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const session = await getOrCreateQaSession(url.searchParams.get("session_id"), dataInfo.data_dir);
      return json(res, 200, {
        session,
        messages: await listQaMessages(session.session_id, dataInfo.data_dir)
      });
    }

    if (req.method === "POST" && req.url === "/api/qa/session/new") {
      const session = await createQaSession({}, dataInfo.data_dir);
      return json(res, 200, {
        session,
        messages: []
      });
    }

    if (req.method === "POST" && req.url === "/api/qa/session/rename") {
      const body = await readJson(req);
      if (!body.session_id) return json(res, 400, { error: "bad_request", message: "缺少 session_id" });
      const session = await renameQaSession(body.session_id, body.title, dataInfo.data_dir);
      if (!session) return json(res, 404, { error: "not_found", message: "会话不存在" });
      return json(res, 200, { session });
    }

    if (req.method === "POST" && req.url === "/api/qa/session/delete") {
      const body = await readJson(req);
      if (!body.session_id) return json(res, 400, { error: "bad_request", message: "缺少 session_id" });
      await deleteQaSession(body.session_id, dataInfo.data_dir);
      return json(res, 200, { session_id: body.session_id, deleted: true });
    }

    if (req.method === "POST" && req.url === "/api/qa/session/clear") {
      const body = await readJson(req);
      const session = await getOrCreateQaSession(body.session_id, dataInfo.data_dir);
      const cleared = await clearQaSession(session.session_id, dataInfo.data_dir);
      return json(res, 200, {
        session: cleared,
        messages: []
      });
    }

    if (req.method === "POST" && req.url === "/api/memory/govern/qa") {
      return json(res, 200, await runQaMemoryAutoGovernance(dataInfo.data_dir));
    }

    if (req.method === "GET" && req.url === "/api/external/mcp/status") {
      return json(res, 200, await getMcpStatus());
    }

    if (req.method === "GET" && req.url === "/api/external/permissions") {
      return json(res, 200, await getMcpPermissions(dataInfo.data_dir));
    }

    if (req.method === "POST" && req.url === "/api/external/permissions") {
      const body = await readJson(req);
      return json(res, 200, await saveMcpPermissions(body, dataInfo.data_dir));
    }

    if (req.method === "GET" && req.url?.startsWith("/api/external/calls")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const limit = Number(url.searchParams.get("limit") || 50);
      return json(res, 200, { calls: await listExternalCalls(dataInfo.data_dir, { limit }) });
    }

    if (req.method === "GET" && req.url === "/api/connectors") {
      return json(res, 200, {
        connectors: await listExternalConnectors(dataInfo.data_dir)
      });
    }

    if (req.method === "GET" && req.url === "/api/connectors/credentials") {
      return json(res, 200, { credentials: connectorCredentialStatus() });
    }

    if (req.method === "POST" && req.url === "/api/connectors/credentials") {
      const body = await readJson(req);
      const credentials = await saveConnectorCredentials(body || {}, dataInfo.data_dir);
      return json(res, 200, { status: "saved", credentials });
    }

    if (req.method === "GET" && req.url === "/api/feishu-bot/status") {
      return json(res, 200, feishuBotStatus());
    }

    if (req.method === "POST" && req.url === "/api/feishu-bot/start") {
      return json(res, 200, startFeishuBot(dataInfo.data_dir));
    }

    if (req.method === "POST" && req.url === "/api/feishu-bot/stop") {
      return json(res, 200, stopFeishuBot());
    }

    if (req.method === "GET" && req.url === "/api/source-folders") {
      return json(res, 200, await listSourceFolders(dataInfo.data_dir));
    }

    if (req.method === "POST" && req.url === "/api/source-folders") {
      const body = await readJson(req);
      return json(res, 200, {
        folder: await createSourceFolder(body, dataInfo.data_dir)
      });
    }

    if (req.method === "POST" && req.url === "/api/source-folders/move") {
      const body = await readJson(req);
      return json(res, 200, await moveSourceToFolder(body, dataInfo.data_dir));
    }

    if (req.method === "POST" && req.url === "/api/connectors") {
      const body = await readJson(req);
      const connector = await saveExternalConnector(body, dataInfo.data_dir);
      // 配置变更后重新编排自动同步定时器。
      armConnectorSchedules(dataInfo.data_dir, runConnectorSync).catch(() => {});
      return json(res, 200, { connector });
    }

    if (req.method === "POST" && req.url === "/api/connectors/sync") {
      const body = await readJson(req);
      return json(res, 200, await runConnectorSync(body.platform));
    }

    if (req.method === "GET" && req.url?.startsWith("/api/search")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const query = url.searchParams.get("q") || "";
      return json(res, 200, {
        query,
        results: await searchAllSqlite(query)
      });
    }

    if (req.method === "GET" && req.url?.startsWith("/api/vector/search")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const query = url.searchParams.get("q") || "";
      return json(res, 200, {
        query,
        results: await vectorSearch(query)
      });
    }

    if (req.method === "POST" && req.url === "/api/vector/rebuild") {
      return json(res, 200, await rebuildVectorIndex(dataInfo.data_dir));
    }

    // 图谱快照导出:前端把 canvas 的 dataURL/base64 发来,落盘到数据目录的 exports/
    // 并打开。跨浏览器/桌面一致,绕开 WebKit 下载与系统下载夹授权。
    if (req.method === "POST" && req.url === "/api/graph/export") {
      const body = await readJson(req);
      const raw = String(body.data || "").replace(/^data:image\/png;base64,/, "");
      if (!raw) return json(res, 400, { error: "bad_request", message: "缺少图片数据" });
      const safeName = String(body.name || "memory-graph.png").replace(/[^\w.-]/g, "_");
      const dir = path.join(dataInfo.data_dir, "exports");
      await mkdir(dir, { recursive: true });
      const filePath = path.join(dir, safeName);
      await writeFile(filePath, Buffer.from(raw, "base64"));
      if (body.open !== false) await openLocalPath(filePath).catch(() => {});
      return json(res, 200, { status: "exported", path: filePath });
    }

    if (req.method === "GET" && req.url === "/api/embedding/catalog") {
      return json(res, 200, await buildEmbeddingCatalogView(dataInfo.data_dir));
    }

    if (req.method === "POST" && req.url === "/api/embedding/config") {
      const body = await readJson(req);
      const saved = await saveEmbeddingConfig(body, dataInfo.data_dir);
      return json(res, 200, { status: "saved", config: { active_id: saved.active_id, model_path: saved.model_path } });
    }

    if (req.method === "POST" && req.url === "/api/embedding/download") {
      const body = await readJson(req);
      const entry = getCatalogEntry(body.id);
      if (!entry) return json(res, 404, { error: "not_found", message: "目录中没有该模型" });
      if (entry.runtime !== "transformers") return json(res, 400, { error: "bad_request", message: "该项无需下载" });
      const config = await getEmbeddingConfig(dataInfo.data_dir);
      const override = config.overrides[entry.id] || {};
      const modelRef = override.model_ref || entry.model_ref;
      const current = embeddingDownloadStatus.get(entry.id);
      if (current?.state === "downloading") return json(res, 200, { status: "already_downloading", id: entry.id });
      embeddingDownloadStatus.set(entry.id, { state: "downloading", model_ref: modelRef, started_at: new Date().toISOString() });
      // 后台下载,不阻塞响应。
      downloadModel(modelRef, config.model_path)
        .then((result) => {
          embeddingDownloadStatus.set(entry.id, { state: "downloaded", model_ref: modelRef, dimension: result.dimension, finished_at: new Date().toISOString() });
        })
        .catch((error) => {
          embeddingDownloadStatus.set(entry.id, { state: "error", model_ref: modelRef, error: error.message });
        });
      return json(res, 200, { status: "started", id: entry.id, size_mb: entry.size_mb });
    }

    if (req.method === "GET" && req.url === "/api/embedding/download/status") {
      return json(res, 200, { status: Object.fromEntries(embeddingDownloadStatus) });
    }

    if (req.method === "GET" && req.url?.startsWith("/api/segments")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const sourceId = url.searchParams.get("source_id");
      const includeAll = url.searchParams.get("all") === "1";
      return json(res, 200, {
        source_id: sourceId,
        segments: includeAll
          ? await listAllMemorySegments(sourceId, dataInfo.data_dir)
          : await listMemorySegments(sourceId, dataInfo.data_dir)
      });
    }

    if (req.method === "POST" && req.url === "/api/memory/segments/quarantine") {
      const body = await readJson(req);
      if (!body.segment_id) return json(res, 400, { error: "bad_request", message: "缺少 segment_id" });
      const segment = await setSegmentPollutionStatus(body.segment_id, "quarantined", dataInfo.data_dir);
      if (!segment) return json(res, 404, { error: "not_found", message: "片段不存在" });
      await appendGovernanceEvents({
        scope: "segment",
        source_id: segment.source_id,
        segment_id: segment.segment_id,
        title: segment.title_path || `片段 #${segment.segment_index}`,
        action: "quarantined",
        reason: body.reason || "manual_segment_quarantine"
      }, dataInfo.data_dir);
      return json(res, 200, { status: "quarantined", segment });
    }

    if (req.method === "POST" && req.url === "/api/memory/segments/restore") {
      const body = await readJson(req);
      if (!body.segment_id) return json(res, 400, { error: "bad_request", message: "缺少 segment_id" });
      const segment = await setSegmentPollutionStatus(body.segment_id, "clean", dataInfo.data_dir);
      if (!segment) return json(res, 404, { error: "not_found", message: "片段不存在" });
      await appendGovernanceEvents({
        scope: "segment",
        source_id: segment.source_id,
        segment_id: segment.segment_id,
        title: segment.title_path || `片段 #${segment.segment_index}`,
        action: "restored",
        reason: "manual_segment_restore"
      }, dataInfo.data_dir);
      return json(res, 200, { status: "restored", segment });
    }

    if (req.method === "GET" && req.url?.startsWith("/api/memory/govern/events")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const limit = Number(url.searchParams.get("limit") || 50);
      return json(res, 200, {
        events: await listGovernanceEvents(dataInfo.data_dir, { limit })
      });
    }

    if (req.method === "POST" && req.url === "/api/memory/health-check") {
      return json(res, 200, await runMemoryHealthCheck(dataInfo.data_dir));
    }

    if (req.method === "GET" && req.url === "/api/memory/health-check") {
      const [report, runs, schedule] = await Promise.all([
        getLastHealthReport(dataInfo.data_dir),
        listHealthCheckRuns(dataInfo.data_dir, 10),
        getHealthSchedule(dataInfo.data_dir)
      ]);
      return json(res, 200, { ...report, runs, schedule });
    }

    if (req.method === "POST" && req.url === "/api/memory/health-check/schedule") {
      const body = await readJson(req);
      return json(res, 200, { schedule: await saveHealthSchedule(body, dataInfo.data_dir) });
    }

    if (req.method === "GET" && req.url?.startsWith("/api/sources/impact")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const sourceId = url.searchParams.get("source_id");
      return json(res, 200, await getImpactScope(sourceId));
    }

    if (req.method === "GET" && req.url?.startsWith("/api/sources/detail")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const sourceId = url.searchParams.get("source_id");
      const source = await getSourceById(sourceId, dataInfo.data_dir);
      if (!source) return json(res, 404, { error: "source_not_found", message: "源资料不存在" });
      const [segments, impact, vectors] = await Promise.all([
        listAllMemorySegments(sourceId, dataInfo.data_dir),
        getImpactScope(sourceId, dataInfo.data_dir),
        countSourceVectors(sourceId, dataInfo.data_dir)
      ]);
      return json(res, 200, {
        source,
        segments,
        graph_nodes: impact.graph_nodes,
        counts: {
          segments: segments.length,
          segments_quarantined: segments.filter((item) => item.pollution_status === "quarantined").length,
          graph_nodes: impact.counts.graph_nodes,
          graph_edges: impact.counts.graph_edges,
          vectors_total: vectors.total,
          vectors_active: vectors.active
        }
      });
    }

    if (req.method === "POST" && req.url === "/api/sources/reparse") {
      const body = await readJson(req);
      const source = await getSourceById(body.source_id, dataInfo.data_dir);
      if (!source) return json(res, 404, { error: "source_not_found", message: "源资料不存在" });
      // 清场后重置状态,再重新解析,等价于"重建该资料的片段、向量和图谱"。
      await purgeSourceDerivedData(body.source_id, dataInfo.data_dir);
      await updateSourceStatuses(
        body.source_id,
        { parse_status: "parse_pending", memory_status: "memory_pending", pollution_status: "clean" },
        dataInfo.data_dir
      );
      const result = await parseSource(body.source_id, { llm_fallback: true }, dataInfo.data_dir);
      await appendGovernanceEvents({
        scope: "source",
        source_id: body.source_id,
        title: source.title || "",
        action: "reparsed",
        reason: "manual_source_reparse",
        detail: { segment_count: result.segment_count ?? 0 }
      }, dataInfo.data_dir);
      return json(res, 200, result);
    }

    if (req.method === "GET" && req.url?.startsWith("/api/graph/neighbors")) {
      const url = new URL(req.url, "http://127.0.0.1");
      return json(res, 200, await getGraphNeighbors(url.searchParams.get("node_id"), dataInfo.data_dir, {
        limit: Number(url.searchParams.get("limit") || 120)
      }));
    }

    if (req.method === "POST" && req.url === "/api/graph/enrich-concept") {
      const body = await readJson(req);
      return json(res, 200, await enrichConceptNode(body.node_id, dataInfo.data_dir));
    }

    if (req.method === "GET" && req.url === "/api/graph/communities") {
      return json(res, 200, await getGraphCommunities(dataInfo.data_dir));
    }

    if (req.method === "GET" && req.url?.startsWith("/api/graph/type")) {
      const url = new URL(req.url, "http://127.0.0.1");
      return json(res, 200, await getGraphByNodeType(url.searchParams.get("node_type"), dataInfo.data_dir, {
        seedLimit: Number(url.searchParams.get("limit") || 80)
      }));
    }

    if (req.method === "GET" && new URL(req.url, "http://127.0.0.1").pathname === "/api/graph") {
      const url = new URL(req.url, "http://127.0.0.1");
      return json(res, 200, await getGraph(dataInfo.data_dir, {
        limit: Number(url.searchParams.get("limit") || 200)
      }));
    }

    if (req.method === "POST" && req.url === "/api/graph/rebuild") {
      return json(res, 200, await rebuildGraphIndex(dataInfo.data_dir));
    }

    if (req.method === "GET" && req.url?.startsWith("/api/graph/subgraph")) {
      const url = new URL(req.url, "http://127.0.0.1");
      return json(res, 200, await searchGraphSubgraph(url.searchParams.get("q") || "", dataInfo.data_dir));
    }

    if (req.method === "GET" && req.url?.startsWith("/api/graph/search")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const query = url.searchParams.get("q") || "";
      return json(res, 200, await searchGraph(query));
    }

    if (req.method === "POST" && req.url === "/api/import") {
      const body = await readJson(req);
      const result = await handleImport(body, dataInfo.data_dir);
      // 外部 AI 写入留治理痕迹(可在治理页看到 imported 事件)。
      if (body.entrypoint === "external_mcp" && result.source?.source_id) {
        await appendGovernanceEvents({
          scope: "import",
          source_id: result.source.source_id,
          title: result.source.title || "",
          action: "imported",
          reason: "external_import"
        }, dataInfo.data_dir).catch(() => {});
      }
      return json(res, 200, result);
    }

    if (req.method === "POST" && req.url === "/api/import/batch") {
      const body = await readJson(req);
      const sources = Array.isArray(body.sources) ? body.sources : [];
      const autoParse = Boolean(body.auto_parse);
      const results = [];
      let succeeded = 0;
      let failed = 0;
      for (const item of sources) {
        try {
          const imported = await handleImport(item, dataInfo.data_dir);
          const sourceId = imported.source?.source_id;
          if (autoParse && sourceId && imported.status !== "duplicate") {
            try {
              await parseSource(sourceId, {}, dataInfo.data_dir);
            } catch {
              /* 解析失败不影响导入计数,可后续手动重解析 */
            }
          }
          if (sourceId) {
            await appendGovernanceEvents({
              scope: "import",
              source_id: sourceId,
              title: imported.source?.title || "",
              action: "imported",
              reason: "external_batch_import"
            }, dataInfo.data_dir).catch(() => {});
          }
          results.push({ status: imported.status, source_id: sourceId, title: imported.source?.title || "" });
          succeeded += 1;
        } catch (error) {
          results.push({ status: "failed", error: error.message });
          failed += 1;
        }
      }
      return json(res, 200, { results, summary: { total: sources.length, succeeded, failed } });
    }

    if (req.method === "POST" && req.url === "/api/parse") {
      const body = await readJson(req);
      return json(res, 200, await parseSource(body.source_id, { llm_fallback: Boolean(body.llm_fallback) }));
    }

    if (req.method === "POST" && req.url === "/api/sources/enrich-metadata") {
      const body = await readJson(req);
      return json(res, 200, await enrichSourceMetadata(body.source_id, dataInfo.data_dir));
    }

    if (req.method === "POST" && req.url === "/api/ask") {
      const body = await readJson(req);
      const session = await getOrCreateQaSession(body.session_id, dataInfo.data_dir);
      const history = await listRecentQaMessages(session.session_id, dataInfo.data_dir, { limit: 6 });
      await appendQaMessage({
        session_id: session.session_id,
        role: "user",
        content: body.question || ""
      }, dataInfo.data_dir);
      let results = await retrieveQuestionContext(body.question || "", dataInfo.data_dir);
      if (results.length === 0 && body.fallback_recent_memory === true) {
        results = await listFallbackQuestionContext(dataInfo.data_dir);
      }
      // 父文档召回:命中后按源补齐全文(前 3 源),喂给模型治碎片化;引用展示仍用短片段。
      const context = await expandToParentDocs(results, dataInfo.data_dir);
      const policy = await getModelPolicy("chat", dataInfo.data_dir);
      // provider_id 与 config 必须基于同一个生效 provider 解析，否则会出现
      // routeChat 选中策略 provider、但 config 仍按默认 mock 解析为空的情况。
      const chatProviderId = body.provider_id || policy?.provider_id || "mock";
      const answer = await routeChat({
        provider_id: chatProviderId,
        question: body.question || "",
        context,
        history,
        config: await resolveModelConfig(body, dataInfo.data_dir, chatProviderId)
      }, dataInfo.data_dir);
      const conversationMemory = body.persist_memory === false
        ? { status: "skipped", reason: "disabled_by_request" }
        : await persistConversationTurn({
            question: body.question || "",
            answer: answer.answer || "",
            citations: answer.citations || []
          }, dataInfo.data_dir);
      const assistantMessage = await appendQaMessage({
        session_id: session.session_id,
        role: "assistant",
        content: answer.answer || "",
        model: answer.model || answer.provider_id || "",
        citations: answer.citations || [],
        memory_status: conversationMemory.status === "persisted"
          ? `本次对话已入记忆，源资料 ID：${conversationMemory.source_id}`
          : conversationMemory.reason || conversationMemory.status || ""
      }, dataInfo.data_dir);
      return json(res, 200, {
        ...answer,
        message_id: assistantMessage.message_id,
        session,
        conversation_memory: conversationMemory
      });
    }

    if (req.method === "POST" && req.url === "/api/qa/feedback") {
      const body = await readJson(req);
      const rating = body.rating === "up" || body.rating === "thumbs_up" ? "thumbs_up" : "thumbs_down";
      await appendGovernanceEvents({
        scope: "qa_feedback",
        message_id: String(body.message_id || ""),
        title: String(body.question || "").slice(0, 40),
        action: rating,
        reason: String(body.reason_text || ""),
        detail: {
          session_id: String(body.session_id || ""),
          question: String(body.question || ""),
          answer_snippet: String(body.answer || "").slice(0, 120)
        }
      }, dataInfo.data_dir);
      return json(res, 200, { status: "recorded", rating });
    }

    if (req.method === "GET" && req.url?.startsWith("/api/qa/feedback")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const limit = Number(url.searchParams.get("limit") || 50);
      const events = (await listGovernanceEvents(dataInfo.data_dir, { limit: 500 }))
        .filter((event) => event.scope === "qa_feedback")
        .slice(0, limit);
      return json(res, 200, { feedback: events });
    }

    if (req.method === "POST" && req.url === "/api/sources/quarantine") {
      const body = await readJson(req);
      const source = await getSourceById(body.source_id, dataInfo.data_dir);
      await quarantineSourceCascade(body.source_id, dataInfo.data_dir);
      await appendGovernanceEvents({
        scope: "source",
        source_id: body.source_id,
        title: source?.title || "",
        action: "quarantined",
        reason: body.reason || "manual_source_quarantine"
      }, dataInfo.data_dir);
      return json(res, 200, {
        status: "quarantined",
        source_id: body.source_id
      });
    }

    if (req.method === "POST" && req.url === "/api/sources/restore") {
      const body = await readJson(req);
      const source = await getSourceById(body.source_id, dataInfo.data_dir);
      await restoreSourceCascade(body.source_id, dataInfo.data_dir);
      await appendGovernanceEvents({
        scope: "source",
        source_id: body.source_id,
        title: source?.title || "",
        action: "restored",
        reason: "manual_source_restore"
      }, dataInfo.data_dir);
      return json(res, 200, {
        status: "restored",
        source_id: body.source_id
      });
    }

    if (req.method === "POST" && req.url === "/api/sources/external-deleted") {
      const body = await readJson(req);
      await markSourceExternalDeleted(body.source_id, dataInfo.data_dir);
      return json(res, 200, {
        status: "external_deleted",
        source_id: body.source_id
      });
    }

    if (req.method === "POST" && req.url === "/api/sources/delete") {
      const body = await readJson(req);
      const source = await getSourceById(body.source_id, dataInfo.data_dir);
      if (!source) return json(res, 404, { error: "source_not_found" });
      const trash_path = body.delete_source_file === false
        ? null
        : await moveToTrash(source.local_file_path, dataInfo.data_dir).catch((error) => ({ error: error.message }));
      if (body.delete_derived !== false) {
        await quarantineSourceCascade(body.source_id, dataInfo.data_dir);
      }
      await markSourceDeleted(body.source_id, dataInfo.data_dir);
      await appendGovernanceEvents({
        scope: "source",
        source_id: body.source_id,
        title: source.title || "",
        action: "deleted",
        reason: "manual_source_delete",
        detail: {
          delete_derived: body.delete_derived !== false,
          delete_source_file: body.delete_source_file !== false,
          trash_path: typeof trash_path === "string" ? trash_path : ""
        }
      }, dataInfo.data_dir);
      return json(res, 200, {
        status: "deleted",
        source_id: body.source_id,
        trash_path
      });
    }

    if (req.method === "POST" && req.url === "/api/sources/open") {
      const body = await readJson(req);
      const source = await getSourceById(body.source_id, dataInfo.data_dir);
      if (!source?.local_file_path) return json(res, 404, { error: "source_file_not_found" });
      await openLocalPath(source.local_file_path);
      return json(res, 200, {
        status: "opened",
        source_id: body.source_id
      });
    }

    return json(res, 404, {
      error: "not_found"
    });
  } catch (error) {
    return json(res, 500, {
      error: "internal_error",
      message: error.message
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local Memory Hub API listening on http://127.0.0.1:${port}`);
  console.log(`Data directory: ${dataInfo.data_dir}`);
  // 定时健康检查:启动补跑一次 + 每 6 小时检查是否到期(best-effort,失败不影响服务)。
  maybeRunScheduledHealthCheck(dataInfo.data_dir).catch(() => {});
  setInterval(() => {
    maybeRunScheduledHealthCheck(dataInfo.data_dir).catch(() => {});
  }, 6 * 60 * 60 * 1000).unref?.();
});

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(body === null ? "" : JSON.stringify(body, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function openLocalPath(filePath) {
  if (process.platform === "darwin") return execFileAsync("open", [filePath]);
  if (process.platform === "win32") return execFileAsync("cmd", ["/c", "start", "", filePath]);
  return execFileAsync("xdg-open", [filePath]);
}

async function getMcpStatus() {
  const url = process.env.LMH_MCP_HEALTH_URL || "http://127.0.0.1:4318/health";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return { status: "unhealthy", url, http_status: res.status };
    const data = await res.json();
    return { status: data.ok ? "running" : "unhealthy", url, service: data.service || "unknown" };
  } catch (error) {
    return { status: "stopped", url, message: error.message };
  }
}

async function mergeProviderTemplatesWithConfigs(dataDir) {
  const configs = await listProviderConfigs(dataDir);
  return listProviderTemplates().map((template) => {
    const config = configs.find((item) => item.provider_id === template.provider_id);
    return {
      ...template,
      configured: Boolean(config?.enabled && (!template.requires_key || config.has_api_key)),
      configured_model: config?.model || "",
      configured_embedding_model: config?.embedding_model || "",
      configured_base_url: config?.base_url || ""
    };
  });
}

