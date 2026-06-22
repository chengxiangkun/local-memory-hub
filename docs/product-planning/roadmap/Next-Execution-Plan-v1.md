# Local Memory Hub V1 后续执行计划

最后更新：2026-06-23

## 1. 当前产品目标

Local Memory Hub 不是普通笔记应用，也不是一次性知识库，而是一个本地优先的 AI 记忆层。

产品目标：

> 帮助高信息密度用户把文档、网页、截图、笔记、问答记录和外部资料低成本收集到本地源资料库，再转化成可追溯、可治理、可被搜索/问答/图谱/外部 AI 工具复用的长期记忆。

核心差异点：

- 本地优先保存源资料。
- 清楚展示源资料、解析、入记忆、追溯和污染状态。
- 搜索和问答必须带引用。
- 记忆污染可治理、可解释、可恢复。
- 图谱用于探索资料、主题和想法之间的关系。
- 外部 AI 可以通过 API/MCP 安全调用本地记忆。
- 模型供应商可配置，覆盖问答、解析兜底和向量模型。

## 2. 当前实现状态

当前项目已经跑通 V1 核心闭环：

- 资料导入：文本、本地文件、URL、飞书/腾讯文档连接器状态层。
- 源资料库：文件夹、筛选、预览、追溯状态、删除/隔离操作。
- 解析链路：文本/Markdown 解析、大模型兜底路径、抽取文本、记忆片段。
- 记忆索引：本地弱向量、向量索引、图谱节点和关系。
- 搜索问答：检索上下文、模型回答、引用展示。
- QA 记忆：高价值问答入库、完全重复跳过、规范化问题去重、语义重复治理。
- 污染治理：源资料隔离/恢复/删除，隔离资料排除出搜索、向量、图谱和问答，源资料库展示隔离状态。
- 图谱 UI：关系/社区/向量关键词/时间模式、缩放滑条、拖拽投影、初步性能优化。
- 模型系统：Provider 模板、模型配置、模型策略、embedding 测试接口。
- 外部 AI：MCP-like 工具和基础接入说明。
- 数据库：SQLite schema version 4，具备迁移能力。

当前阶段：从“可运行原型”进入“V1 产品硬化”。

## 3. 执行原则

- SourceRecord 是根对象。片段、向量、图谱节点、引用和治理事件都必须能追溯回源资料。
- 任何被隔离的记忆必须在 UI 中明确提示，并从正常检索面排除。
- 优先本地优先和用户可控，避免默认执行破坏性清理。
- 成熟领域优先复用可靠库，例如图谱渲染、OCR、Office 解析、内嵌 SQLite、桌面打包。
- 外部 AI 调用必须有权限边界、审计记录和范围控制。
- UI 状态必须诚实。如果没有索引、被暂停、被隔离、失败或只是 mock，界面要明确说明。

## 4. 优先级计划

## P0：稳定可信记忆闭环

### P0.1 真多轮 Q&A 会话

目标：

把问答页从一次性提问，升级成本地记忆驱动的持久化多轮对话。

当前进度：

- 已完成基础会话持久化：`qa_sessions`、`qa_messages`。
- 已完成当前会话恢复：刷新页面后可读取本地保存的问答消息。
- 已完成问答消息保存：用户问题、助手回答、模型名、引用、长期记忆状态会落库。
- 已完成最近对话上下文注入：模型请求会带最近几轮对话。
- 已完成会话列表、重命名、多会话切换：
  - 存储层新增 `listQaSessions`、`renameQaSession`、`deleteQaSession`。
  - API 新增 `GET /api/qa/sessions`、`POST /api/qa/session/new|rename|delete`。
  - 问答页左侧新增会话侧栏，支持新建、切换、重命名、删除，删除当前会话后自动切换到最近会话。
  - 新增回归测试 `model-config-resolver.test.js`，并修复无 provider_id 时 `/api/ask` 加载不到已配置模型的问题。
- 待完成增强项：每轮引用点击追溯（归入 P0.2 引用追溯体验）。

任务：

- 增加本地 `qa_sessions` 和 `qa_messages` 存储。
- 模型请求带上最近几轮对话上下文。
- 每轮检索上下文独立保存，而不是只有一个全局最新上下文。
- 支持会话列表、继续会话、清空会话。
- 每条助手回答保留自己的引用元数据。
- 短期聊天历史和“高价值回答进入长期记忆”保持分离。

验收标准：

- 刷新页面后当前对话不丢失。
- 追问可以引用上一轮回答。
- 每条助手回答都能展示自己的引用。
- 低价值聊天历史不会自动污染长期记忆。

主要文件：

- `apps/api/src/server.js`
- `apps/api/src/sqlite-store.js`
- `apps/api/src/model-provider.js`
- `apps/api/src/conversation-memory-service.js`
- `apps/web/public/js/qa-view.js`
- `apps/web/public/main.js`

### P0.2 引用追溯体验

目标：

让引用可操作，而不是只作为答案里的装饰文本。

任务：

- 点击回答里的 `[1]` 后高亮或打开对应检索上下文。
- 从引用打开源资料和对应文本片段。
- 引用中显示源资料状态：正常、已隔离、已删除、解析失败。
- 正常回答中不得出现已隔离资料作为证据。
- 如果命中原因存在，展示简短的“为什么引用它”。

验收标准：

- 用户可以从答案进入引用，再进入源资料和片段。
- 已隔离资料不会作为正常回答证据出现。
- 引用 UI 能提示来源是否已删除、隔离或暂停。

主要文件：

- `apps/api/src/retrieval-service.js`
- `apps/api/src/model-provider.js`
- `apps/web/public/js/qa-view.js`
- `apps/web/public/js/sources-view.js`

### P0.3 治理审计和片段级污染

目标：

降低用户清理成本，同时让自动治理可解释。

任务：

- 增加治理结果记录或审计日志。
- 显示 QA 记忆为什么被跳过、保留、去重或隔离。
- 增加语义重复候选视图。
- 在治理页支持恢复/删除重复 QA 记忆。
- 设计并实现片段级隔离，避免一条坏片段导致整篇资料被隔离。

验收标准：

- 用户能看到记忆被隔离的原因。
- 用户能恢复或删除被隔离的 QA 记忆。
- 长文档里单个坏片段可以被排除，而不是整篇资料都失效。

主要文件：

- `apps/api/src/qa-memory-governance-service.js`
- `apps/api/src/sqlite-store.js`
- `apps/web/public/js/governance-view.js`
- `apps/web/public/js/sources-view.js`

## P1：提升记忆质量和召回

### P1.1 外部 embedding 接入

目标：

让严肃检索默认使用质量更好的多语言向量，而不是长期依赖 `local_weak`。

任务：

- 使用真实配置验证 DashScope 或智谱 embedding。
- 增加 Provider 请求/响应兼容性检查。
- embedding Provider 变更后支持重建向量索引。
- 在设置和诊断页展示当前向量 Provider、模型和维度。
- 增加固定中英文混合查询的检索评估脚本。

验收标准：

- 用户可以配置一个外部多语言 embedding Provider。
- 向量重建结果报告 Provider、模型、维度和数量。
- 中英文混合文档上的召回效果明显优于 `local_weak`。

主要文件：

- `apps/api/src/embedding-service.js`
- `apps/api/src/vector-service.js`
- `apps/api/src/model-config-store.js`
- `apps/web/public/js/settings-view.js`

### P1.2 导入覆盖：截图、剪贴板、PDF、Office

目标：

降低真实资料进入系统的成本。

任务：

- 增加剪贴板文本导入。
- 增加截图导入。
- 基于可靠本地工具或库增加 OCR adapter。
- 改善 PDF 解析依赖检查和安装提示。
- 先做 Office/EPUB 解析 Spike，再决定正式实现方式。

验收标准：

- 用户可以一步把剪贴板内容送入记忆。
- 截图导入能抽取文字，或者明确提示缺少 OCR 依赖。
- 解析失败能说明需要安装什么，或者可用什么兜底方案。

主要文件：

- `apps/api/src/import-pipeline.js`
- `apps/api/src/parser-service.js`
- `apps/api/src/system-doctor.js`
- `apps/web/public/js/import-flow.js`

### P1.3 源资料详情页

目标：

让源资料可以被完整检查和修复，而不是只在表格行里展示。

任务：

- 增加源资料详情面板或详情页。
- 展示原始元数据、解析片段、向量状态、图谱节点、追溯时间线和治理状态。
- 增加重新解析、重建该资料向量、隔离、恢复、删除操作。
- 展示源文件路径和打开源文件入口。

验收标准：

- 用户不用读数据库就能看懂一条资料的完整状态。
- 用户能理解资料如何进入记忆。
- 用户可以在一个地方修复资料问题。

主要文件：

- `apps/web/public/js/sources-view.js`
- `apps/web/public/main.js`
- `apps/api/src/server.js`
- `apps/api/src/sqlite-store.js`

## P2：产品硬化

### P2.1 替换 SQLite CLI 为内嵌 SQLite

目标：

移除对系统 `sqlite3` 命令行的依赖，提高可靠性和性能。

任务：

- 选择内嵌 SQLite 库，优先评估 `better-sqlite3`。
- 将 `runSql` 和 `queryJson` 改为内嵌调用。
- 保持迁移行为兼容。
- 验证并发 API 请求下的数据库锁行为。
- 移除 shell SQL 转义风险。

验收标准：

- 应用不依赖系统 `sqlite3` 也能运行。
- 现有数据库可以正常迁移和打开。
- 导入、解析、搜索、向量重建、治理、删除测试全部通过。

主要文件：

- `apps/api/src/sqlite-store.js`
- `apps/api/src/migration-service.js`
- `package.json`

### P2.2 桌面运行时和服务管理

目标：

从本地 Web 原型变成可靠的桌面应用体验。

任务：

- 安装 Rust/Cargo 后继续 Tauri 验证。
- 增加本地服务生命周期管理。
- 增加启动、停止、状态 UI。
- 将 API Key 移入系统钥匙串或加密本地存储。
- 增加诊断页，展示端口、数据目录、解析依赖和 Provider 配置。

验收标准：

- 用户无需手动执行终端命令即可启动应用。
- API/Web 服务状态可见。
- API Key 不再只是明文本地配置。

主要文件：

- `apps/api/src/local-cli.js`
- `apps/api/src/service-supervisor.js`
- `apps/api/src/system-doctor.js`
- `apps/web/public/js/settings-view.js`
- Tauri 脚手架文件

### P2.3 正式图谱渲染器替换

目标：

使用能支撑真实数据规模的图谱渲染方案，替换当前 SVG 原型。

任务：

- 完成 Force Graph、Sigma、D3 的 Spike 对比。
- 根据性能、交互、包体、维护成本选择正式方案。
- 替换当前 SVG 图谱渲染。
- 保留关系、社区、向量关键词、时间模式。
- 增加搜索聚焦、适配视图、缩放控制和截图/导出路径。

验收标准：

- 测试数据达到数千节点/边时仍能流畅交互。
- 当前节点点击、详情、治理流程不丢失。
- 大图不会冻结页面。

主要文件：

- `apps/web/public/js/graph-renderer.js`
- `apps/web/public/main.js`
- `apps/web/public/styles.css`
- `docs/SPIKE-RESULTS-*`

## P3：外部来源和外部 AI

### P3.1 真实外部文档同步

目标：

让飞书、腾讯文档、有道云从连接器壳子进入可用导入能力。

任务：

- 实现真实飞书 OAuth/API 导入。
- 实现腾讯文档导入/同步 Spike。
- 有道云在 API 可行性明确前，保留导出、上传、链接兜底。
- 尽量保留外部文件夹结构。
- 外部删除默认只标记状态，不自动破坏本地资料。

验收标准：

- 至少一个外部文档 Provider 可以导入真实用户文档。
- 同步状态和失败原因可见。
- 外部删除行为安全且可解释。

主要文件：

- `apps/api/src/feishu-client.js`
- `apps/api/src/external-connector-store.js`
- `apps/api/src/import-pipeline.js`
- `apps/web/public/js/connectors-view.js`

### P3.2 正式 MCP 和权限 UI

目标：

让 Local Memory Hub 可以被外部 AI 工具安全调用。

任务：

- 在可行时用正式 MCP SDK 替换 MCP-like 服务。
- 增加权限范围：搜索、上下文读取、图谱读取、导入/写入。
- 增加外部调用审计 UI。
- 增加工具级限流和本地安全边界。
- 增加 Codex、Cursor、Claude Desktop 等客户端示例。

验收标准：

- 外部 AI 可以搜索和读取本地记忆上下文。
- 用户可以看到外部工具访问了什么。
- 写入/导入动作需要明确授权。

主要文件：

- `apps/mcp/src/server.js`
- `apps/api/src/server.js`
- `apps/api/src/external-call-log-store.js`
- `docs/product-planning/api/External-AI-Integration-v1.md`

## 5. 推荐执行顺序

建议后续按这个顺序推进：

1. ✅ P0.1 真多轮 Q&A 会话（已完成：会话列表/新建/切换/重命名/删除）。
2. ✅ P0.2 引用追溯体验（已完成：可点击 [n]、逐轮引用、实时源状态、打开源资料）。
3. ✅ P0.3 治理审计和重复 QA 管理 UI（已完成：审计日志、QA 去重 UI、片段级隔离）。
4. ⛔ P1.1 外部 embedding 接入和向量重建（受阻：需用户提供真实 DashScope/智谱 API Key）。
5. ✅ P1.3 源资料详情页（已完成：详情抽屉、重新解析、片段级隔离、计数与追溯）。
6. ⛔ P2.1 替换为内嵌 SQLite（受阻/高风险：better-sqlite3 为原生依赖，需联网编译，且改动核心存储须谨慎）。
7. ⛔ P2.3 替换正式图谱渲染器（待办：需先 Spike Force Graph/Sigma/D3 方案对比）。

这个顺序优先加固用户主链路：

资料 -> 记忆 -> 检索 -> 回答 -> 追溯 -> 治理 -> 再利用。

### 5.1 当前进度小结（2026-06-23）

已完成主链路硬化的 P0.2、P0.3、P1.3（连同此前的 P0.1 与 provider 修复），
均含回归测试并已推送 GitHub。测试套件 25 个测试组全绿。

仍需用户输入或额外环境才能推进的受阻项：

- **P1.1 外部 embedding**：需要 `DashScope` 或 `智谱` 的真实 API Key（用于验证 Provider 兼容性与向量重建质量）。
- **P2.1 内嵌 SQLite**：`better-sqlite3` 原生依赖需联网与本地编译，且替换核心存储有数据损坏风险，建议单独排期并做迁移演练。
- **P2.2 桌面运行时（Tauri）**：本机缺少 `rustc`，需安装 Rust 工具链。
- **P3.1 真实外部文档同步（飞书/腾讯文档/有道）**：飞书凭证此前仅通过环境变量临时传入、未持久化，需要用户重新提供 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 等，并实现密钥持久化存储。
- **P2.3 正式图谱渲染器**：无外部阻塞，但需先做渲染方案 Spike，属较大独立工作。

## 6. 已知风险

- 当前 SVG 图谱渲染器无法支撑大规模数据，只适合作为 V1 原型表面。
- `local_weak` embedding 可以兜底，但不足以支撑严肃的多语言语义检索。
- 源资料级隔离对长文档过粗，需要片段级治理。
- API Key 存储还没有达到正式桌面产品要求。
- 真实外部文档 API 会带来授权、限流和解析复杂度。
- 内嵌 SQLite 替换必须谨慎，避免数据损坏。

## 7. V1 完成定义

满足以下条件时，V1 可以认为进入产品可用状态：

- 用户可以导入常见本地资料，不需要手动操作数据库或终端。
- 每条源资料都能看清保存、解析、入记忆、追溯、隔离、失败状态。
- 搜索和问答可以从本地记忆生成有引用的有效回答。
- 坏记忆和重复记忆可以自动识别，并允许用户手动治理。
- 图谱对真实个人数据集足够流畅且有探索价值。
- 外部 AI 工具可以通过文档化接口安全查询本地记忆。
- 桌面运行时可以可靠启动、停止、诊断并保留数据。
