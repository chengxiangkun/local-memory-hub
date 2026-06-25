/**
 * Graph detail panel.
 *
 * Renders selected node details and wires panel buttons to injected actions.
 * Data loading and graph refresh remain owned by the main coordinator.
 */

import { escapeHtml, statusText } from "./utils.js";

export function renderSelectedNode(detailBody, { node, source, neighbors, onImpactScope, onQuarantine, onRestore, onEnrichConcept }) {
  const isConcept = node.node_type !== "source";
  const description = node.description || "";
  detailBody.innerHTML = `
    <div class="detail-card">
      <strong>${escapeHtml(node.label)}</strong>
      <div class="pill-row">
        <span class="pill good">${node.node_type === "source" ? "源资料" : "图谱节点"}</span>
        <span class="pill">${statusText(source?.memory_status || "unknown")}</span>
        <span class="pill ${source?.parse_status === "parse_failed" ? "warn" : "good"}">${statusText(source?.parse_status || "clean")}</span>
      </div>
      <p>${source?.local_file_path ? `源文件：${escapeHtml(source.local_file_path)}` : `节点类型：${escapeHtml(node.node_type || "未知")}`}</p>
      <p id="impactScope">${node.source_id ? "影响范围：读取中..." : "影响范围：该节点会通过相邻关系影响其他节点。"}</p>
      ${
        isConcept
          ? `<div class="concept-card">
               <p>概念卡${description ? "" : ' <span class="muted">(未生成)</span>'}</p>
               ${description ? `<div class="concept-desc">${escapeHtml(description)}</div>` : ""}
               <button class="ghost-button" id="enrichConcept">${description ? "刷新概念卡" : "生成概念卡"}</button>
             </div>`
          : ""
      }
      <div>
        <p>相邻关系（交叉引用）</p>
        <ul>${neighbors.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>暂无</li>"}</ul>
      </div>
      ${
        node.source_id
          ? `<button class="danger-button" id="quarantineNode">隔离该源资料</button>
             <button class="ghost-button" id="restoreNode">恢复该源资料</button>`
          : ""
      }
    </div>
  `;

  detailBody.querySelector("#enrichConcept")?.addEventListener("click", () => onEnrichConcept?.(node.node_id));

  if (!node.source_id) return;
  onImpactScope?.(node.source_id);
  detailBody.querySelector("#quarantineNode")?.addEventListener("click", () => onQuarantine?.(node.source_id));
  detailBody.querySelector("#restoreNode")?.addEventListener("click", () => onRestore?.(node.source_id));
}

export function renderEmptyNodeDetail(detailBody) {
  detailBody.innerHTML = `
    <div class="detail-empty">
      <strong>选择一个节点</strong>
      <span>查看来源、处理状态、影响范围和污染治理操作。</span>
    </div>
  `;
}
