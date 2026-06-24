# 飞书 IM 机器人(长连接)

在飞书里 @机器人 或私聊提问 → 调本地 `/api/ask`(带本地记忆 + 引用)→ 回复到原会话。
用飞书 SDK 的 **WebSocket 长连接**接收事件,**无需公网回调**,契合本地优先。

## 运行
```bash
npm start          # 先起本地 API(4317)+ Web
npm run feishu-bot # 起机器人长连接
```
凭证优先读 `.env.local` 的 `FEISHU_BOT_APP_ID` / `FEISHU_BOT_APP_SECRET`(机器人专属应用),
回退到 `FEISHU_APP_ID` / `FEISHU_APP_SECRET`。**建议机器人用独立飞书应用**,与文档同步那套应用分开
(各自的权限/事件互不干扰)。
可选环境变量:`FEISHU_BOT_PROVIDER`(指定问答模型,默认走服务端策略)、`LMH_API_BASE`。

### 故障排查:连接报 400 / connect failed
SDK 用 axios,会**走 `HTTP_PROXY`/`HTTPS_PROXY` 代理**。若代理不能正确转发 HTTPS
(例如本地开发沙箱的代理),长连接握手会返回 `400 The plain HTTP request was sent to HTTPS port`。
绕开即可:`NO_PROXY="*" env -u HTTP_PROXY -u HTTPS_PROXY npm run feishu-bot`。
普通用户机器没有这个代理,直接跑即可。

## 飞书开放平台配置(一次性,必须)
开发者后台(open.feishu.cn)→ 你的自建应用:
1. **应用能力 → 机器人**:启用。
2. **权限管理**:添加 `im:message`、`im:message:send_as_bot`(以及接收消息所需读权限)。
3. **事件与回调 → 订阅方式**:选「**使用长连接接收事件/回调**」。
4. **事件与回调 → 添加事件**:`im.message.receive_v1`(接收消息)。
5. **创建版本并发布**(自建应用的能力/权限变更需发版生效)。

> 未配置第 3/4 步时,机器人会连上但报 `400 connect failed`,SDK 会打印需要去配置的后台路径。

## 已实现 / 后续
- 已实现:文本提问 → 本地记忆问答(带引用)→ 文本回复;每会话独立上下文;事件去重。
- 后续:交互消息卡片、把 IM 消息导入记忆、群聊更细的 @ 解析、随桌面/CLI 一并起这个长连接。
