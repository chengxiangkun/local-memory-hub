/**
 * Pure UI utilities.
 *
 * Functions in this file should not read global state or query the DOM. Keeping
 * them pure makes future page-level modules easier to test and reuse.
 */

export function svg(tag, attrs = {}, textContent) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (textContent) element.textContent = textContent;
  return element;
}

export function badge(value) {
  const kind = value === "parse_failed" || value === "quarantined" || value === "quality_rejected" || value === "memory_rejected" || value === "memory_quarantined" || value === "trace_quarantined"
    ? "bad"
    : value === "parse_pending" || value === "memory_pending" || value === "parsing" || value === "pending" || value === "llm_fallback_pending" || value === "sync_polling" || value === "syncing" || value === "sync_failed" || value === "auth_expired" || value === "export_required" || value === "external_deleted"
      ? "warn"
      : "ok";
  return `<span class="status-badge ${kind}">${statusText(value)}</span>`;
}

export function statusText(value = "") {
  return {
    imported: "已导入",
    saved: "已保存",
    deleted: "已删除",
    pending: "等待中",
    parse_pending: "等待解析",
    parsing: "解析中",
    parse_success: "解析成功",
    parse_failed: "解析失败",
    quality_rejected: "质检未通过",
    llm_fallback_pending: "模型兜底中",
    llm_fallback_success: "模型兜底成功",
    memory_pending: "未入记忆",
    memory_indexed: "已入记忆",
    memory_rejected: "未进入记忆",
    memory_quarantined: "记忆暂停",
    local_only: "本地资料",
    sync_disabled: "未开启同步",
    sync_connected: "已连接",
    sync_polling: "定时检查",
    sync_event_ready: "事件同步",
    syncing: "同步中",
    sync_success: "同步成功",
    sync_failed: "同步失败",
    auth_expired: "授权失效",
    export_required: "需要导出",
    external_deleted: "外部已删除",
    traceable: "可追溯",
    trace_quarantined: "隔离追溯",
    source_deleted: "源文件已删除",
    clean: "正常",
    quarantined: "已隔离",
    unknown: "未知"
  }[value] || value || "未知";
}

export function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
