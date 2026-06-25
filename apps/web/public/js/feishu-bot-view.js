/**
 * 飞书 IM 机器人设置视图。
 *
 * 自管:在页面里配置机器人 App ID/Secret(加密存储)、启停长连接、看运行状态,
 * 免手改 .env.local 或开终端。凭证走 /api/connectors/credentials(加密),
 * 启停走 /api/feishu-bot/{start,stop,status}。
 */

import { get, post } from "./api.js";
import { escapeHtml } from "./utils.js";

export async function renderFeishuBot(container) {
  if (!container) return;
  let status = { configured: false, running: false, pid: null };
  let creds = {};
  try {
    const [s, c] = await Promise.all([
      get("/api/feishu-bot/status"),
      get("/api/connectors/credentials")
    ]);
    status = s || status;
    creds = c?.credentials || {};
  } catch (error) {
    container.innerHTML = `<div class="external-empty">读取失败：${escapeHtml(error.message)}</div>`;
    return;
  }

  const idSet = Boolean(creds.FEISHU_BOT_APP_ID);
  const secretSet = Boolean(creds.FEISHU_BOT_APP_SECRET);
  const stateLabel = !status.configured ? "未配置" : status.running ? `运行中（PID ${status.pid}）` : "已停止";
  const stateClass = status.running ? "restored" : status.configured ? "deleted" : "";

  container.innerHTML = `
    <div class="feishu-bot-statusrow">
      <span class="audit-action audit-${stateClass}">${escapeHtml(stateLabel)}</span>
      <span class="feishu-bot-hint">在飞书私聊机器人或群里 @它提问 → 调本地记忆、带引用回答。需用<strong>独立</strong>飞书自建应用:开启机器人 + im:message 权限 + 事件订阅选「长连接」并添加 im.message.receive_v1 + 发布版本。</span>
    </div>
    <form class="feishu-bot-form" data-feishu-bot-form>
      <input name="FEISHU_BOT_APP_ID" type="password" autocomplete="new-password" placeholder="${idSet ? "App ID 已配置,留空则不修改" : "App ID(cli_...)"}" />
      <input name="FEISHU_BOT_APP_SECRET" type="password" autocomplete="new-password" placeholder="${secretSet ? "App Secret 已配置,留空则不修改" : "App Secret"}" />
      <div class="feishu-bot-actions">
        <button type="submit">保存凭证</button>
        ${status.running
          ? `<button class="ghost-button" type="button" data-feishu-bot-stop>停止</button>`
          : `<button class="ghost-button" type="button" data-feishu-bot-start${status.configured ? "" : " disabled"}>启动</button>`}
      </div>
      <div class="feishu-bot-msg" data-feishu-bot-msg></div>
    </form>
  `;

  const msgEl = container.querySelector("[data-feishu-bot-msg]");
  const setMsg = (text) => { if (msgEl) msgEl.textContent = text || ""; };

  container.querySelector("[data-feishu-bot-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const body = {};
    const id = String(formData.get("FEISHU_BOT_APP_ID") || "").trim();
    const secret = String(formData.get("FEISHU_BOT_APP_SECRET") || "").trim();
    if (id) body.FEISHU_BOT_APP_ID = id;
    if (secret) body.FEISHU_BOT_APP_SECRET = secret;
    if (!Object.keys(body).length) { setMsg("没有要保存的改动"); return; }
    setMsg("保存中…");
    try {
      await post("/api/connectors/credentials", body);
      await renderFeishuBot(container);
    } catch (error) { setMsg("保存失败:" + error.message); }
  });

  container.querySelector("[data-feishu-bot-start]")?.addEventListener("click", async () => {
    setMsg("启动中…");
    try {
      const result = await post("/api/feishu-bot/start", {});
      await renderFeishuBot(container);
      if (result?.error) setMsg(result.error);
    } catch (error) { setMsg("启动失败:" + error.message); }
  });

  container.querySelector("[data-feishu-bot-stop]")?.addEventListener("click", async () => {
    setMsg("停止中…");
    try {
      await post("/api/feishu-bot/stop", {});
      await renderFeishuBot(container);
    } catch (error) { setMsg("停止失败:" + error.message); }
  });
}
