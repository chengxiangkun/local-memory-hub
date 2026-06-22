/**
 * Source library view.
 *
 * Renders source records and exposes row clicks through an injected callback.
 * The module does not call backend APIs directly.
 */

import { badge, escapeHtml, formatDate, statusText } from "./utils.js";

export function renderSources(sourceTable, sources, { folders = [], assignments = {}, parsingSourceIds = new Set(), pagination = {}, onImpactScope, onMoveSource, onParseSource, onOpenSource, onOpenFile, onPreviewSource, onOpenGovernance, onPageChange, onPageSizeChange } = {}) {
  const pageSize = Number(pagination.pageSize || 10);
  const pageCount = Math.max(1, Math.ceil(sources.length / pageSize));
  const page = clamp(Number(pagination.page || 1), 1, pageCount);
  const startIndex = (page - 1) * pageSize;
  const pageSources = sources.slice(startIndex, startIndex + pageSize);

  sourceTable.innerHTML = `
    <div class="source-head">
      <span>文件名</span><span>文件夹</span><span>来源</span><span>同步状态</span><span>处理状态</span><span>是否入记忆</span><span>可追溯</span><span>操作</span>
    </div>
    ${
      pageSources.map((source) => `
        <div class="source-row ${isQuarantined(source) ? "quarantined" : ""}" data-source-id="${source.source_id}">
          <strong>${escapeHtml(source.title)}<small>${formatDate(source.created_at)}</small></strong>
          <span>${renderFolderSelect(source, folders, assignments)}</span>
          <span>${escapeHtml(source.source_platform)}</span>
          ${badge(syncStatus(source))}
          ${badge(displayParseStatus(source, parsingSourceIds.has(source.source_id)))}
          ${badge(displayMemoryStatus(source))}
          ${renderTraceability(source)}
          <span class="source-actions-cell">${renderPreviewAction(source)}${renderParseAction(source, parsingSourceIds.has(source.source_id))}</span>
        </div>
      `).join("") || `<div class="source-row"><strong>暂无源资料<small>导入文本后会出现在这里</small></strong><span>-</span><span>-</span><span>-</span><span>-</span><span>-</span><span>-</span><span>-</span></div>`
    }
    ${renderPagination({ total: sources.length, page, pageSize, pageCount, startIndex })}
  `;

  sourceTable.querySelectorAll("[data-source-id]").forEach((row) => {
    row.addEventListener("click", () => onImpactScope?.(row.dataset.sourceId));
  });
  sourceTable.querySelectorAll("[data-source-folder]").forEach((select) => {
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("change", () => onMoveSource?.(select.dataset.sourceFolder, select.value));
  });
  sourceTable.querySelectorAll("[data-parse-source]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onParseSource?.(button.dataset.parseSource);
    });
  });
  sourceTable.querySelectorAll("[data-open-source]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onOpenSource?.(button.dataset.openSource);
    });
  });
  sourceTable.querySelectorAll("[data-open-file]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onOpenFile?.(button.dataset.openFile);
    });
  });
  sourceTable.querySelectorAll("[data-preview-source]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onPreviewSource?.(button.dataset.previewSource);
    });
  });
  sourceTable.querySelectorAll("[data-open-governance]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onOpenGovernance?.(button.dataset.openGovernance);
    });
  });
  sourceTable.querySelectorAll("[data-source-page]").forEach((button) => {
    button.addEventListener("click", () => onPageChange?.(Number(button.dataset.sourcePage)));
  });
  sourceTable.querySelector("[data-source-page-size]")?.addEventListener("change", (event) => {
    onPageSizeChange?.(Number(event.target.value));
  });
}

function renderPagination({ total, page, pageSize, pageCount, startIndex }) {
  const start = total === 0 ? 0 : startIndex + 1;
  const end = Math.min(total, startIndex + pageSize);
  const pageOptions = [8, 10, 15, 20, 30];
  return `
    <div class="source-pagination">
      <div class="source-page-summary">
        <strong>${start}-${end}</strong>
        <span>/ ${total} 条资料</span>
      </div>
      <div class="source-page-controls">
        <label>
          每页
          <select data-source-page-size>
            ${pageOptions.map((size) => `<option value="${size}" ${size === pageSize ? "selected" : ""}>${size}</option>`).join("")}
          </select>
        </label>
        <button class="ghost-button" type="button" data-source-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>上一页</button>
        <span>${page} / ${pageCount}</span>
        <button class="ghost-button" type="button" data-source-page="${page + 1}" ${page >= pageCount ? "disabled" : ""}>下一页</button>
      </div>
    </div>
  `;
}

function renderPreviewAction(source) {
  if (isQuarantined(source)) return "";
  if (source.memory_status !== "memory_indexed") return "";
  return `<button class="row-action-button" type="button" data-preview-source="${escapeHtml(source.source_id)}">内容</button>`;
}

function renderParseAction(source, isParsing = false) {
  if (isQuarantined(source)) {
    return `<button class="row-action-button warning-button" type="button" data-open-governance="${escapeHtml(source.source_id)}">治理</button>`;
  }
  if (isParsing) {
    return `<button class="row-action-button parsing-button" type="button" disabled><span class="mini-spinner"></span>解析中</button>`;
  }
  if (source.parse_status === "export_required" && source.original_url) {
    return `<button class="row-action-button" type="button" data-open-source="${escapeHtml(source.original_url)}">打开</button>`;
  }
  if (source.parse_status === "export_required") return `<span class="source-action-hint">待导出</span>`;
  if (["parse_pending", "parse_failed", "llm_fallback_pending"].includes(source.parse_status)) {
    return `<button class="row-action-button" type="button" data-parse-source="${escapeHtml(source.source_id)}">解析</button>`;
  }
  if (source.local_file_path && source.parse_status !== "parse_pending") {
    return `<button class="row-action-button" type="button" data-open-file="${escapeHtml(source.source_id)}">打开</button>`;
  }
  return "-";
}

function renderTraceability(source) {
  const items = traceEvents(source);
  const traceStatus = isQuarantined(source) ? "trace_quarantined" : source.trace_status;
  return `
    <span class="trace-badge-wrap ${isQuarantined(source) ? "quarantined" : ""}">
      ${badge(traceStatus)}
      <span class="trace-popover" role="tooltip">
        ${items.map((item) => `
          <span>
            <strong>${escapeHtml(item.label)}</strong>
            <em>${escapeHtml(item.time)}</em>
            <small>${escapeHtml(item.detail)}</small>
          </span>
        `).join("")}
      </span>
    </span>
  `;
}

function traceEvents(source) {
  const importedAt = source.created_at;
  const updatedAt = source.updated_at || source.created_at;
  const items = [];
  if (isQuarantined(source)) {
    items.push({
      label: "隔离",
      timestamp: updatedAt,
      time: fullDate(updatedAt),
      detail: "已从搜索、问答、向量索引和图谱展示中排除；可在污染治理页恢复或删除。"
    });
  }
  items.push(
    {
      label: "导入",
      timestamp: importedAt,
      time: fullDate(importedAt),
      detail: `${statusText(source.import_status)} · ${source.source_platform || "未知来源"} · ${source.source_type || "未知类型"}`
    },
    {
      label: "同步",
      timestamp: updatedAt,
      time: fullDate(updatedAt),
      detail: statusText(syncStatus(source))
    },
    {
      label: "解析",
      timestamp: ["parse_pending", "export_required"].includes(source.parse_status) ? "" : updatedAt,
      time: ["parse_pending", "export_required"].includes(source.parse_status) ? "待执行" : fullDate(updatedAt),
      detail: statusText(source.parse_status)
    },
    {
      label: "入记忆",
      timestamp: isQuarantined(source) || source.memory_status !== "memory_indexed" ? "" : updatedAt,
      time: isQuarantined(source) ? "已暂停" : source.memory_status === "memory_indexed" ? fullDate(updatedAt) : "未完成",
      detail: statusText(displayMemoryStatus(source))
    }
  );
  if (source.pollution_status && source.pollution_status !== "clean") {
    items.push({
      label: "治理",
      timestamp: updatedAt,
      time: fullDate(updatedAt),
      detail: statusText(source.pollution_status)
    });
  }
  return items.sort(compareTraceEventTime);
}

function compareTraceEventTime(left, right) {
  const leftTime = Date.parse(left.timestamp || "");
  const rightTime = Date.parse(right.timestamp || "");
  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
  if (Number.isNaN(leftTime)) return 1;
  if (Number.isNaN(rightTime)) return -1;
  if (rightTime !== leftTime) return rightTime - leftTime;
  return tracePriority(left.label) - tracePriority(right.label);
}

function tracePriority(label) {
  return {
    隔离: 1,
    治理: 2,
    入记忆: 3,
    解析: 4,
    同步: 5,
    导入: 6
  }[label] || 99;
}

function fullDate(value) {
  if (!value) return "未知时间";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function renderFolderSelect(source, folders, assignments) {
  const selected = assignments[source.source_id] || defaultFolderForSource(source);
  return `
    <select class="inline-folder-select" data-source-folder="${escapeHtml(source.source_id)}">
      ${folders.map((folder) => `
        <option value="${escapeHtml(folder.folder_id)}" ${folder.folder_id === selected ? "selected" : ""}>${escapeHtml(folder.name)}</option>
      `).join("")}
    </select>
  `;
}

function defaultFolderForSource(source) {
  if (source.source_platform === "feishu") return "feishu-space";
  if (source.source_platform === "tencent_docs") return "tencent-docs-space";
  if (source.source_platform === "local") return "local-imports";
  return "uncategorized";
}

function syncStatus(source) {
  if (["external_deleted", "auth_expired", "syncing", "sync_failed", "sync_success"].includes(source.trace_status)) {
    return source.trace_status;
  }
  if (source.source_platform === "feishu") return "sync_event_ready";
  if (source.source_platform === "tencent_docs") return "sync_polling";
  if (source.source_platform === "bilibili" || source.source_type === "url") return "sync_disabled";
  return "local_only";
}

function displayParseStatus(source, isParsing) {
  if (isQuarantined(source)) return "quarantined";
  return isParsing ? "parsing" : source.parse_status;
}

function displayMemoryStatus(source) {
  if (isQuarantined(source)) return "memory_quarantined";
  return source.memory_status;
}

function isQuarantined(source) {
  return source.pollution_status === "quarantined";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
