import { get, post } from "./js/api.js";
import { renderConnectorCards, renderConnectorTimeline } from "./js/connectors-view.js";
import {
  renderGovernance as renderGovernanceViewModule,
  renderGovernanceEvents,
  renderQaGovernanceResult
} from "./js/governance-view.js";
import { renderEmptyNodeDetail, renderSelectedNode } from "./js/graph-detail-view.js";
import { renderGraph as renderGraphSvg, updateGraphSelection, getGraphSnapshotDataUrl } from "./js/graph-renderer-force.js";
import { importExampleText as runExampleImport, importFile as runFileImport, importText as runTextImport, importUrl as runUrlImport } from "./js/import-flow.js";
import { renderMetrics as renderMetricCounters } from "./js/metrics-view.js";
import {
  askQuestion as runAskQuestion,
  loadQaSession,
  renderQaModelOptions,
  loadQaSessions,
  switchQaSession,
  createQaSession,
  renameQaSession,
  deleteQaSession,
  getCurrentSessionId,
  configureQaCitations
} from "./js/qa-view.js";
import { renderSettings } from "./js/settings-view.js";
import { renderEmbeddingSettings } from "./js/embedding-settings-view.js";
import { renderExternalAi } from "./js/external-ai-view.js";
import { renderFeishuBot } from "./js/feishu-bot-view.js";
import { confirmDialog, promptDialog } from "./js/modal.js";
import { generateMemoryCard } from "./js/share-card.js";
import { showOnboardingIfFirstRun } from "./js/onboarding.js";
import { openHelp } from "./js/help-view.js";
import { renderSources as renderSourcesViewModule } from "./js/sources-view.js";
import { renderSourceDetail } from "./js/source-detail-view.js";
import { state } from "./js/state.js";
import { debounce } from "./js/utils.js";

const GRAPH_LIMIT = 120;

const els = {
  graph: document.querySelector("#graph"),
  graphEmpty: document.querySelector("#graphEmpty"),
  detailBody: document.querySelector("#detailBody"),
  status: document.querySelector("#status"),
  globalSearch: document.querySelector("#globalSearch"),
  dataPath: document.querySelector("#dataPath"),
  sourceTable: document.querySelector("#sourceTable"),
  sourcePreview: document.querySelector("#sourcePreview"),
  folderTree: document.querySelector("#folderTree"),
  governList: document.querySelector("#governList"),
  contextList: document.querySelector("#contextList"),
  answerBox: document.querySelector("#answerBox"),
  floatingImport: document.querySelector("#floatingImport"),
  sourceDetailDrawer: document.querySelector("#sourceDetailDrawer"),
  sourceDetailBody: document.querySelector("#sourceDetailBody"),
  sourceContentDrawer: document.querySelector("#sourceContentDrawer"),
  sourceContentBody: document.querySelector("#sourceContentBody"),
  graphZoomSlider: document.querySelector("#graphZoomSlider"),
  graphZoomValue: document.querySelector("#graphZoomValue")
};

initTheme();
bindEvents();
boot();

// 主题:深色(默认)/ 亮色,持久化到 localStorage。
function initTheme() {
  const saved = window.localStorage.getItem("lmh-theme") || "dark";
  applyTheme(saved);
}

function applyTheme(theme) {
  const light = theme === "light";
  document.body.classList.toggle("theme-light", light);
  const btn = document.querySelector("#themeToggle");
  if (btn) {
    btn.textContent = light ? "☀️" : "🌙";
    btn.title = light ? "切换到深色主题" : "切换到亮色主题";
  }
  window.localStorage.setItem("lmh-theme", light ? "light" : "dark");
}

function toggleTheme() {
  const isLight = document.body.classList.contains("theme-light");
  applyTheme(isLight ? "dark" : "light");
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-governance-entry]").forEach((button) => {
    button.addEventListener("click", openGovernanceView);
  });

  document.querySelectorAll("[data-import-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-import-tab]").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll("[data-import-box]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`[data-import-box="${button.dataset.importTab}"]`)?.classList.add("active");
    });
  });

  document.querySelector("#refreshButton")?.addEventListener("click", refreshAll);
  document.querySelector("#themeToggle")?.addEventListener("click", toggleTheme);
  document.querySelector("#helpButton")?.addEventListener("click", openHelp);
  document.querySelector("#generateMemoryCard")?.addEventListener("click", async () => {
    try {
      await generateMemoryCard(new Date().toLocaleDateString("zh-CN"), { setStatus });
    } catch (error) {
      setStatus(`生成记忆卡片失败:${error.message}`);
    }
  });
  document.querySelector("#resetGraphView")?.addEventListener("click", resetGraphView);
  document.querySelector("#exportGraphSnapshot")?.addEventListener("click", exportGraphSnapshot);
  document.querySelectorAll("[data-graph-mode]").forEach((button) => {
    button.addEventListener("click", () => setGraphMode(button.dataset.graphMode));
  });
  els.graphZoomSlider?.addEventListener("input", (event) => {
    setGraphZoom(Number(event.target.value) / 100);
  });
  document.querySelector("#openImportPanel")?.addEventListener("click", () => els.floatingImport.classList.remove("hidden"));
  document.querySelector("#closeImportPanel")?.addEventListener("click", () => els.floatingImport.classList.add("hidden"));
  document.querySelector("#clearSelection")?.addEventListener("click", clearSelection);
  document.querySelector("#emptyImport")?.addEventListener("click", importExampleText);
  document.querySelector("#submitTextImport")?.addEventListener("click", () => {
    importText(document.querySelector("#textTitle").value, document.querySelector("#textPayload").value);
  });
  document.querySelector("#submitLinkImport")?.addEventListener("click", () => {
    importUrl(document.querySelector("#linkPayload").value);
  });
  document.querySelector("#submitFileImport")?.addEventListener("click", () => {
    importFile(document.querySelector("#filePayload").files?.[0]);
  });
  document.querySelector(".drop-zone")?.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.currentTarget.classList.add("drag-over");
  });
  document.querySelector(".drop-zone")?.addEventListener("dragleave", (event) => {
    event.currentTarget.classList.remove("drag-over");
  });
  document.querySelector(".drop-zone")?.addEventListener("drop", (event) => {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
    importFile(event.dataTransfer.files?.[0]);
  });
  document.querySelector("#quickImportSubmit")?.addEventListener("click", async () => {
    await importText(document.querySelector("#quickTitle").value, document.querySelector("#quickText").value);
    els.floatingImport.classList.add("hidden");
  });
  document.querySelector("#askButton")?.addEventListener("click", askQuestion);
  document.querySelector("#clearQaButton")?.addEventListener("click", clearQaConversation);
  document.querySelector("#newQaSessionButton")?.addEventListener("click", startNewQaSession);
  document.querySelector("#scanQaDuplicatesButton")?.addEventListener("click", scanQaDuplicates);
  document.querySelector("#closeSourceDetail")?.addEventListener("click", closeSourceDetail);
  els.sourceDetailDrawer?.addEventListener("click", (event) => {
    if (event.target === els.sourceDetailDrawer) closeSourceDetail();
  });
  document.querySelector("#closeSourceContent")?.addEventListener("click", closeSourceContent);
  els.sourceContentDrawer?.addEventListener("click", (event) => {
    if (event.target === els.sourceContentDrawer) closeSourceContent();
  });
  document.querySelector("#questionInput")?.addEventListener("keydown", (event) => {
    // 回车发送;Shift+Enter(或输入法组合中)换行。
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      askQuestion();
    }
  });
  document.querySelector("#createFolderButton")?.addEventListener("click", createFolder);
  document.querySelector("#createFolderAction")?.addEventListener("click", createFolder);
  document.querySelector("#rebuildGraphButton")?.addEventListener("click", rebuildGraphIndex);
  document.querySelector("#rebuildVectorButton")?.addEventListener("click", rebuildVectorIndex);
  els.globalSearch?.addEventListener("input", debounce(handleGlobalSearch, 180));
  document.querySelector("#sourceSearch")?.addEventListener("input", debounce((event) => {
    state.sourceQuery = event.target.value.trim().toLowerCase();
    state.sourcePage = 1;
    renderSources();
  }, 120));
  document.querySelectorAll("[data-source-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.sourceFilter = button.dataset.sourceFilter || "";
      state.sourcePage = 1;
      document.querySelectorAll("[data-source-filter]").forEach((item) =>
        item.classList.toggle("active", item === button)
      );
      renderSources();
    });
  });
}

async function boot() {
  configureQaCitations({
    onOpenSource: openCitationSource,
    resolveSourceMeta,
    onQuarantine: (sourceId) => mutateSource("/api/sources/quarantine", sourceId)
  });
  await refreshAll();
  await loadQaSession({
    answerBox: els.answerBox,
    contextList: els.contextList
  }).catch(() => null);
  await renderQaSessions().catch(() => null);
  if (state.graph.nodes.length === 0 && state.sources.length === 0) {
    els.status.textContent = "等待首次导入";
  }
  // 新用户首启向导(仅首次显示)。
  showOnboardingIfFirstRun({ onImportSample: importExampleText });
}

async function refreshAll() {
  await Promise.allSettled([loadHealth(), loadVersion(), loadProviders(), loadModelPolicies(), loadSources(), loadSourceFolders(), loadGraph(), loadHabits(), loadMcpStatus(), loadSystemDoctor(), loadConnectors(), loadGovernanceEvents()]);
  renderMetrics();
  renderSources();
  renderFolderTree();
  renderGovernance();
  renderConnectors();
  renderQaControls();
  renderSettingsView();
}

async function loadHealth() {
  try {
    const data = await get("/health");
    state.apiOnline = true;
    state.health = data;
    els.dataPath.textContent = data.data_dir || "本地数据目录未返回";
  } catch {
    state.apiOnline = false;
    state.health = null;
    els.dataPath.textContent = "后端 API 未连接";
    showApiOffline();
  }
}

async function loadVersion() {
  state.version = await get("/api/system/version");
}

async function loadSources() {
  const data = await get("/api/sources");
  state.sources = data.sources || [];
}

async function loadSourceFolders() {
  const data = await get("/api/source-folders");
  state.sourceFolders = data.folders || [];
  state.sourceFolderAssignments = data.assignments || {};
}

async function loadProviders() {
  const data = await get("/api/models/providers");
  state.providers = data.providers || [];
}

async function loadModelPolicies() {
  const data = await get("/api/models/policies");
  state.modelPolicies = data.policies || [];
}

async function loadConnectors() {
  const data = await get("/api/connectors");
  state.externalConnectors = data.connectors || [];
}

async function loadHabits() {
  state.habits = await get("/api/memory/habits");
}

async function loadMcpStatus() {
  state.mcpStatus = await get("/api/external/mcp/status");
}

async function loadSystemDoctor() {
  state.systemDoctor = await get("/api/system/doctor");
}

async function loadGraph() {
  try {
    if (!state.apiOnline) {
      showApiOffline();
      return;
    }
    els.status.textContent = "读取图谱中";
    state.graphMode = "relation";
    updateGraphModeButtons();
    state.graph = await get(`/api/graph?limit=${GRAPH_LIMIT}`);
    state.matchedNodeIds = null;
    setGraphStatus("关系图");
    resetGraphEmpty();
    renderGraph();
  } catch (error) {
    showApiOffline();
  }
}

function showApiOffline() {
  state.graph = { nodes: [], edges: [] };
  els.status.textContent = "后端 API 未连接，请重启本地服务";
  els.graphEmpty.classList.remove("hidden");
  els.graphEmpty.innerHTML = `
    <h2>后端服务未启动</h2>
    <p>前端页面还在，但 API 没有连接。请在项目目录执行 npm run restart。</p>
    <code>cd /Users/xiaocheng/build/codex/codex-projects/local-memory-hub && npm run restart</code>
  `;
}

function resetGraphEmpty() {
  els.graphEmpty.innerHTML = `
    <h2>还没有记忆节点</h2>
    <p>导入一段文本后，会生成源资料节点、主题节点和文本片段。</p>
    <button class="primary-button" id="emptyImport">导入示例文本</button>
  `;
  document.querySelector("#emptyImport")?.addEventListener("click", importExampleText);
}

async function resetGraphView() {
  if (els.globalSearch) els.globalSearch.value = "";
  state.selectedNodeId = null;
  state.matchedNodeIds = null;
  setGraphZoom(1);
  await loadGraph();
}

// 导出图谱快照:取 canvas dataURL → 经 API 落盘到数据目录 exports/ 并打开。
// 走 API 而非浏览器下载,浏览器/桌面(WKWebView)一致,且免系统下载夹授权。
async function exportGraphSnapshot() {
  const dataUrl = getGraphSnapshotDataUrl();
  if (!dataUrl) {
    setStatus("导出失败:当前没有可导出的图谱");
    return;
  }
  try {
    const result = await post("/api/graph/export", {
      data: dataUrl,
      name: `memory-graph-${state.graphMode || "relation"}.png`
    });
    setStatus(`已导出图谱快照:${result.path}`);
  } catch (error) {
    setStatus(`导出失败:${error.message}`);
  }
}

async function loadGraphCommunities() {
  if (els.globalSearch) els.globalSearch.value = "";
  state.selectedNodeId = null;
  state.matchedNodeIds = null;
  state.graphMode = "community";
  updateGraphModeButtons();
  state.graph = await get("/api/graph/communities");
  setGraphStatus("社区概览");
  renderGraph();
  renderEmptyNodeDetail(els.detailBody);
}

async function setGraphMode(mode) {
  if (mode === "relation") return loadGraph();
  if (mode === "community") return loadGraphCommunities();
  if (mode === "vector") return loadGraphType("keyword", "向量关键词", "vector");
  if (mode === "time") return loadGraphTimeline();
}

async function loadGraphTimeline() {
  if (els.globalSearch) els.globalSearch.value = "";
  state.selectedNodeId = null;
  state.matchedNodeIds = null;
  state.graphMode = "time";
  updateGraphModeButtons();
  state.graph = await get(`/api/graph?limit=${GRAPH_LIMIT}`);
  setGraphStatus("时间视图");
  renderGraph();
  renderEmptyNodeDetail(els.detailBody);
}

function updateGraphModeButtons() {
  document.querySelectorAll("[data-graph-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.graphMode === state.graphMode);
  });
}

function setGraphStatus(label) {
  els.status.textContent = `${label}：${state.graph.nodes.length} 个节点 · ${state.graph.edges.length} 条关系${state.graph.limited ? " · 已折叠更多节点" : ""}`;
}

function setGraphZoom(scale) {
  const next = Math.min(2.4, Math.max(0.55, scale || 1));
  els.graph?.setZoom?.(next);
  if (els.graphZoomSlider) els.graphZoomSlider.value = String(Math.round(next * 100));
  if (els.graphZoomValue) els.graphZoomValue.textContent = `${Math.round(next * 100)}%`;
}

function setView(view) {
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  document.querySelector(`#view-${view}`)?.classList.add("active");
}

function openGovernanceView() {
  setView("governance");
  renderGovernance();
  document.querySelector("#view-governance")?.scrollIntoView({ block: "start" });
}

async function importExampleText() {
  await runExampleImport(importDependencies());
}

async function importText(title, text) {
  await runTextImport({ title, text }, importDependencies());
}

async function importFile(file) {
  await runFileImport({ file }, importDependencies());
}

async function importUrl(url) {
  await runUrlImport({ url }, importDependencies());
}

function importDependencies() {
  return { setStatus, refreshAll, setView };
}

function renderGraph() {
  renderGraphSvg({
    graphEl: els.graph,
    graphEmpty: els.graphEmpty,
    zoomSlider: els.graphZoomSlider,
    zoomValue: els.graphZoomValue
  }, state.graph, {
    selectedNodeId: state.selectedNodeId,
    matchedNodeIds: state.matchedNodeIds,
    mode: state.graphMode,
    onSelectNode: selectNode
  });
}

async function selectNode(node) {
  if (node.node_type === "community") {
    await loadGraphType(node.node_id.replace("community:", ""));
    return;
  }
  state.selectedNodeId = node.node_id;
  renderNodeDetail(node);
  updateGraphSelection(els.graph, node.node_id);
  await expandGraphNeighbors(node.node_id);
  renderNodeDetail(node);
  updateGraphSelection(els.graph, node.node_id);
}

function renderNodeDetail(node) {
  const selectedNode = state.graph.nodes.find((item) => item.node_id === node.node_id) || node;
  const source = state.sources.find((item) => item.source_id === selectedNode.source_id);
  const neighbors = state.graph.edges
    .filter((edge) => edge.from_node_id === selectedNode.node_id || edge.to_node_id === selectedNode.node_id)
    .map((edge) => {
      const otherId = edge.from_node_id === selectedNode.node_id ? edge.to_node_id : edge.from_node_id;
      const other = state.graph.nodes.find((item) => item.node_id === otherId);
      return `${other?.label || otherId}：${edge.reason}`;
    });

  renderSelectedNode(els.detailBody, {
    node: selectedNode,
    source,
    neighbors,
    onImpactScope: loadImpactScope,
    onQuarantine: (sourceId) => mutateSource("/api/sources/quarantine", sourceId),
    onRestore: (sourceId) => mutateSource("/api/sources/restore", sourceId),
    onEnrichConcept: enrichConcept
  });
}

async function enrichConcept(nodeId) {
  setStatus("正在生成概念卡…");
  try {
    const result = await post("/api/graph/enrich-concept", { node_id: nodeId });
    if (result.status === "skipped") {
      setStatus(result.reason === "no_real_provider" ? "未配置问答模型,无法生成概念卡" : "已跳过概念卡生成");
    } else if (result.status === "ready") {
      await loadGraph();
      const node = state.graph.nodes.find((item) => item.node_id === nodeId);
      if (node) renderNodeDetail(node);
      setStatus("概念卡已生成");
    } else {
      setStatus(`概念卡生成失败:${result.reason || ""}`);
    }
  } catch (error) {
    setStatus(`概念卡生成失败:${error.message}`);
  }
}

async function expandGraphNeighbors(nodeId) {
  if (state.graph.nodes.length >= 600) {
    setStatus("当前子图较大，请用搜索缩小范围后再展开");
    return;
  }
  const data = await get(`/api/graph/neighbors?node_id=${encodeURIComponent(nodeId)}&limit=120`).catch(() => null);
  if (!data) return;
  const existingNodes = new Map(state.graph.nodes.map((node) => [node.node_id, node]));
  const existingEdges = new Map(state.graph.edges.map((edge) => [edge.edge_id, edge]));
  for (const node of data.nodes || []) existingNodes.set(node.node_id, node);
  for (const edge of data.edges || []) existingEdges.set(edge.edge_id, edge);
  const nodeCountBefore = state.graph.nodes.length;
  state.graph = {
    ...state.graph,
    nodes: [...existingNodes.values()],
    edges: [...existingEdges.values()]
  };
  if (state.graph.nodes.length !== nodeCountBefore) renderGraph();
}

async function loadGraphType(nodeType, label = graphTypeLabel(nodeType), mode = state.graphMode) {
  state.selectedNodeId = null;
  state.matchedNodeIds = null;
  state.graphMode = mode;
  updateGraphModeButtons();
  state.graph = await get(`/api/graph/type?node_type=${encodeURIComponent(nodeType)}&limit=60`);
  setGraphStatus(`${label}子图`);
  renderGraph();
  renderEmptyNodeDetail(els.detailBody);
}

function graphTypeLabel(nodeType) {
  return {
    source: "源资料",
    topic: "主题",
    keyword: "关键词",
    memory: "记忆"
  }[nodeType] || nodeType || "类型";
}

function clearSelection() {
  state.selectedNodeId = null;
  renderEmptyNodeDetail(els.detailBody);
  updateGraphSelection(els.graph, null);
}

async function loadImpactScope(sourceId) {
  try {
    const data = await get(`/api/sources/impact?source_id=${encodeURIComponent(sourceId)}`);
    const scope = document.querySelector("#impactScope");
    if (scope) {
      scope.textContent = `影响范围：${data.counts.segments} 个文本片段，${data.counts.graph_nodes} 个图谱节点，${data.counts.graph_edges} 条关系`;
    }
    document.querySelector("#impactSegments").textContent = data.counts.segments;
    document.querySelector("#impactVectors").textContent = data.counts.segments;
    document.querySelector("#impactGraph").textContent = data.counts.graph_nodes;
  } catch {
    const scope = document.querySelector("#impactScope");
    if (scope) scope.textContent = "影响范围：读取失败";
  }
}

async function mutateSource(path, sourceId) {
  await post(path, { source_id: sourceId });
  clearSelection();
  await refreshAll();
}

async function moveSourceToFolder(sourceId, folderId) {
  await post("/api/source-folders/move", { source_id: sourceId, folder_id: folderId });
  await refreshAll();
}

async function createFolder() {
  const name = await promptDialog("新建文件夹", "", { placeholder: "文件夹名称" });
  if (!name?.trim()) return;
  await post("/api/source-folders", { name: name.trim() });
  await refreshAll();
}

function renderSources() {
  const sources = filteredSourcesByFolder();
  normalizeSourcePage(sources.length);
  renderSourcesViewModule(els.sourceTable, sources, {
    folders: state.sourceFolders,
    assignments: state.sourceFolderAssignments,
    parsingSourceIds: state.parsingSourceIds,
    pagination: {
      page: state.sourcePage,
      pageSize: state.sourcePageSize
    },
    onImpactScope: loadImpactScope,
    onMoveSource: moveSourceToFolder,
    onParseSource: parseSourceFromLibrary,
    onOpenSource: openSourceUrl,
    onOpenFile: openSourceFile,
    onPreviewSource: previewSourceContent,
    onOpenGovernance: openGovernanceView,
    onOpenDetail: openSourceDetail,
    onPageChange: setSourcePage,
    onPageSizeChange: setSourcePageSize
  });
}

function normalizeSourcePage(total) {
  const pageCount = Math.max(1, Math.ceil(total / state.sourcePageSize));
  state.sourcePage = Math.min(pageCount, Math.max(1, state.sourcePage));
}

function setSourcePage(page) {
  state.sourcePage = page;
  renderSources();
}

function setSourcePageSize(pageSize) {
  state.sourcePageSize = pageSize;
  state.sourcePage = 1;
  renderSources();
}

function openSourceUrl(url) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  setStatus(opened ? "已打开源链接" : "浏览器阻止了弹窗，请允许后重试");
}

async function openSourceFile(sourceId) {
  await post("/api/sources/open", { source_id: sourceId });
  setStatus("已打开本地源文件");
}

let currentDetailSourceId = "";

async function openSourceDetail(sourceId) {
  currentDetailSourceId = sourceId;
  if (els.sourceDetailDrawer) els.sourceDetailDrawer.classList.add("drawer-open");
  els.sourceDetailBody.innerHTML = `<div class="detail-empty">加载中…</div>`;
  await refreshSourceDetail();
}

async function refreshSourceDetail() {
  if (!currentDetailSourceId) return;
  try {
    const detail = await get(`/api/sources/detail?source_id=${encodeURIComponent(currentDetailSourceId)}`);
    renderSourceDetail(els.sourceDetailBody, detail, {
      onReparse: reparseSourceFromDetail,
      onOpenFile: openSourceFile,
      onQuarantine: async (id) => { await post("/api/sources/quarantine", { source_id: id }); await afterDetailMutation("已隔离该资料"); },
      onRestore: async (id) => { await post("/api/sources/restore", { source_id: id }); await afterDetailMutation("已恢复该资料"); },
      onDelete: async (id) => {
        if (!(await confirmDialog("确认删除该源资料?", { danger: true, confirmText: "删除" }))) return;
        await deleteSource(id);
        closeSourceDetail();
      },
      onSegmentQuarantine: async (segmentId) => { await post("/api/memory/segments/quarantine", { segment_id: segmentId }); await afterDetailMutation("已隔离该片段"); },
      onSegmentRestore: async (segmentId) => { await post("/api/memory/segments/restore", { segment_id: segmentId }); await afterDetailMutation("已恢复该片段"); }
    });
  } catch (error) {
    els.sourceDetailBody.innerHTML = `<div class="detail-empty">加载失败：${escapeHtmlLocal(error.message)}</div>`;
  }
}

async function reparseSourceFromDetail(sourceId) {
  setStatus("正在重新解析：清场 -> 解析 -> 重建片段/向量/图谱");
  try {
    await post("/api/sources/reparse", { source_id: sourceId });
    await afterDetailMutation("重新解析完成");
  } catch (error) {
    setStatus(`重新解析失败：${error.message}`);
  }
}

// 详情页内的变更后:刷新全局数据与详情面板，保持两者一致。
async function afterDetailMutation(message) {
  await refreshAll();
  await refreshSourceDetail();
  setStatus(message);
}

function closeSourceDetail() {
  currentDetailSourceId = "";
  els.sourceDetailDrawer?.classList.remove("drawer-open");
}

function closeSourceContent() {
  els.sourceContentDrawer?.classList.remove("drawer-open");
}

// 供问答引用追溯使用:按 source_id 返回该资料的实时状态。
// 即使历史引用对应的资料后来被隔离/删除,也能如实反映当前状态。
function resolveSourceMeta(sourceId) {
  const source = (state.sources || []).find((item) => item.source_id === sourceId);
  if (!source) return { exists: false, status: "deleted", label: "源已删除" };
  if (source.import_status === "deleted") return { exists: true, status: "deleted", label: "已删除" };
  if (source.pollution_status === "quarantined") return { exists: true, status: "quarantined", label: "已隔离" };
  if (source.parse_status === "parse_failed") return { exists: true, status: "parse_failed", label: "解析失败" };
  return { exists: true, status: "normal", label: "" };
}

// 从问答引用跳转到源资料库并定位该资料(清掉筛选、翻到对应分页、滚动闪烁高亮)。
function openCitationSource(sourceId) {
  const source = (state.sources || []).find((item) => item.source_id === sourceId);
  if (!source) {
    setStatus("源资料不存在或已删除");
    return;
  }
  setView("sources");
  state.sourceFilter = "";
  state.sourceQuery = "";
  state.selectedFolderId = null;
  document.querySelectorAll("[data-source-filter]").forEach((item) =>
    item.classList.toggle("active", !item.dataset.sourceFilter)
  );
  const sourceSearch = document.querySelector("#sourceSearch");
  if (sourceSearch) sourceSearch.value = "";
  const visible = filteredSourcesByFolder();
  const index = visible.findIndex((item) => item.source_id === sourceId);
  if (index >= 0) state.sourcePage = Math.floor(index / state.sourcePageSize) + 1;
  renderSources();
  requestAnimationFrame(() => {
    const row = els.sourceTable?.querySelector(`[data-source-id="${sourceId}"]`);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      row.classList.add("flash");
      setTimeout(() => row.classList.remove("flash"), 1600);
    }
  });
  setStatus("已在源资料库定位该引用来源");
}

async function parseSourceFromLibrary(sourceId) {
  if (state.parsingSourceIds.has(sourceId)) return;
  state.parsingSourceIds.add(sourceId);
  renderSources();
  setStatus("解析已开始：保存源资料 -> 本地解析 -> 模型兜底 -> 写入记忆");
  post("/api/parse", { source_id: sourceId, llm_fallback: true })
    .then(async (result) => {
      await refreshAll();
      setStatus(["success", "llm_fallback_success", "already_parsed"].includes(result.status)
        ? `解析完成：${result.segment_count || 0} 个文本片段`
        : `解析失败：${result.error || result.status}`);
    })
    .catch((error) => {
      setStatus(`解析失败：${error.message}`);
    })
    .finally(() => {
      state.parsingSourceIds.delete(sourceId);
      renderSources();
    });
}

async function previewSourceContent(sourceId) {
  if (!els.sourceContentBody) return;
  const source = state.sources.find((item) => item.source_id === sourceId);
  // 从右侧滑入抽屉(iOS 风格);展示该资料解析出的全部文本片段。
  els.sourceContentDrawer?.classList.add("drawer-open");
  els.sourceContentBody.innerHTML = `<div class="detail-empty">读取中…</div>`;
  try {
    const data = await get(`/api/segments?source_id=${encodeURIComponent(sourceId)}`);
    const segments = data.segments || [];
    els.sourceContentBody.innerHTML = `
      <div class="detail-section">
        <h3>${escapeHtmlLocal(source?.title || "资料内容")}</h3>
        ${
          segments.length
            ? `<div class="content-text">${segments.map((item) => `<p>${escapeHtmlLocal(item.text)}</p>`).join("")}</div>`
            : `<div class="detail-empty">还没有解析出的文本片段。</div>`
        }
      </div>
    `;
  } catch (error) {
    els.sourceContentBody.innerHTML = `<div class="detail-empty">加载失败：${escapeHtmlLocal(error.message)}</div>`;
  }
}

function renderFolderTree() {
  if (!els.folderTree) return;
  const countByFolder = new Map();
  for (const source of state.sources) {
    const folderId = state.sourceFolderAssignments[source.source_id] || defaultFolderForSource(source);
    countByFolder.set(folderId, (countByFolder.get(folderId) || 0) + 1);
  }
  els.folderTree.innerHTML = `
    <button class="folder-node ${state.selectedFolderId ? "" : "active"}" data-folder-filter=""><strong>全部资料</strong><span>${state.sources.length}</span></button>
    ${state.sourceFolders.map((folder) => `
      <button class="folder-node ${folder.origin !== "local" ? "external" : ""} ${state.selectedFolderId === folder.folder_id ? "active" : ""}" data-folder-filter="${escapeHtmlLocal(folder.folder_id)}">
        <strong>${escapeHtmlLocal(folder.name)}</strong>
        <span>${countByFolder.get(folder.folder_id) || 0}</span>
      </button>
    `).join("")}
  `;
  els.folderTree.querySelectorAll("[data-folder-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFolderId = button.dataset.folderFilter || null;
      state.sourcePage = 1;
      renderFolderTree();
      renderSources();
    });
  });
}

function filteredSourcesByFolder() {
  return state.sources.filter((source) => {
    const folderMatch = !state.selectedFolderId ||
      (state.sourceFolderAssignments[source.source_id] || defaultFolderForSource(source)) === state.selectedFolderId;
    const text = [
      source.title,
      source.source_platform,
      source.source_type,
      source.original_url,
      source.local_file_path,
      source.parse_status,
      source.memory_status
    ].join(" ").toLowerCase();
    return folderMatch &&
      sourceFilterMatch(source) &&
      (!state.sourceQuery || text.includes(state.sourceQuery));
  });
}

function sourceFilterMatch(source) {
  if (!state.sourceFilter) return true;
  if (source.pollution_status === "quarantined") return state.sourceFilter === "quarantined";
  if (state.sourceFilter === "memory_indexed") return source.memory_status === "memory_indexed";
  if (state.sourceFilter === "export_required") return source.parse_status === "export_required";
  if (state.sourceFilter === "parse_failed") return source.parse_status === "parse_failed";
  if (state.sourceFilter === "quarantined") return source.pollution_status === "quarantined";
  if (state.sourceFilter === "sync_pending") return ["sync_polling", "syncing"].includes(source.trace_status);
  if (state.sourceFilter === "auth_expired") return source.trace_status === "auth_expired";
  return true;
}

function renderGovernance() {
  renderGovernanceViewModule(els.governList, state.sources, {
    onRestore: (sourceId) => mutateSource("/api/sources/restore", sourceId),
    onDelete: deleteSource,
    events: state.governanceEvents
  });
  renderGovernanceEvents(document.querySelector("#auditLog"), state.governanceEvents);
  renderHealthCheckPanel();
}

async function renderHealthCheckPanel() {
  const container = document.querySelector("#healthReport");
  const button = document.querySelector("#runHealthCheck");
  if (button && !button.dataset.wired) {
    button.dataset.wired = "1";
    button.addEventListener("click", async () => {
      button.disabled = true;
      const prev = button.textContent;
      button.textContent = "检查中…";
      try {
        const report = await post("/api/memory/health-check", {});
        renderHealthReport(container, report);
        await loadGovernanceEvents();
        renderGovernanceEvents(document.querySelector("#auditLog"), state.governanceEvents);
      } catch (error) {
        if (container) container.innerHTML = `<span>检查失败:${escapeHtmlLocal(error.message)}</span>`;
      } finally {
        button.disabled = false;
        button.textContent = prev;
      }
    });
  }
  try {
    renderHealthReport(container, await get("/api/memory/health-check"));
  } catch {
    /* ignore */
  }
}

function renderHealthReport(container, report) {
  if (!container) return;
  if (!report || report.status === "none") {
    container.innerHTML = `<span>尚未检查。点「运行检查」开始。</span>`;
    return;
  }
  if (report.status === "skipped") {
    const why = report.reason === "no_real_provider" ? "未配置问答模型" : report.reason === "not_enough_sources" ? "资料太少" : report.reason;
    container.innerHTML = `<span>已跳过:${escapeHtmlLocal(why || "")}。</span>`;
    return;
  }
  if (report.status === "failed") {
    container.innerHTML = `<span>检查失败:${escapeHtmlLocal(report.reason || "")}。</span>`;
    return;
  }
  const issues = report.issues || [];
  if (issues.length === 0) {
    container.innerHTML = `<span>✅ 检查了 ${report.checked_count} 份资料,未发现问题。</span>`;
    return;
  }
  container.innerHTML =
    `<div class="health-summary">检查 ${report.checked_count} 份,发现 ${issues.length} 个问题:</div>` +
    issues
      .map(
        (it) => `
      <div class="health-issue">
        <div class="health-issue-head">
          <span class="audit-action audit-deleted">${escapeHtmlLocal(it.type)}</span>
          <span class="health-issue-detail">${escapeHtmlLocal(it.detail)}</span>
        </div>
        ${(it.sources || []).length ? `<div class="health-issue-sources">涉及:${escapeHtmlLocal(it.sources.join("、"))}</div>` : ""}
      </div>`
      )
      .join("");
}

async function loadGovernanceEvents() {
  try {
    const data = await get("/api/memory/govern/events?limit=50");
    state.governanceEvents = data.events || [];
  } catch {
    state.governanceEvents = [];
  }
}

async function scanQaDuplicates() {
  const button = document.querySelector("#scanQaDuplicatesButton");
  if (button) button.disabled = true;
  setStatus("正在扫描 QA 记忆重复…");
  try {
    const result = await post("/api/memory/govern/qa", {});
    renderQaGovernanceResult(document.querySelector("#qaGovernResult"), result, {
      onRestore: async (sourceId) => {
        await post("/api/sources/restore", { source_id: sourceId });
        await refreshAll();
        setStatus("已恢复该 QA 记忆");
      },
      onDelete: async (sourceId) => {
        if (!(await confirmDialog("确认删除该 QA 记忆?", { danger: true, confirmText: "删除" }))) return;
        await deleteSource(sourceId);
      }
    });
    await loadGovernanceEvents();
    renderGovernance();
    setStatus(`QA 去重完成：隔离 ${result.quarantined_count ?? 0} 条`);
  } catch (error) {
    setStatus(`QA 去重失败：${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

async function deleteSource(sourceId) {
  await post("/api/sources/delete", {
    source_id: sourceId,
    delete_source_file: document.querySelector("#deleteSourceFile")?.checked !== false,
    delete_derived: document.querySelector("#deleteDerivedData")?.checked !== false
  });
  clearSelection();
  await refreshAll();
  setStatus("源资料已移入删除状态");
}

function renderConnectors() {
  renderConnectorCards(document.querySelector("#connectorCards"), state.externalConnectors, {
    onChanged: refreshAll
  });
  renderConnectorTimeline(document.querySelector("#connectorTimeline"), state.externalConnectors);
}

function renderSettingsView() {
  renderSettings({
    providers: state.providers,
    health: state.health,
    version: state.version,
    sources: state.sources,
    graph: state.graph,
    habits: state.habits,
    modelPolicies: state.modelPolicies,
    mcpStatus: state.mcpStatus,
    systemDoctor: state.systemDoctor,
    onProviderSaved: refreshAll
  });
  renderEmbeddingSettings(document.querySelector("#embeddingCatalog"), { onChanged: refreshAll }).catch(() => null);
  renderExternalAi(document.querySelector("#externalAiPanel")).catch(() => null);
  renderFeishuBot(document.querySelector("#feishuBotPanel")).catch(() => null);
}

function renderQaControls() {
  renderQaModelOptions(document.querySelector("#qaProviderSelect"), state.providers);
}

function renderMetrics() {
  renderMetricCounters({ sources: state.sources, graph: state.graph, externalActive: state.externalActive });
  const folderAllCount = document.querySelector("#folderAllCount");
  if (folderAllCount) folderAllCount.textContent = state.sources.length;
  // 外部 AI 调用是否发生过(有调用记录即点亮),异步刷新一次。
  // 用 get() 走 API_BASE(4317);此前用相对 fetch 会打到静态 web(3100)→ 404。
  get("/api/external/calls?limit=1")
    .then((data) => {
      const active = (data.calls || []).length > 0;
      if (active !== state.externalActive) {
        state.externalActive = active;
        renderMetricCounters({ sources: state.sources, graph: state.graph, externalActive: active });
      }
    })
    .catch(() => {});
}

async function askQuestion() {
  await runAskQuestion({
    questionInput: document.querySelector("#questionInput"),
    answerBox: els.answerBox,
    contextList: els.contextList,
    providerSelect: document.querySelector("#qaProviderSelect"),
    persistMemoryInput: document.querySelector("#persistQaMemory"),
    onQuarantineCitation: (sourceId) => mutateSource("/api/sources/quarantine", sourceId)
  });
  // 新会话首条提问后标题会从默认名变为问题摘要，刷新列表以同步标题与排序。
  await renderQaSessions().catch(() => null);
}

async function clearQaConversation() {
  await runAskQuestion.clear?.({
    answerBox: els.answerBox,
    contextList: els.contextList,
    questionInput: document.querySelector("#questionInput")
  });
  await renderQaSessions().catch(() => null);
  setStatus("问答会话已清空");
}

async function renderQaSessions() {
  const listEl = document.querySelector("#qaSessionList");
  if (!listEl) return;
  const sessions = await loadQaSessions();
  const activeId = getCurrentSessionId();
  if (sessions.length === 0) {
    listEl.innerHTML = `<div class="qa-session-empty">还没有会话，点“新建”开始一次资料对话。</div>`;
    return;
  }
  listEl.innerHTML = sessions
    .map((session) => `
      <div class="qa-session-item ${session.session_id === activeId ? "active" : ""}" data-session-id="${escapeHtmlLocal(session.session_id)}">
        <div class="qa-session-item-title">${escapeHtmlLocal(session.title || "未命名会话")}</div>
        <div class="qa-session-item-meta">
          <span>${session.message_count || 0} 条消息</span>
          <span class="qa-session-item-actions">
            <button type="button" data-rename-session="${escapeHtmlLocal(session.session_id)}">重命名</button>
            <button type="button" data-delete-session="${escapeHtmlLocal(session.session_id)}">删除</button>
          </span>
        </div>
      </div>
    `)
    .join("");

  listEl.querySelectorAll(".qa-session-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target.closest("[data-rename-session]") || event.target.closest("[data-delete-session]")) return;
      switchToQaSession(item.dataset.sessionId);
    });
  });
  listEl.querySelectorAll("[data-rename-session]").forEach((button) => {
    button.addEventListener("click", () => renameQaSessionPrompt(button.dataset.renameSession));
  });
  listEl.querySelectorAll("[data-delete-session]").forEach((button) => {
    button.addEventListener("click", () => deleteQaSessionConfirm(button.dataset.deleteSession));
  });
}

async function startNewQaSession() {
  await createQaSession({ answerBox: els.answerBox, contextList: els.contextList });
  await renderQaSessions().catch(() => null);
  document.querySelector("#questionInput")?.focus();
  setStatus("已新建会话");
}

async function switchToQaSession(sessionId) {
  if (!sessionId || sessionId === getCurrentSessionId()) return;
  await switchQaSession(sessionId, { answerBox: els.answerBox, contextList: els.contextList });
  await renderQaSessions().catch(() => null);
}

async function renameQaSessionPrompt(sessionId) {
  const trimmed = await promptDialog("重命名会话", "", { placeholder: "新的会话名称" });
  if (!trimmed) return;
  await renameQaSession(sessionId, trimmed);
  await renderQaSessions().catch(() => null);
  setStatus("会话已重命名");
}

async function deleteQaSessionConfirm(sessionId) {
  if (!(await confirmDialog("确认删除该会话?此操作会一并删除其问答消息。", { danger: true, confirmText: "删除" }))) return;
  const wasActive = sessionId === getCurrentSessionId();
  await deleteQaSession(sessionId);
  if (wasActive) {
    // 当前会话被删后，优先切换到最近的剩余会话，没有再新建空会话。
    const remaining = await loadQaSessions().catch(() => []);
    if (remaining.length > 0) {
      await switchQaSession(remaining[0].session_id, { answerBox: els.answerBox, contextList: els.contextList });
    } else {
      await loadQaSession({ answerBox: els.answerBox, contextList: els.contextList }).catch(() => null);
    }
  }
  await renderQaSessions().catch(() => null);
  setStatus("会话已删除");
}

async function rebuildGraphIndex() {
  setStatus("正在重建图谱索引");
  const result = await post("/api/graph/rebuild", {});
  await refreshAll();
  setView("graph");
  setStatus(`图谱已重建：${result.source_count} 个源资料，${result.node_count} 个节点，${result.edge_count} 条关系`);
}

async function rebuildVectorIndex() {
  setStatus("正在重建向量索引");
  const result = await post("/api/vector/rebuild", {});
  await refreshAll();
  const embedding = result.embedding_model ? `，模型：${result.embedding_model} (${result.embedding_dimension} 维)` : "";
  setStatus(`向量已重建：${result.source_count} 个源资料，${result.vector_count} 条向量${embedding}`);
}

async function handleGlobalSearch() {
  const query = els.globalSearch.value.trim();
  if (!query) {
    state.matchedNodeIds = null;
    await loadGraph();
    return;
  }
  try {
    const data = await get(`/api/graph/subgraph?q=${encodeURIComponent(query)}`);
    state.graph = {
      nodes: data.nodes || [],
      edges: data.edges || [],
      limited: data.limited
    };
    state.matchedNodeIds = new Set(data.matched_node_ids || []);
    els.status.textContent = `命中 ${state.matchedNodeIds.size} 个节点${state.graph.limited ? " · 已折叠更多节点" : ""}`;
    renderGraph();
  } catch {
    state.matchedNodeIds = null;
  }
}

function setStatus(message) {
  els.status.textContent = message;
}

function defaultFolderForSource(source) {
  if (source.source_platform === "feishu") return "feishu-space";
  if (source.source_platform === "tencent_docs") return "tencent-docs-space";
  if (source.source_platform === "local") return "local-imports";
  return "uncategorized";
}

function escapeHtmlLocal(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
