/**
 * External document connector view.
 *
 * Keeps connector UI independent from the import pipeline. Real platform
 * adapters can later reuse the same API actions.
 */

import { post } from "./api.js";
import { escapeHtml, formatDate } from "./utils.js";
import { promptDialog } from "./modal.js";

const CONNECTOR_TEMPLATES = [
  {
    platform: "feishu",
    display_name: "飞书文档",
    description: "App 凭证拉取 wiki/docx，已支持增量/修改/删除轮询同步",
    sync_mode: "event",
    // 飞书频控:典型 1000 次/分 + 50 次/秒;节点结构类接口 5 QPS + 每日 10000 次;
    // 无终身总次数限制。本应用已做 token 缓存 + ~4 QPS 节流 + 未变跳过以省调用。
    hint: "凭证存于本地 .env.local（FEISHU_APP_ID/SECRET）。频控:约 1000 次/分、50 次/秒，节点接口每日上限 1 万次；无累计总额度。已自动节流并跳过未变文档以减少调用。"
  },
  {
    platform: "tencent_docs",
    display_name: "腾讯文档",
    description: "凭证拉取文件夹文档,已支持增量/修改/删除同步",
    sync_mode: "polling",
    // 腾讯文档:每应用免费 20000 次 API 调用(累计总次数,2025-07-01 起),超出需采买。
    hint: "凭证存于本地 .env.local(TENCENT_CLIENT_ID/ACCESS_TOKEN/OPEN_ID,access_token 约 30 天有效)。同步链接填腾讯文档文件夹地址,会列出其中文档并导出正文入记忆。⚠️ 每个应用免费累计 20000 次 API,已自动节流 + 未变跳过 + 文件夹单层拉取以省额度。"
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
        ${template.hint ? `<small class="connector-hint">${escapeHtml(template.hint)}</small>` : ""}
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
        ? await promptDialog(`连接${template.display_name}`, "", { placeholder: `粘贴${template.display_name}文件夹/文档链接` })
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
