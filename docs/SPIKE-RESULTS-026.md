# SPIKE 026 - 外部文档连接器状态层

## 目标

为飞书和腾讯文档接入补一个可运行的连接器状态层，让导入中心不再只是静态 UI，并为后续真实 OAuth/API 适配器留出稳定接口。

## 已完成

- 新增 `apps/api/src/external-connector-store.js`。
- 新增 `GET /api/connectors`。
- 新增 `POST /api/connectors`。
- 新增 `POST /api/connectors/sync`。
- 导入中心飞书/腾讯文档卡片支持连接、更新配置和立即同步登记。
- 新增 `npm run test:connectors`。

## 当前边界

- 当前不会直接访问飞书或腾讯文档公网 API。
- 当前“立即同步”只登记本地同步任务状态，真实拉取逻辑应由后续平台适配器实现。
- 连接器配置只保存必要状态，不保存 OAuth Token；真实凭证接入时应本地加密保存。

## 后续接入点

- `saveExternalConnector` 负责保存平台、账号、同步模式和删除策略。
- `markConnectorSync` 是后续同步调度入口。
- 导入中心 UI 已经使用同一组 API，不需要重写页面交互。
