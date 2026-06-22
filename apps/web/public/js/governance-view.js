/**
 * Pollution governance view.
 *
 * Shows risky or quarantined sources, the governance audit log, and the QA
 * duplicate scan result. Destructive or recovery actions are delegated to
 * callbacks so the main coordinator owns refresh behavior.
 */

import { escapeHtml, statusText } from "./utils.js";

export function renderGovernance(governList, sources, { onRestore, onDelete, events = [] } = {}) {
  // 取每个源资料最近一次"隔离"事件的原因，用于解释它为什么出现在治理列表里。
  const reasonBySource = new Map();
  for (const event of events) {
    if (event.source_id && event.action === "quarantined" && !reasonBySource.has(event.source_id)) {
      reasonBySource.set(event.source_id, event.reason);
    }
  }

  const risky = sources.filter((source) => source.pollution_status === "quarantined" || source.parse_status === "parse_failed");
  governList.innerHTML =
    risky.map((source) => {
      const reason = reasonBySource.get(source.source_id);
      const reasonBadge = reason ? `<span class="status-badge warn">${escapeHtml(formatGovernanceReason(reason))}</span>` : "";
      return `
      <div class="govern-item">
        <div>
          <strong>${escapeHtml(source.title)}</strong>
          <p>${statusText(source.parse_status)} · ${statusText(source.pollution_status)} ${reasonBadge}</p>
        </div>
        <div class="govern-actions">
          <button class="ghost-button" data-restore="${source.source_id}">恢复</button>
          <button class="danger-button" data-delete="${source.source_id}">删除</button>
        </div>
      </div>
    `;
    }).join("") || `<div class="govern-item"><div><strong>暂无污染数据</strong><p>解析失败或隔离资料会出现在这里。</p></div></div>`;

  governList.querySelectorAll("[data-restore]").forEach((button) => {
    button.addEventListener("click", () => onRestore?.(button.dataset.restore));
  });
  governList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => onDelete?.(button.dataset.delete));
  });
}

export function renderGovernanceEvents(container, events) {
  if (!container) return;
  if (!events || events.length === 0) {
    container.innerHTML = `<span>暂无治理操作记录。</span>`;
    return;
  }
  container.innerHTML = events
    .map((event) => `
      <div class="audit-row">
        <span class="audit-action audit-${escapeHtml(event.action)}">${escapeHtml(formatAction(event.action))}</span>
        <span class="audit-scope">${escapeHtml(formatScope(event.scope))}</span>
        <span class="audit-title">${escapeHtml(event.title || event.source_id || event.segment_id || "")}</span>
        <span class="audit-reason">${escapeHtml(formatGovernanceReason(event.reason))}</span>
        <span class="audit-time">${escapeHtml(formatTime(event.created_at))}</span>
      </div>
    `)
    .join("");
}

export function renderQaGovernanceResult(container, result, { onRestore, onDelete } = {}) {
  if (!container) return;
  if (!result) {
    container.innerHTML = "";
    return;
  }
  const quarantined = result.quarantined || [];
  const summary = `<p class="qa-govern-summary">扫描 ${result.scanned_count ?? 0} 条 · 保留 ${result.kept_count ?? 0} 条 · 隔离 ${result.quarantined_count ?? 0} 条</p>`;
  if (quarantined.length === 0) {
    container.innerHTML = `${summary}<div class="govern-item"><div><strong>没有发现重复 QA 记忆</strong><p>当前问答记忆没有完全重复、重复问题或语义重复。</p></div></div>`;
    return;
  }
  container.innerHTML =
    summary +
    quarantined
      .map((item) => {
        const scoreText = Number.isFinite(Number(item.semantic_score)) ? ` · 语义相似度 ${item.semantic_score}` : "";
        return `
        <div class="govern-item">
          <div>
            <strong>${escapeHtml(item.title || item.source_id)}</strong>
            <p>${escapeHtml(formatGovernanceReason(item.reason))}${escapeHtml(scoreText)}</p>
          </div>
          <div class="govern-actions">
            <button class="ghost-button" data-qa-restore="${escapeHtml(item.source_id)}">恢复</button>
            <button class="danger-button" data-qa-delete="${escapeHtml(item.source_id)}">删除</button>
          </div>
        </div>
      `;
      })
      .join("");
  container.querySelectorAll("[data-qa-restore]").forEach((button) => {
    button.addEventListener("click", () => onRestore?.(button.dataset.qaRestore));
  });
  container.querySelectorAll("[data-qa-delete]").forEach((button) => {
    button.addEventListener("click", () => onDelete?.(button.dataset.qaDelete));
  });
}

const REASON_LABELS = {
  duplicate_qa_content_hash: "完全重复（内容相同）",
  duplicate_qa_question: "重复问题",
  semantic_duplicate_qa_question: "语义重复问题",
  empty_qa_question: "空问题",
  manual_source_quarantine: "手动隔离源资料",
  manual_source_restore: "手动恢复源资料",
  manual_source_delete: "手动删除源资料",
  manual_segment_quarantine: "手动隔离片段",
  manual_segment_restore: "手动恢复片段"
};

function formatGovernanceReason(reason) {
  if (!reason) return "";
  return REASON_LABELS[reason] || reason;
}

function formatAction(action) {
  const labels = { quarantined: "隔离", restored: "恢复", deleted: "删除", kept: "保留", skipped: "跳过" };
  return labels[action] || action || "";
}

function formatScope(scope) {
  const labels = { qa_memory: "QA记忆", segment: "片段", source: "源资料" };
  return labels[scope] || scope || "";
}

function formatTime(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  } catch {
    return String(value);
  }
}
