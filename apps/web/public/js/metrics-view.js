/**
 * Metrics view.
 *
 * Updates small dashboard counters from already-loaded state. This module does
 * not fetch data and does not derive business status beyond simple counts.
 */

export function renderMetrics({ sources, graph, externalActive = false }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = sources.filter((source) => String(source.created_at).startsWith(today)).length;
  const riskCount = sources.filter((source) => source.parse_status === "parse_failed" || source.pollution_status === "quarantined").length;

  setText("#todayCount", todayCount);
  setText("#riskCount", riskCount);
  setText("#homeSourceCount", sources.length);
  setText("#homeGraphCount", graph.nodes.length);
  setText("#homeRiskCount", riskCount);

  // 「下一步动作」按真实数据点亮,而非写死。
  setStepDone("save", sources.length > 0);
  setStepDone("memory", (graph.nodes || []).length > 0);
  setStepDone("external", externalActive);
}

function setStepDone(step, done) {
  const el = document.querySelector(`.timeline-item[data-step="${step}"]`);
  if (el) el.classList.toggle("done", Boolean(done));
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}
