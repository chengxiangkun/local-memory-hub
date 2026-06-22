import ForceGraph from "force-graph";
import { buildMockGraph } from "./mock-graph.js";

const COLORS = {
  source: "#54e0a7",
  topic: "#65b9ff",
  memory: "#e8c86d",
  person: "#d39cff",
  project: "#7ee7f2",
  idea: "#f6a6b2",
  quarantined: "#ef6b73"
};

const graphContainer = document.querySelector("#graph");
const detailBody = document.querySelector("#detailBody");
const statsEl = document.querySelector("#graphStats");
const searchInput = document.querySelector("#searchInput");
const showQuarantinedInput = document.querySelector("#showQuarantined");

const rawGraph = buildMockGraph();
let hoveredNode = null;
let selectedNode = null;
let matchedNodeIds = new Set();

const graph = ForceGraph()(graphContainer)
  .backgroundColor("#05080d")
  .nodeId("id")
  .nodeLabel((node) => `${node.label} · ${node.type}`)
  .nodeRelSize(6)
  .nodeVal((node) => nodeValue(node))
  .nodeColor((node) => nodeColor(node))
  .linkColor((link) => linkColor(link))
  .linkWidth((link) => linkWidth(link))
  .linkDirectionalParticles((link) => linkIsActive(link) ? 2 : 0)
  .linkDirectionalParticleWidth(1.5)
  .linkDirectionalParticleSpeed(0.004)
  .cooldownTicks(130)
  .d3AlphaDecay(0.025)
  .d3VelocityDecay(0.26)
  .onNodeHover((node) => {
    hoveredNode = node;
    graphContainer.style.cursor = node ? "pointer" : "grab";
    refreshGraphStyles();
  })
  .onNodeClick((node) => {
    selectedNode = node;
    renderDetail(node);
    graph.centerAt(node.x, node.y, 420);
    graph.zoom(2.2, 420);
    refreshGraphStyles();
  });

graph.d3Force("charge").strength(-120);
graph.d3Force("link").distance(74);
graph.d3Force("center").strength(0.08);

renderGraph();

window.addEventListener("resize", () => {
  graph.width(graphContainer.clientWidth);
  graph.height(graphContainer.clientHeight);
});

searchInput.addEventListener("input", () => {
  const query = searchInput.value.trim().toLowerCase();
  matchedNodeIds = query
    ? new Set(rawGraph.nodes.filter((node) => node.label.toLowerCase().includes(query) || node.type.includes(query)).map((node) => node.id))
    : new Set();
  const firstMatch = rawGraph.nodes.find((node) => matchedNodeIds.has(node.id));
  if (firstMatch && typeof firstMatch.x === "number" && typeof firstMatch.y === "number") {
    selectedNode = firstMatch;
    renderDetail(firstMatch);
    graph.centerAt(firstMatch.x, firstMatch.y, 420);
    graph.zoom(2.4, 420);
  }
  refreshGraphStyles();
});

showQuarantinedInput.addEventListener("change", renderGraph);

function renderGraph() {
  const showQuarantined = showQuarantinedInput.checked;
  const nodes = rawGraph.nodes.filter((node) => showQuarantined || node.status !== "quarantined");
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const links = rawGraph.links.filter((link) => {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;
    return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
  });
  graph.graphData({ nodes, links });
  graph.width(graphContainer.clientWidth);
  graph.height(graphContainer.clientHeight);
  statsEl.textContent = `${nodes.length} 个节点 · ${links.length} 条关系`;
  refreshGraphStyles();
}

function refreshGraphStyles() {
  graph
    .nodeVal((node) => nodeValue(node))
    .nodeColor((node) => nodeColor(node))
    .linkColor((link) => linkColor(link))
    .linkWidth((link) => linkWidth(link))
    .linkDirectionalParticles((link) => linkIsActive(link) ? 2 : 0);
}

function nodeValue(node) {
  if (node.status === "quarantined") return 8;
  if (selectedNode?.id === node.id) return 12;
  if (hoveredNode?.id === node.id) return 11;
  if (matchedNodeIds.has(node.id)) return 10;
  return node.type === "source" ? 7 : 5;
}

function nodeColor(node) {
  if (node.status === "quarantined") return COLORS.quarantined;
  if (selectedNode?.id === node.id || hoveredNode?.id === node.id || matchedNodeIds.has(node.id)) return "#7fffd0";
  return COLORS[node.type] || "#a5b4fc";
}

function linkColor(link) {
  if (linkIsActive(link)) return "rgba(127, 255, 208, 0.84)";
  return "rgba(141, 162, 183, 0.28)";
}

function linkWidth(link) {
  return linkIsActive(link) ? 1.8 : 0.8;
}

function linkIsActive(link) {
  const sourceId = typeof link.source === "object" ? link.source.id : link.source;
  const targetId = typeof link.target === "object" ? link.target.id : link.target;
  const activeId = hoveredNode?.id || selectedNode?.id;
  return Boolean(activeId && (sourceId === activeId || targetId === activeId));
}

function renderDetail(node) {
  detailBody.className = "detail-card";
  detailBody.innerHTML = `
    <strong>${escapeHtml(node.label)}</strong>
    <span>${escapeHtml(node.type)} · ${node.status === "quarantined" ? "已隔离" : "正常"}</span>
    <p>${escapeHtml(node.description)}</p>
    <p>${node.sourcePath ? `源文件：${escapeHtml(node.sourcePath)}` : "该节点暂无源文件路径。"}</p>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
