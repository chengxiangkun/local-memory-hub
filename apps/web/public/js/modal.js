/**
 * 应用内主题化弹窗,替代原生 window.confirm / window.prompt(样式丑、不可定制)。
 * confirmDialog(message, opts) -> Promise<boolean>
 * promptDialog(message, defaultValue, opts) -> Promise<string|null>
 */

import { escapeHtml } from "./utils.js";

function openModal(innerHtml) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${innerHtml}</div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function confirmDialog(message, opts = {}) {
  const { title = "", confirmText = "确定", cancelText = "取消", danger = false } = opts;
  return new Promise((resolve) => {
    const overlay = openModal(`
      ${title ? `<h3 class="modal-title">${escapeHtml(title)}</h3>` : ""}
      <p class="modal-message">${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button class="ghost-button" data-act="cancel">${escapeHtml(cancelText)}</button>
        <button class="${danger ? "danger-button" : "primary-button"}" data-act="ok">${escapeHtml(confirmText)}</button>
      </div>
    `);
    const done = (value) => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(value); };
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    overlay.querySelector('[data-act="ok"]').addEventListener("click", () => done(true));
    overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => done(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) done(false); });
    document.addEventListener("keydown", onKey);
  });
}

// 单按钮信息提示弹窗(纯告知,无取消)。
export function alertDialog(message, opts = {}) {
  const { title = "", confirmText = "知道了" } = opts;
  return new Promise((resolve) => {
    const overlay = openModal(`
      ${title ? `<h3 class="modal-title">${escapeHtml(title)}</h3>` : ""}
      <p class="modal-message">${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button class="primary-button" data-act="ok">${escapeHtml(confirmText)}</button>
      </div>
    `);
    const done = () => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(true); };
    const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") done(); };
    overlay.querySelector('[data-act="ok"]').addEventListener("click", done);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) done(); });
    document.addEventListener("keydown", onKey);
  });
}

// 多字段表单弹窗。fields: [{name, label, value, placeholder, type}]。返回 {name: value} 或 null。
export function formDialog(title, fields, opts = {}) {
  const { message = "", confirmText = "保存", cancelText = "取消" } = opts;
  return new Promise((resolve) => {
    const rows = fields.map((field) => `
      <label class="modal-field">
        <span>${escapeHtml(field.label || field.name)}</span>
        <input class="modal-input" data-field="${escapeHtml(field.name)}" type="${escapeHtml(field.type || "text")}"
          value="${escapeHtml(field.value || "")}" placeholder="${escapeHtml(field.placeholder || "")}" autocomplete="off" />
      </label>
    `).join("");
    const overlay = openModal(`
      ${title ? `<h3 class="modal-title">${escapeHtml(title)}</h3>` : ""}
      ${message ? `<p class="modal-message">${escapeHtml(message)}</p>` : ""}
      <div class="modal-form">${rows}</div>
      <div class="modal-actions">
        <button class="ghost-button" data-act="cancel">${escapeHtml(cancelText)}</button>
        <button class="primary-button" data-act="ok">${escapeHtml(confirmText)}</button>
      </div>
    `);
    const first = overlay.querySelector(".modal-input");
    setTimeout(() => first?.focus(), 30);
    const done = (value) => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(value); };
    const collect = () => {
      const out = {};
      overlay.querySelectorAll("[data-field]").forEach((input) => { out[input.dataset.field] = input.value.trim(); });
      return out;
    };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    overlay.querySelector('[data-act="ok"]').addEventListener("click", () => done(collect()));
    overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => done(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) done(null); });
    document.addEventListener("keydown", onKey);
  });
}

export function promptDialog(message, defaultValue = "", opts = {}) {
  const { title = "", confirmText = "确定", cancelText = "取消", placeholder = "" } = opts;
  return new Promise((resolve) => {
    const overlay = openModal(`
      ${title ? `<h3 class="modal-title">${escapeHtml(title)}</h3>` : ""}
      <p class="modal-message">${escapeHtml(message)}</p>
      <input class="modal-input" type="text" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}" />
      <div class="modal-actions">
        <button class="ghost-button" data-act="cancel">${escapeHtml(cancelText)}</button>
        <button class="primary-button" data-act="ok">${escapeHtml(confirmText)}</button>
      </div>
    `);
    const input = overlay.querySelector(".modal-input");
    setTimeout(() => { input.focus(); input.select(); }, 30);
    const done = (value) => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(value); };
    const ok = () => done(input.value.trim() || null);
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    overlay.querySelector('[data-act="ok"]').addEventListener("click", ok);
    overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => done(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) done(null); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } });
    document.addEventListener("keydown", onKey);
  });
}
