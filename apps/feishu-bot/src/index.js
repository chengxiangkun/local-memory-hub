/**
 * 飞书 IM 机器人(长连接)。
 *
 * 用飞书 SDK 的 WebSocket 长连接订阅 im.message.receive_v1(无需公网回调,契合本地优先):
 * 收到用户消息 → 调本地 /api/ask(带本地记忆问答)→ 回复到原会话。
 *
 * 运行:`npm run feishu-bot`(需先 npm start 起本地 API)。
 * 凭证:.env.local 的 FEISHU_APP_ID / FEISHU_APP_SECRET。
 * 前置(飞书开放平台):应用启用「机器人」、加 im:message 权限、
 *   事件订阅选「长连接」并添加 im.message.receive_v1。
 */
import lark from "@larksuiteoapi/node-sdk";
import { loadLocalEnv } from "../../api/src/local-env.js";

await loadLocalEnv();

// IM 机器人用独立应用(避免和 openclaw 文档同步共用一个 app 抢长连接);
// 回退到 FEISHU_APP_ID/SECRET 兼容单应用场景。
const appId = process.env.FEISHU_BOT_APP_ID || process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_BOT_APP_SECRET || process.env.FEISHU_APP_SECRET;
const apiBase = process.env.LMH_API_BASE || `http://127.0.0.1:${process.env.LMH_PORT || 4317}`;
const provider = process.env.FEISHU_BOT_PROVIDER || "";

if (!appId || !appSecret) {
  console.error("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET(写入 .env.local)");
  process.exit(1);
}

const client = new lark.Client({ appId, appSecret });
const wsClient = new lark.WSClient({ appId, appSecret });

const seen = new Set(); // 去重:飞书事件可能重投

async function askLocalMemory(question, chatId) {
  const res = await fetch(`${apiBase}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      question,
      session_id: `feishu:${chatId}`, // 每个会话独立上下文
      provider_id: provider || undefined,
      fallback_recent_memory: true,
      persist_memory: false
    })
  });
  if (!res.ok) throw new Error(`本地 API ${res.status}`);
  const data = await res.json();
  const answer = data.answer || data?.data?.answer || "";
  const cites = (data.citations || data?.data?.citations || []).map((c, i) => c.title || `引用${i + 1}`);
  return cites.length ? `${answer}\n\n— 引用:${cites.slice(0, 5).join(" / ")}` : (answer || "(没有检索到相关本地记忆)");
}

async function replyText(chatId, text) {
  await client.im.message.create({
    params: { receive_id_type: "chat_id" },
    data: { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }) }
  });
}

const eventDispatcher = new lark.EventDispatcher({}).register({
  "im.message.receive_v1": async (data) => {
    const msg = data?.message;
    if (!msg || seen.has(msg.message_id)) return;
    seen.add(msg.message_id);
    if (msg.message_type !== "text") {
      await replyText(msg.chat_id, "目前只支持文本提问哦。").catch(() => {});
      return;
    }
    let text = "";
    try { text = JSON.parse(msg.content || "{}").text || ""; } catch { text = ""; }
    text = text.replace(/@_user_\d+/g, "").trim(); // 去掉 @机器人
    if (!text) return;
    console.log(`[收到] chat=${msg.chat_id} 文本=${JSON.stringify(text)}`);
    try {
      const answer = await askLocalMemory(text, msg.chat_id);
      await replyText(msg.chat_id, answer);
      console.log(`[已回复] ${JSON.stringify(answer.slice(0, 80))}`);
    } catch (error) {
      console.log(`[回复出错] ${error.message}`);
      await replyText(msg.chat_id, `出错了:${error.message}`).catch(() => {});
    }
  }
});

wsClient.start({ eventDispatcher });
console.log(`飞书 IM 机器人已启动(长连接)→ 本地 API ${apiBase}。等待消息…`);
