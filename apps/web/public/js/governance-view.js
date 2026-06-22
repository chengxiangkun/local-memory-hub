/**
 * Pollution governance view.
 *
 * Shows risky or quarantined sources. Destructive or recovery actions are
 * delegated to callbacks so the main coordinator owns refresh behavior.
 */

import { escapeHtml, statusText } from "./utils.js";

export function renderGovernance(governList, sources, { onRestore, onDelete } = {}) {
  const risky = sources.filter((source) => source.pollution_status === "quarantined" || source.parse_status === "parse_failed");
  governList.innerHTML =
    risky.map((source) => `
      <div class="govern-item">
        <div>
          <strong>${escapeHtml(source.title)}</strong>
          <p>${statusText(source.parse_status)} · ${statusText(source.pollution_status)}</p>
        </div>
        <div class="govern-actions">
          <button class="ghost-button" data-restore="${source.source_id}">恢复</button>
          <button class="danger-button" data-delete="${source.source_id}">删除</button>
        </div>
      </div>
    `).join("") || `<div class="govern-item"><div><strong>暂无污染数据</strong><p>解析失败或隔离资料会出现在这里。</p></div></div>`;

  governList.querySelectorAll("[data-restore]").forEach((button) => {
    button.addEventListener("click", () => onRestore?.(button.dataset.restore));
  });
  governList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => onDelete?.(button.dataset.delete));
  });
}
