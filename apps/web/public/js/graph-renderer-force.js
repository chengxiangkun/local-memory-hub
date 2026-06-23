/**
 * 图谱渲染器(force-graph 适配器)。
 *
 * 用 Canvas 力导向的 force-graph 替换 SVG 原型,支撑更大规模数据。对外保持与
 * 旧 SVG 渲染器相同的签名:renderGraph(controls, graph, options) /
 * updateGraphSelection(graphEl, selectedNodeId),业务代码无需改动。
 *
 * 数据映射:{node_id,label,node_type,source_id,pollution_status} -> {id,...};
 * {from_node_id,to_node_id} -> {source,target}。force-graph 通过全局 ForceGraph
 * 提供(见 index.html 的 vendored /lib/force-graph.min.js)。
 */

const TYPE_COLORS = {
  source: "#34d399",
  topic: "#22d3ee",
  community: "#a78bfa",
  memory: "#f4b860",
  keyword: "#7dd3fc",
  person: "#f9a8d4",
  project: "#fcd34d",
  idea: "#86efac"
};
const QUARANTINE_COLOR = "#ef6b73";
const DIM_COLOR = "rgba(138,155,178,0.28)";

let fg = null;
let container = null;
let selectedId = null;
let matched = null;
let onSelect = null;
let degreeById = new Map();

export function renderGraph(controls = {}, graph = {}, options = {}) {
  const empty = controls.graphEmpty || document.querySelector("#graphEmpty");
  container = document.querySelector("#graphForce");
  const svg = document.querySelector("#graph");
  if (svg) svg.classList.add("hidden");

  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  onSelect = options.onSelectNode || null;
  selectedId = options.selectedNodeId || null;
  matched = options.matchedNodeIds || null;

  if (!container || typeof window.ForceGraph !== "function") {
    // 渲染库缺失:退回显示 SVG,避免白屏。
    if (svg) svg.classList.remove("hidden");
    return;
  }
  if (nodes.length === 0) {
    if (empty) empty.classList.remove("hidden");
    container.classList.add("hidden");
    return;
  }
  if (empty) empty.classList.add("hidden");
  container.classList.remove("hidden");

  degreeById = computeDegrees(edges);
  const data = {
    nodes: nodes.map((node) => ({ ...node, id: node.node_id })),
    links: edges.map((edge) => ({ ...edge, source: edge.from_node_id, target: edge.to_node_id }))
  };

  if (!fg) {
    fg = window.ForceGraph()(container);
    fg
      .backgroundColor("rgba(0,0,0,0)")
      .nodeRelSize(5)
      .nodeColor(nodeColor)
      .nodeVal(nodeVal)
      .nodeLabel((node) => `${escapeText(node.label)} · ${node.node_type || ""}`)
      .linkColor(linkColor)
      .linkWidth(() => 1)
      .onNodeClick((node) => {
        if (onSelect) onSelect(toOriginal(node));
        fg.centerAt(node.x, node.y, 400);
        fg.zoom(Math.max(fg.zoom(), 2), 400);
      });
    fg.d3Force("charge").strength(-90);
    fg.d3Force("link").distance(60);
  }

  sizeToContainer();
  fg.graphData(data);
  // 数据加载后自适应视图。
  setTimeout(() => { try { fg.zoomToFit(400, 40); } catch { /* ignore */ } }, 300);

  wireZoom(controls);
}

// 返回当前图谱视图 canvas 的 PNG dataURL(无 canvas 返回 null)。
// 实际落盘由宿主走 API(/api/graph/export),浏览器/桌面一致,绕开 WebKit 下载限制。
export function getGraphSnapshotDataUrl() {
  const canvas = container?.querySelector("canvas");
  if (!canvas) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function updateGraphSelection(_graphEl, nextSelectedId) {
  selectedId = nextSelectedId || null;
  if (fg) fg.nodeColor(nodeColor); // 重新应用配色以反映选中态
}

function nodeColor(node) {
  if (matched && matched.size > 0 && !matched.has(node.node_id)) return DIM_COLOR;
  if (node.pollution_status === "quarantined") return QUARANTINE_COLOR;
  if (selectedId && node.node_id === selectedId) return "#ffffff";
  return TYPE_COLORS[node.node_type] || "#9aa8b7";
}

function nodeVal(node) {
  const degree = degreeById.get(node.node_id) || 0;
  const base = node.node_type === "source" || node.node_type === "community" ? 3 : 1.4;
  return base + Math.min(8, degree * 0.6);
}

function linkColor(link) {
  if (matched && matched.size > 0) {
    const a = link.source?.node_id || link.source;
    const b = link.target?.node_id || link.target;
    if (!matched.has(a) && !matched.has(b)) return "rgba(138,155,178,0.08)";
  }
  return "rgba(138,155,178,0.22)";
}

function computeDegrees(edges) {
  const map = new Map();
  for (const edge of edges) {
    map.set(edge.from_node_id, (map.get(edge.from_node_id) || 0) + 1);
    map.set(edge.to_node_id, (map.get(edge.to_node_id) || 0) + 1);
  }
  return map;
}

function sizeToContainer() {
  if (!fg || !container) return;
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;
  fg.width(width).height(height);
}

function wireZoom(controls) {
  const slider = controls.zoomSlider || document.querySelector("#graphZoomSlider");
  const valueEl = controls.zoomValue || document.querySelector("#graphZoomValue");
  if (slider && !slider.dataset.forceWired) {
    slider.dataset.forceWired = "1";
    slider.addEventListener("input", () => {
      const factor = Number(slider.value) / 100;
      if (fg) fg.zoom(factor, 200);
      if (valueEl) valueEl.textContent = `${slider.value}%`;
    });
  }
  // 手动缩放(滚轮/触控板)时同步滑条与百分比,避免与底部滑条脱节。
  if (fg && slider && !fg.__zoomSynced) {
    fg.__zoomSynced = true;
    fg.onZoom((transform) => {
      const pct = Math.round((transform?.k || 1) * 100);
      const min = Number(slider.min) || 1;
      const max = Number(slider.max) || 400;
      const clamped = Math.max(min, Math.min(max, pct));
      slider.value = String(clamped);
      // 用钳位后的值,保证滑条与百分比一致。
      if (valueEl) valueEl.textContent = `${clamped}%`;
    });
  }
  const reset = document.querySelector("#resetGraphView");
  if (reset && !reset.dataset.forceWired) {
    reset.dataset.forceWired = "1";
    reset.addEventListener("click", () => { if (fg) fg.zoomToFit(400, 40); });
  }
}

// 还原成业务层期望的节点对象(带 node_id 等原字段)。
function toOriginal(node) {
  return {
    node_id: node.node_id,
    label: node.label,
    node_type: node.node_type,
    source_id: node.source_id,
    pollution_status: node.pollution_status,
    created_at: node.created_at
  };
}

function escapeText(value) {
  return String(value || "").replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]));
}
