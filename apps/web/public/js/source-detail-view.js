/**
 * Source detail drawer.
 *
 * Renders a single source's full state — metadata, processing status, counts,
 * trace timeline, governance status — plus parsed segments with per-segment
 * quarantine/restore. All mutations are delegated to injected callbacks so the
 * main coordinator owns refresh behavior.
 */

import { badge, escapeHtml, statusText } from "./utils.js";

export function renderSourceDetail(container, detail, handlers = {}) {
  if (!container) return;
  if (!detail || !detail.source) {
    container.innerHTML = `<div class="detail-empty">未找到该源资料。</div>`;
    return;
  }
  const { source, segments = [], counts = {} } = detail;
  const quarantined = source.pollution_status === "quarantined";

  container.innerHTML = `
    <div class="detail-section">
      <h3>${escapeHtml(source.title || "未命名资料")}</h3>
      <div class="detail-status-row">
        ${badge(source.import_status)}
        ${badge(source.parse_status)}
        ${badge(source.memory_status)}
        ${badge(source.trace_status)}
        ${badge(source.pollution_status)}
      </div>
    </div>

    <div class="detail-section">
      <h4>元数据</h4>
      <dl class="detail-meta">
        ${metaRow("来源平台", source.source_platform)}
        ${metaRow("类型", source.source_type)}
        ${metaRow("入口", source.entrypoint)}
        ${metaRow("原始链接", source.original_url, true)}
        ${metaRow("本地路径", source.local_file_path)}
        ${metaRow("内容指纹", source.content_hash)}
        ${metaRow("导入时间", formatTime(source.created_at))}
        ${metaRow("更新时间", formatTime(source.updated_at))}
      </dl>
    </div>

    <div class="detail-section">
      <h4>记忆与索引</h4>
      <div class="detail-counts">
        <div><strong>${counts.segments ?? segments.length}</strong><span>文本片段</span></div>
        <div><strong>${counts.segments_quarantined ?? 0}</strong><span>隔离片段</span></div>
        <div><strong>${counts.vectors_active ?? 0}/${counts.vectors_total ?? 0}</strong><span>向量(有效/总)</span></div>
        <div><strong>${counts.graph_nodes ?? 0}</strong><span>图谱节点</span></div>
        <div><strong>${counts.graph_edges ?? 0}</strong><span>图谱关系</span></div>
      </div>
    </div>

    <div class="detail-section">
      <h4>操作</h4>
      <div class="detail-actions">
        <button class="secondary-button" type="button" data-detail-reparse>重新解析(重建片段/向量/图谱)</button>
        ${source.local_file_path ? `<button class="secondary-button" type="button" data-detail-open-file>打开源文件</button>` : ""}
        ${quarantined
          ? `<button class="secondary-button" type="button" data-detail-restore>恢复</button>`
          : `<button class="secondary-button" type="button" data-detail-quarantine>隔离</button>`}
        <button class="danger-button" type="button" data-detail-delete>删除</button>
      </div>
    </div>

    <div class="detail-section">
      <h4>文本片段 · ${segments.length} 段</h4>
      <div class="detail-segments">
        ${segments.map((segment) => renderSegment(segment)).join("") || `<div class="detail-empty">暂无文本片段。</div>`}
      </div>
    </div>
  `;

  bind(container, "[data-detail-reparse]", () => handlers.onReparse?.(source.source_id));
  bind(container, "[data-detail-open-file]", () => handlers.onOpenFile?.(source.source_id));
  bind(container, "[data-detail-quarantine]", () => handlers.onQuarantine?.(source.source_id));
  bind(container, "[data-detail-restore]", () => handlers.onRestore?.(source.source_id));
  bind(container, "[data-detail-delete]", () => handlers.onDelete?.(source.source_id));
  container.querySelectorAll("[data-segment-quarantine]").forEach((button) => {
    button.addEventListener("click", () => handlers.onSegmentQuarantine?.(button.dataset.segmentQuarantine));
  });
  container.querySelectorAll("[data-segment-restore]").forEach((button) => {
    button.addEventListener("click", () => handlers.onSegmentRestore?.(button.dataset.segmentRestore));
  });
}

function renderSegment(segment) {
  const isQuarantined = segment.pollution_status === "quarantined";
  const preview = compact(segment.text);
  return `
    <div class="detail-segment ${isQuarantined ? "quarantined" : ""}">
      <div class="detail-segment-head">
        <span>#${segment.segment_index}${segment.title_path ? ` · ${escapeHtml(segment.title_path)}` : ""}</span>
        ${isQuarantined ? `<span class="status-badge warn">已隔离</span>` : ""}
        ${isQuarantined
          ? `<button class="row-action-button" type="button" data-segment-restore="${escapeHtml(segment.segment_id)}">恢复片段</button>`
          : `<button class="row-action-button warning-button" type="button" data-segment-quarantine="${escapeHtml(segment.segment_id)}">隔离片段</button>`}
      </div>
      <p>${escapeHtml(preview)}</p>
    </div>
  `;
}

function metaRow(label, value, isLink = false) {
  if (!value) return "";
  const safe = escapeHtml(String(value));
  const rendered = isLink ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>` : safe;
  return `<div><dt>${escapeHtml(label)}</dt><dd>${rendered}</dd></div>`;
}

function bind(container, selector, handler) {
  container.querySelector(selector)?.addEventListener("click", handler);
}

function compact(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "该片段没有可展示的文本。";
  return normalized.length <= 400 ? normalized : `${normalized.slice(0, 400)}…`;
}

function formatTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return String(value);
  }
}
