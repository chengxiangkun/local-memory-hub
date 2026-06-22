/**
 * Graph renderer.
 *
 * Converts graph nodes and edges into SVG elements. This module does not fetch
 * data and does not mutate app state. Selection behavior is injected by the
 * caller to keep rendering separate from business actions.
 */

import { svg } from "./utils.js";

export function renderGraph({ graphEl, graphEmpty }, graph, options = {}) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const previousScale = graphEl.__zoom?.scale || 1;
  graphEl.innerHTML = "";
  graphEl.classList.toggle("graph-large", nodes.length + edges.length > 180);
  graphEl.classList.toggle("graph-compact", options.mode === "time" || options.mode === "vector");
  graphEmpty.classList.toggle("hidden", nodes.length > 0);
  if (nodes.length === 0) return;

  const layout = buildLayout(nodes, edges, options.selectedNodeId, options.mode);
  const highlightIds = options.matchedNodeIds || new Set(nodes.map((node) => node.node_id));
  const selectedNode = options.selectedNodeId ? layout.byId.get(options.selectedNodeId) : null;
  const defs = buildDefs();
  const edgeLayer = svg("g", { class: "graph-edges" });
  const nodeLayer = svg("g", { class: "graph-nodes" });
  graphEl.append(defs, edgeLayer, nodeLayer);
  bindGraphZoom(graphEl, arguments[0]);
  bindGraphDrag(graphEl);
  const edgeElements = [];
  const nodeElements = new Map();

  for (const [index, edge] of edges.entries()) {
    const from = layout.byId.get(edge.from_node_id);
    const to = layout.byId.get(edge.to_node_id);
    if (!from || !to) continue;
    const hot = selectedNode && (from.node_id === selectedNode.node_id || to.node_id === selectedNode.node_id);
    const edgeElement = svg("line", {
      class: `edge ${hot ? "hot" : ""}`,
      style: `--edge-delay:${Math.min(index * 10, 360)}ms;--edge-depth:${Math.min(from.depth || 0.5, to.depth || 0.5)};`,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      "data-from": edge.from_node_id,
      "data-to": edge.to_node_id
    });
    edgeLayer.append(edgeElement);
    edgeElements.push({ element: edgeElement, from: edge.from_node_id, to: edge.to_node_id });
  }

  for (const [index, node] of layout.nodes.entries()) {
    const dim = !highlightIds.has(node.node_id);
    const kind = node.node_type || "topic";
    const radius = nodeRadius(node);
    const label = trimLabel(node.label, kind === "source" ? 30 : 16);
    const labelClass = node.label_visible ? "label-visible" : "label-muted";
    const motion = nodeMotion(node);
    const group = svg("g", {
      class: `node ${kind} ${node.node_id === options.selectedNodeId ? "selected" : ""} ${dim ? "dim" : ""}`,
      transform: `translate(${node.x} ${node.y})`,
      "data-node-id": node.node_id,
      "data-depth": node.depth,
      style: `--node-depth:${node.depth || 0.5};--node-scale:${0.72 + (node.depth || 0.5) * 0.38};`
    });
    const body = svg("g", {
      class: "node-body",
      style: `--pop-delay:${Math.min(index * 18, 520)}ms;--drift-x:${motion.x}px;--drift-y:${motion.y}px;--drift-duration:${motion.duration}s;--drift-delay:-${motion.delay}s;`
    });
    body.append(
      svg("circle", { class: "node-aura", r: radius + 13 }),
      svg("circle", { class: "node-ring", r: radius + 5 }),
      svg("circle", { class: "node-core", r: radius }),
      svg("text", { class: `node-label ${labelClass}`, x: radius + 14, y: 5 }, label),
      svg("title", {}, node.label)
    );
    group.append(body);
    group.addEventListener("click", () => {
      if (graphEl.__dragMoved) {
        graphEl.__dragMoved = false;
        return;
      }
      options.onSelectNode?.(node);
    });
    group.addEventListener("mouseenter", () => highlightNeighborhood(graphEl, node.node_id));
    group.addEventListener("mouseleave", () => clearNeighborhood(graphEl));
    nodeLayer.append(group);
    nodeElements.set(node.node_id, group);
  }
  graphEl.__sphere = {
    rotationX: 0,
    rotationY: 0,
    nodes: layout.nodes.map((node) => ({ ...node })),
    edges,
    nodeElements,
    edgeElements,
    frame: 0,
    pendingProjection: null
  };
  graphEl.setZoom?.(previousScale);
}

export function updateGraphSelection(graphEl, selectedNodeId) {
  graphEl.querySelectorAll(".node").forEach((node) => {
    node.classList.toggle("selected", node.dataset.nodeId === selectedNodeId);
  });
  graphEl.querySelectorAll(".edge").forEach((edge) => {
    edge.classList.toggle("hot", edge.dataset.from === selectedNodeId || edge.dataset.to === selectedNodeId);
  });
}

function buildLayout(nodes, edges, selectedNodeId, mode = "relation") {
  const cx = 560;
  const cy = 360;
  if (mode === "time") return buildTimelineLayout(nodes, edges);
  const selectedIndex = Math.max(0, nodes.findIndex((node) => node.node_id === selectedNodeId));
  const degreeById = buildDegreeMap(nodes, edges);
  const orderedNodes = [...nodes].sort((left, right) => {
    const degreeDiff = (degreeById.get(right.node_id) || 0) - (degreeById.get(left.node_id) || 0);
    if (degreeDiff !== 0) return degreeDiff;
    return String(left.label).localeCompare(String(right.label), "zh-CN");
  });

  const laidOut = orderedNodes.map((node, index) => {
    if (node.node_id === selectedNodeId || (!selectedNodeId && index === selectedIndex)) {
      return { ...node, x: cx, y: cy, sphere_x: 0, sphere_y: 0, sphere_z: 1, orbit: 280, depth: 1, label_visible: true };
    }

    const seed = hashString(`${node.node_id}:${node.label}`);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const count = Math.max(orderedNodes.length - 1, 1);
    const z = 1 - (2 * (index + 0.5)) / count;
    const sphereRadius = Math.sqrt(Math.max(0.08, 1 - z * z));
    const angle = index * goldenAngle + (seed % 90) * Math.PI / 180;
    const depth = (z + 1) / 2;
    const perspective = 0.72 + depth * 0.34;
    const degree = degreeById.get(node.node_id) || 0;
    const orbit = 260 + Math.min(nodes.length * 0.9, 80);
    const labelVisible = depth > 0.7 || degree >= 4 || index < 4;
    return {
      ...node,
      x: clamp(cx + Math.cos(angle) * sphereRadius * orbit * perspective, 96, 1024),
      y: clamp(cy + Math.sin(angle) * sphereRadius * orbit * 0.72 * perspective, 80, 640),
      sphere_x: Math.cos(angle) * sphereRadius,
      sphere_y: Math.sin(angle) * sphereRadius,
      sphere_z: z,
      orbit,
      depth,
      label_visible: labelVisible
    };
  });
  return { nodes: laidOut, byId: new Map(laidOut.map((node) => [node.node_id, node])) };
}

function buildTimelineLayout(nodes, edges) {
  const degreeById = buildDegreeMap(nodes, edges);
  const orderedNodes = [...nodes].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  const columns = Math.max(1, Math.ceil(Math.sqrt(orderedNodes.length) * 1.35));
  const rows = Math.max(1, Math.ceil(orderedNodes.length / columns));
  const laidOut = orderedNodes.map((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = columns === 1 ? 560 : 120 + column * (880 / Math.max(1, columns - 1));
    const y = rows === 1 ? 360 : 130 + row * (450 / Math.max(1, rows - 1));
    const depth = 0.58 + Math.min((degreeById.get(node.node_id) || 0) / 12, 0.36);
    return {
      ...node,
      x,
      y,
      sphere_x: (x - 560) / 360,
      sphere_y: (y - 360) / 260,
      sphere_z: depth * 2 - 1,
      orbit: 260,
      depth,
      label_visible: index % Math.max(1, Math.ceil(orderedNodes.length / 16)) === 0 || (degreeById.get(node.node_id) || 0) >= 4
    };
  });
  return { nodes: laidOut, byId: new Map(laidOut.map((node) => [node.node_id, node])) };
}

function buildDefs() {
  const defs = svg("defs");
  const glow = svg("filter", {
    id: "node-glow",
    x: "-70%",
    y: "-70%",
    width: "240%",
    height: "240%"
  });
  glow.append(
    svg("feGaussianBlur", { stdDeviation: "3", result: "coloredBlur" }),
    svg("feMerge", {}, "")
  );
  glow.lastChild.append(svg("feMergeNode", { in: "coloredBlur" }), svg("feMergeNode", { in: "SourceGraphic" }));
  defs.append(glow);
  return defs;
}

function buildDegreeMap(nodes, edges) {
  const degreeById = new Map(nodes.map((node) => [node.node_id, 0]));
  for (const edge of edges) {
    degreeById.set(edge.from_node_id, (degreeById.get(edge.from_node_id) || 0) + 1);
    degreeById.set(edge.to_node_id, (degreeById.get(edge.to_node_id) || 0) + 1);
  }
  return degreeById;
}

function nodeRadius(node) {
  if (node.node_type === "community") return 10;
  if (node.node_type === "source") return 8;
  if (node.node_type === "memory") return 5.5;
  return 4.8;
}

function nodeMotion(node) {
  const seed = hashString(`motion:${node.node_id}:${node.label}`);
  return {
    x: ((seed % 9) - 4) * 0.72,
    y: (((seed >> 3) % 9) - 4) * 0.64,
    duration: 7 + (seed % 5),
    delay: (seed % 700) / 100
  };
}

function trimLabel(value, maxLength) {
  const text = String(value || "未命名节点");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function highlightNeighborhood(graphEl, nodeId) {
  const neighborIds = new Set([nodeId]);
  graphEl.querySelectorAll(".edge").forEach((edge) => {
    const from = edge.dataset.from;
    const to = edge.dataset.to;
    const active = from === nodeId || to === nodeId;
    edge.classList.toggle("hovered", active);
    if (active) {
      neighborIds.add(from);
      neighborIds.add(to);
    }
  });
  graphEl.classList.add("has-hover");
  graphEl.querySelectorAll(".node").forEach((node) => {
    const active = neighborIds.has(node.dataset.nodeId);
    node.classList.toggle("hovered", node.dataset.nodeId === nodeId);
    node.classList.toggle("neighbor", active && node.dataset.nodeId !== nodeId);
    node.classList.toggle("dim-hover", !active);
  });
}

function clearNeighborhood(graphEl) {
  graphEl.classList.remove("has-hover");
  graphEl.querySelectorAll(".hovered,.neighbor,.dim-hover").forEach((item) => {
    item.classList.remove("hovered", "neighbor", "dim-hover");
  });
}

function bindGraphZoom(graphEl, controls = {}) {
  if (graphEl.dataset.zoomBound) return;
  graphEl.dataset.zoomBound = "true";
  graphEl.__zoom = { scale: 1 };
  graphEl.setZoom = (scale) => {
    const next = clamp(scale, 0.55, 2.4);
    graphEl.__zoom = { scale: next };
    const width = 1120 / next;
    const height = 720 / next;
    graphEl.setAttribute("viewBox", `${560 - width / 2} ${360 - height / 2} ${width} ${height}`);
    if (controls.zoomSlider) controls.zoomSlider.value = String(Math.round(next * 100));
    if (controls.zoomValue) controls.zoomValue.textContent = `${Math.round(next * 100)}%`;
  };
  graphEl.addEventListener("wheel", (event) => {
    event.preventDefault();
    const next = (graphEl.__zoom?.scale || 1) * (event.deltaY > 0 ? 0.9 : 1.1);
    graphEl.setZoom(next);
  }, { passive: false });
  graphEl.addEventListener("dblclick", () => {
    graphEl.setZoom(1);
  });
}

function bindGraphDrag(graphEl) {
  if (graphEl.dataset.dragBound) return;
  graphEl.dataset.dragBound = "true";
  const dragThreshold = 8;
  graphEl.addEventListener("pointerdown", (event) => {
    if (event.target.closest?.(".node")) return;
    graphEl.__drag = {
      x: event.clientX,
      y: event.clientY,
      rotationX: graphEl.__sphere?.rotationX || 0,
      rotationY: graphEl.__sphere?.rotationY || 0
    };
    graphEl.__dragMoved = false;
    graphEl.classList.add("is-dragging");
    graphEl.setPointerCapture(event.pointerId);
  });
  graphEl.addEventListener("pointermove", (event) => {
    if (!graphEl.__drag || !graphEl.__sphere) return;
    const dx = event.clientX - graphEl.__drag.x;
    const dy = event.clientY - graphEl.__drag.y;
    if (!graphEl.__dragMoved && Math.hypot(dx, dy) < dragThreshold) return;
    graphEl.__dragMoved = true;
    graphEl.__sphere.pendingProjection = {
      rotationY: graphEl.__drag.rotationY + dx * 0.008,
      rotationX: clamp(graphEl.__drag.rotationX - dy * 0.008, -1.2, 1.2)
    };
    scheduleSphereProjection(graphEl);
  });
  graphEl.addEventListener("pointerup", endGraphDrag);
  graphEl.addEventListener("pointercancel", endGraphDrag);
}

function endGraphDrag() {
  const graphEl = this;
  graphEl.__drag = null;
  graphEl.classList.remove("is-dragging");
  setTimeout(() => {
    graphEl.__dragMoved = false;
  }, 80);
}

function applySphereProjection(graphEl) {
  const sphere = graphEl.__sphere;
  const projected = new Map();
  const pending = sphere.pendingProjection || {};
  sphere.rotationX = pending.rotationX ?? sphere.rotationX;
  sphere.rotationY = pending.rotationY ?? sphere.rotationY;
  sphere.pendingProjection = null;
  for (const node of sphere.nodes) {
    const next = projectSphereNode(node, sphere.rotationX, sphere.rotationY);
    projected.set(node.node_id, next);
    const element = sphere.nodeElements.get(node.node_id);
    if (!element) continue;
    element.setAttribute("transform", `translate(${next.x} ${next.y})`);
    element.dataset.depth = next.depth;
    element.style.setProperty("--node-depth", next.depth);
    element.style.setProperty("--node-scale", 0.72 + next.depth * 0.38);
  }
  for (const edge of sphere.edgeElements) {
    const from = projected.get(edge.from);
    const to = projected.get(edge.to);
    if (!from || !to) continue;
    edge.element.setAttribute("x1", from.x);
    edge.element.setAttribute("y1", from.y);
    edge.element.setAttribute("x2", to.x);
    edge.element.setAttribute("y2", to.y);
    edge.element.style.setProperty("--edge-depth", Math.min(from.depth, to.depth));
  }
  sphere.frame = 0;
}

function scheduleSphereProjection(graphEl) {
  const sphere = graphEl.__sphere;
  if (!sphere || sphere.frame) return;
  sphere.frame = requestAnimationFrame(() => applySphereProjection(graphEl));
}

function projectSphereNode(node, rotationX, rotationY) {
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const x1 = node.sphere_x * cosY + node.sphere_z * sinY;
  const z1 = -node.sphere_x * sinY + node.sphere_z * cosY;
  const y1 = node.sphere_y * cosX - z1 * sinX;
  const z2 = node.sphere_y * sinX + z1 * cosX;
  const depth = (z2 + 1) / 2;
  const perspective = 0.72 + depth * 0.34;
  const orbit = node.orbit || 280;
  return {
    x: clamp(560 + x1 * orbit * perspective, 96, 1024),
    y: clamp(360 + y1 * orbit * 0.72 * perspective, 80, 640),
    depth
  };
}
