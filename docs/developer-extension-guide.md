# Local Memory Hub 开发者扩展说明

## 新增 Importer

1. 在 `apps/api/src/import-pipeline.js` 中实现 `canHandle(request)` 和 `import(request, context)`。
2. 只负责保存源资料，不要在 Importer 内做解析、向量和图谱。
3. 返回统一的 SourceRecord。

## 新增外部平台 Adapter

1. 先复用 `external-connector-store.js` 保存连接器状态。
2. Adapter 只负责平台认证、拉取目录、拉取文档内容和变更检测。
3. 拉取到的内容继续走 Import Pipeline。
4. 外部删除只标记风险，不自动删除本地向量和图谱。

## 新增 Parser

1. Parser 应优先使用本地工具。
2. 失败时返回中文错误，交由模型兜底策略决定是否调用外部模型。
3. 不要在 Parser 中直接写 UI 状态。

## 新增模型 Provider

1. 在 `model-provider.js` 增加模板。
2. API Key 通过 `model-config-store.js` 本地保存。
3. 调用日志不得记录 API Key、完整 prompt 或完整 answer。

## 新增 MCP 工具

1. 工具默认只读。
2. 默认过滤污染和隔离内容。
3. 所有调用写入外部调用日志。
4. 写入型工具必须明确参数和审计记录。

## 反模式

- 不要把平台特殊逻辑写进通用导入函数。
- 不要让 UI 直接读写数据目录。
- 不要默认把用户资料发给外部模型。
- 不要自动删除外部平台已删除的本地记忆。
- 不要为了未来功能提前抽象过深。
