const API = "http://127.0.0.1:4317";
const graphEl = document.querySelector("#graph");
const detailBody = document.querySelector("#detailBody");
const statusEl = document.querySelector("#status");
const emptyEl = document.querySelector("#empty");
const searchEl = document.querySelector("#search");

let graph = { nodes: [], edges: [] };
let selectedNodeId = null;
let matchedNodeIds = null;

document.querySelector("#fit").addEventListener("click", loadGraph);
document.querySelector("#importText").addEventListener("click", importExampleText);
document.querySelector("#emptyImport").addEventListener("click", importExampleText);
searchEl.addEventListener("input", debounce(searchGraph, 180));

loadGraph();

async function loadGraph() {
  try {
    statusEl.textContent = "读取图谱中";
    const res = await fetch(`${API}/api/graph`);
    graph = await res.json();
    matchedNodeIds = null;
    statusEl.textContent = `${graph.nodes.length} 个节点`;
    renderGraph();
  } catch (error) {
    statusEl.textContent = "API 未连接";
    emptyEl.classList.remove("hidden");
  }
}

async function importExampleText() {
  try {
    statusEl.textContent = "导入示例文本";
    const imported = await post("/api/import", {
      entrypoint: "onboarding",
      source_hint: "text",
      payload: {
        title: `示例记忆 ${new Date().toLocaleTimeString()}`,
        text:
          "这是 Local Memory Hub 的第一条记忆。它会进入源资料库，解析成文本片段，并在图谱首页生成源资料节点和主题节点。"
      }
    });
    if (imported.error) throw new Error(imported.message || imported.error);
    const parsed = await post("/api/parse", { source_id: imported.source.source_id });
    if (parsed.status !== "success") throw new Error(parsed.error || "解析失败");
    await loadGraph();
    statusEl.textContent = "导入成功";
  } catch (error) {
    statusEl.textContent = `导入失败：${error.message}`;
  }
}

function renderGraph() {
  const query = searchEl.value.trim().toLowerCase();
  graphEl.innerHTML = "";
  emptyEl.classList.toggle("hidden", graph.nodes.length > 0);
  if (graph.nodes.length === 0) return;

  const layout = buildLayout(graph);
  const visibleNodeIds = new Set(layout.nodes.map((node) => node.node_id));
  const highlightIds =
    matchedNodeIds ||
    new Set(
      layout.nodes
        .filter((node) => !query || node.label.toLowerCase().includes(query) || node.node_type.includes(query))
        .map((node) => node.node_id)
    );

  const edgeLayer = svg("g");
  const nodeLayer = svg("g");
  graphEl.append(edgeLayer, nodeLayer);

  for (const edge of graph.edges) {
    const from = layout.byId.get(edge.from_node_id);
    const to = layout.byId.get(edge.to_node_id);
    if (!from || !to) continue;
    const line = svg("line", {
      class: "edge",
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y
    });
    edgeLayer.append(line);
  }

  for (const node of layout.nodes) {
    const isMatch = highlightIds.has(node.node_id);
    const g = svg("g", {
      class: `node ${node.node_type} ${selectedNodeId === node.node_id ? "selected" : ""} ${query && !isMatch ? "dim" : ""}`,
      transform: `translate(${node.x} ${node.y})`
    });
    g.append(
      svg("circle", { r: node.node_type === "source" ? 16 : 12 }),
      svg("text", { x: 22, y: 5 }, node.label.slice(0, 26))
    );
    g.addEventListener("click", () => selectNode(node, visibleNodeIds));
    nodeLayer.append(g);
  }
}

function selectNode(node) {
  selectedNodeId = node.node_id;
  const neighbors = graph.edges
    .filter((edge) => edge.from_node_id === node.node_id || edge.to_node_id === node.node_id)
    .map((edge) => {
      const otherId = edge.from_node_id === node.node_id ? edge.to_node_id : edge.from_node_id;
      const other = graph.nodes.find((item) => item.node_id === otherId);
      return `${other?.label || otherId}：${edge.reason}`;
    });

  detailBody.innerHTML = `
    <p><strong>${escapeHtml(node.label)}</strong></p>
    <p><span class="pill">${node.node_type === "source" ? "源资料" : "主题"}</span><span class="pill">${node.pollution_status === "clean" ? "干净" : node.pollution_status}</span></p>
    <p>源资料 ID：${node.source_id || "无"}</p>
    <p id="impactScope">影响范围：读取中...</p>
    <p>相邻关系：</p>
    <ul>${neighbors.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>暂无</li>"}</ul>
    ${
      node.source_id
        ? `<button id="quarantineNode">隔离该源资料</button> <button id="restoreNode">恢复该源资料</button>`
        : ""
    }
  `;
  if (node.source_id) loadImpactScope(node.source_id);
  const quarantineButton = document.querySelector("#quarantineNode");
  if (quarantineButton) {
    quarantineButton.addEventListener("click", async () => {
      await post("/api/sources/quarantine", { source_id: node.source_id });
      selectedNodeId = null;
      detailBody.innerHTML = "<p>已隔离。该源资料、文本片段和图谱节点将从普通视图中隐藏。</p>";
      await loadGraph();
    });
  }
  const restoreButton = document.querySelector("#restoreNode");
  if (restoreButton) {
    restoreButton.addEventListener("click", async () => {
      await post("/api/sources/restore", { source_id: node.source_id });
      selectedNodeId = null;
      detailBody.innerHTML = "<p>已恢复。该源资料、文本片段和图谱节点会重新进入普通视图。</p>";
      await loadGraph();
    });
  }
  renderGraph();
}

async function searchGraph() {
  const query = searchEl.value.trim();
  if (!query) {
    matchedNodeIds = null;
    renderGraph();
    return;
  }
  try {
    const res = await fetch(`${API}/api/graph/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    matchedNodeIds = new Set(data.nodes.map((node) => node.node_id));
    statusEl.textContent = `命中 ${matchedNodeIds.size} 个节点`;
    renderGraph();
  } catch (error) {
    statusEl.textContent = `搜索失败：${error.message}`;
  }
}

async function loadImpactScope(sourceId) {
  try {
    const res = await fetch(`${API}/api/sources/impact?source_id=${encodeURIComponent(sourceId)}`);
    const data = await res.json();
    const el = document.querySelector("#impactScope");
    if (el) {
      el.textContent = `影响范围：${data.counts.segments} 个文本片段，${data.counts.graph_nodes} 个图谱节点，${data.counts.graph_edges} 条关系`;
    }
  } catch {
    const el = document.querySelector("#impactScope");
    if (el) el.textContent = "影响范围：读取失败";
  }
}

function buildLayout(data) {
  const cx = 500;
  const cy = 350;
  const radius = Math.min(280, 90 + data.nodes.length * 18);
  const nodes = data.nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(data.nodes.length, 1) - Math.PI / 2;
    const typeOffset = node.node_type === "source" ? -30 : 30;
    return {
      ...node,
      x: cx + Math.cos(angle) * (radius + typeOffset),
      y: cy + Math.sin(angle) * (radius + typeOffset)
    };
  });
  return {
    nodes,
    byId: new Map(nodes.map((node) => [node.node_id, node]))
  };
}

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text) el.textContent = text;
  return el;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
