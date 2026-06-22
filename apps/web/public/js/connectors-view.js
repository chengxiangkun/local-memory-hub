/**
 * External document connector view.
 *
 * Keeps connector UI independent from the import pipeline. Real platform
 * adapters can later reuse the same API actions.
 */

import { post } from "./api.js";
import { escapeHtml, formatDate } from "./utils.js";

const CONNECTOR_TEMPLATES = [
  {
    platform: "feishu",
    display_name: "飞书文档",
    description: "OAuth/API 拉取，可扩展事件订阅同步",
    sync_mode: "event"
  },
  {
    platform: "tencent_docs",
    display_name: "腾讯文档",
    description: "OAuth/API 拉取，定时轮询检查变更",
    sync_mode: "polling"
  }
];

export function renderConnectorCards(container, connectors, { onChanged } = {}) {
  if (!container) return;
  container.innerHTML = CONNECTOR_TEMPLATES.map((template) => {
    const connector = connectors.find((item) => item.platform === template.platform);
    return `
      <div class="connector-card primary-connector" data-platform="${template.platform}">
        <strong>${escapeHtml(template.display_name)}</strong>
        <span>${escapeHtml(template.description)}</span>
        <small>${formatConnectorStatus(connector, template)}</small>
        <div class="connector-actions">
          <button class="ghost-button" type="button" data-connect-platform="${template.platform}">${connectorButtonText(connector)}</button>
          <button class="ghost-button" type="button" data-sync-platform="${template.platform}" ${connector ? "" : "disabled"}>立即同步</button>
          <label class="connector-autosync">自动同步
            <select data-autosync-platform="${template.platform}" ${connector ? "" : "disabled"}>
              ${autoSyncOptions(connector?.auto_sync_minutes || 0)}
            </select>
          </label>
          ${template.platform === "feishu" ? `<a class="ghost-button help-link" href="/docs/integrations/feishu.md" target="_blank" rel="noreferrer">帮助</a>` : ""}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-connect-platform]").forEach((button) => {
    button.addEventListener("click", async () => {
      const template = CONNECTOR_TEMPLATES.find((item) => item.platform === button.dataset.connectPlatform);
      const rootUrl = ["feishu", "tencent_docs"].includes(template.platform)
        ? window.prompt(`请输入${template.display_name}链接`)
        : "";
      if (["feishu", "tencent_docs"].includes(template.platform) && !rootUrl?.trim()) return;
      await post("/api/connectors", {
        platform: template.platform,
        account_name: template.display_name,
        root_url: rootUrl?.trim() || "",
        auth_status: "connected",
        sync_mode: template.sync_mode,
        preserve_remote_structure: true,
        sync_updates_as_revision: true,
        delete_remote_cleanup: false
      });
      await onChanged?.();
    });
  });

  container.querySelectorAll("[data-sync-platform]").forEach((button) => {
    button.addEventListener("click", async () => {
      await post("/api/connectors/sync", { platform: button.dataset.syncPlatform });
      await onChanged?.();
    });
  });

  container.querySelectorAll("[data-autosync-platform]").forEach((select) => {
    select.addEventListener("change", async () => {
      await post("/api/connectors", {
        platform: select.dataset.autosyncPlatform,
        auto_sync_minutes: Number(select.value)
      });
      await onChanged?.();
    });
  });
}

function autoSyncOptions(current) {
  const options = [
    [0, "关闭"],
    [15, "每 15 分钟"],
    [30, "每 30 分钟"],
    [60, "每小时"]
  ];
  return options
    .map(([value, label]) => `<option value="${value}" ${Number(current) === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

export function renderConnectorTimeline(container, connectors) {
  if (!container) return;
  const connectedCount = connectors.filter((item) => item.auth_status === "connected").length;
  const lastSync = connectors.map((item) => item.last_sync_at).filter(Boolean).sort().at(-1);
  container.innerHTML = `
    <div class="timeline-item ${connectedCount > 0 ? "done" : ""}">
      <span></span>
      <div>
        <strong>连接账号</strong>
        <p>${connectedCount > 0 ? `已连接 ${connectedCount} 个外部文档源。` : "飞书和腾讯文档通过授权连接，凭证只保存在本地。"}</p>
      </div>
    </div>
    <div class="timeline-item ${connectedCount > 0 ? "done" : ""}">
      <span></span>
      <div>
        <strong>保存结构</strong>
        <p>外部文件夹、文档 ID 和标题会映射成本地目录结构。</p>
      </div>
    </div>
    <div class="timeline-item ${lastSync ? "done" : ""}">
      <span></span>
      <div>
        <strong>同步新增和修改</strong>
        <p>${lastSync ? `最近同步：${formatDate(lastSync)}` : "飞书优先事件触发，腾讯文档优先轮询检查。"}</p>
      </div>
    </div>
    <div class="timeline-item">
      <span></span>
      <div>
        <strong>删除需确认</strong>
        <p>外部删除不会自动清掉本地向量和图谱，用户手动选择范围。</p>
      </div>
    </div>
  `;
}

function formatConnectorStatus(connector, template) {
  if (!connector) return "未连接 · 可配置";
  const mode = connector.sync_mode === "event" ? "事件同步" : connector.sync_mode === "polling" ? "轮询同步" : "手动同步";
  const sync = connector.last_sync_at ? ` · ${formatDate(connector.last_sync_at)}` : "";
  const defaultHint = template.platform === "feishu" ? "新增/修改同步" : "手动/定时同步";
  return `${mode} · ${connector.auth_status === "connected" ? "已连接" : "未授权"}${sync || ` · ${defaultHint}`}`;
}

function connectorButtonText(connector) {
  if (!connector) return "连接";
  if (connector.auth_status !== "connected") return "重新授权";
  return "更新配置";
}
