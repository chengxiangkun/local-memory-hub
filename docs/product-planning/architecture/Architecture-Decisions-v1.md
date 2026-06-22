# 架构决策记录：Local Memory Hub V1

## 1. 目标

本文件记录进入代码脚手架前的关键技术决策。

这些决策不是永远不变，但 V1 开发需要先有明确方向。

## 2. ADR-001：应用和数据分离

### 决策

应用安装目录和用户数据目录必须分离。

### 原因

Local Memory Hub 是本地优先产品。用户升级、重装或替换应用时，原有源资料、记忆、图谱和配置不能丢失。

### 影响

- 首次启动必须选择或创建数据目录。
- 设置页必须展示数据目录。
- 升级时只迁移数据 schema，不移动或破坏源文件。
- 卸载应用不默认删除数据。

## 3. ADR-002：必须支持升级和数据迁移

### 决策

V1 必须内置 schema 版本检查和基础 migration 机制。

### 原因

后续版本会调整数据结构。如果没有迁移机制，升级后用户资料可能不可用。

### V1 最小要求

- 记录应用版本。
- 记录数据 schema 版本。
- 启动时检查迁移。
- 迁移前备份数据库和配置。
- 迁移历史可查看。
- 迁移失败不删除源文件。

## 4. ADR-003：默认首页为图谱首页

### 决策

应用打开后默认进入图谱首页，而不是传统工作台。

### 原因

图谱是产品核心卖点之一，也是第一印象。用户需要立刻感受到资料正在形成可探索的记忆网络。

### 约束

- 图谱必须可搜索。
- 节点必须可点回源资料。
- 关系必须可解释。
- 空状态不能伪造数据。

## 5. ADR-004：首次启动引导必须导入第一段文本

### 决策

首次启动引导包含：

1. 选择数据目录。
2. 配置大模型，可跳过。
3. 导入一段文本。
4. 生成第一条源资料、记忆和图谱节点。

### 原因

用户必须尽快看到产品价值。如果第一步只配置模型或看空图谱，激活弱。

## 6. ADR-005：用户界面使用中文术语

### 决策

用户界面不直接显示 `chunk` 和 `embedding`。

### 用户可见术语

| 技术词 | 用户界面 |
| --- | --- |
| chunk | 文本片段 |
| embedding | 向量索引 |
| vector search | 语义搜索 |
| source record | 源资料记录 |
| provider | 模型供应商 |

### 原因

目标用户虽偏技术，但产品界面需要降低认知负担。

## 7. ADR-006：模型 Provider 必须支持 DeepSeek、通义千问和国产主流模型

### 决策

V1 模型设置必须把 DeepSeek、通义千问和主流国产大模型作为一等支持对象。

### V1 需要提供预设模板

- DeepSeek
- 阿里通义千问 / DashScope
- 字节豆包 / Volcano Ark
- 百度千帆 / 文心
- 智谱 GLM
- Moonshot / Kimi
- MiniMax
- 腾讯混元
- 讯飞星火
- 零一万物

### 同时支持

- OpenAI
- Anthropic
- Google Gemini
- Ollama
- LM Studio
- 自定义 OpenAI-Compatible Endpoint
- 自定义 Anthropic-Compatible Endpoint

### 原因

国内用户会大量使用 DeepSeek、通义、豆包、Kimi、智谱等模型。只支持国际模型会影响可用性和付费意愿。

## 8. ADR-007：ProviderAdapter + ModelRouter

### 决策

业务代码不直接调用具体模型。所有模型调用通过：

```text
业务任务 -> ModelRouter -> ProviderAdapter -> 具体模型
```

### 原因

模型市场变化快。模型供应商、接口格式、上下文长度、价格和能力都会变化。

### 影响

- 解析兜底、问答、图谱推断、摘要、向量索引都通过任务模型策略选择模型。
- 支持自定义 endpoint。
- 支持外部模型和本地模型。

## 9. ADR-008：导入必须走统一 Import Pipeline

### 决策

所有导入入口必须转成 `ImportRequest`，再进入 `Import Pipeline`。

包括：

- 文件
- 链接
- 剪贴板
- 截图
- 飞书
- 有道云
- MCP/API
- 浏览器插件

### 原因

导入入口会越来越多。如果每个入口直接写数据库或记忆库，后期必然失控。

## 10. ADR-009：SourceRecord 是所有资料的根

### 决策

任何资料进入系统后，必须先创建 `SourceRecord`。

### 原因

所有追溯、删除、污染治理、入记忆状态都依赖源资料记录。

### 影响

记忆、文本片段、向量索引、图谱节点、图谱关系都必须能追溯到 SourceRecord。

## 11. ADR-010：V1 默认使用 SQLite 作为本地元数据主库

### 决策

V1 默认使用 SQLite 作为本地元数据主库。

向量索引保持可插拔：

- V1 内置轻量本地向量兜底。
- 后续可接入 `sqlite-vec`。
- Qdrant 作为高级可选项。

PostgreSQL + pgvector 不作为 V1 默认本地方案。

### 原因

- SQLite 无需独立数据库服务，更适合一键启动。
- SQLite 单文件便于备份、迁移和用户理解数据位置。
- 当前 Spike 已跑通源资料、解析文本、图谱、向量索引和污染治理。
- Qdrant 官方本地快速启动依赖 Docker，不适合作为普通用户默认路径。
- PostgreSQL + pgvector 本地打包和启动复杂度高，暂不符合 V1 的低配置目标。

### 实现约束

当前 `sqlite-store.js` 仍通过系统 `sqlite3` CLI 访问数据库，只适合 Spike。

正式实现必须替换为内嵌访问方式：

- Node 路径优先验证 `better-sqlite3`。
- Tauri/Rust 路径后续验证 Rust SQLite binding。

详细结论见：

```text
docs/SPIKE-RESULTS-016.md
```

## 12. ADR-011：图谱渲染库需要 Spike 后确认

### 决策原则

图谱、视频解析、文档连接器、向量检索等成熟领域，进入代码实现前必须先做开源库和现成方案扫描。

只有在现成方案不满足本地优先、可打包、一键启动、数据安全或可扩展边界时，才自己实现关键模块。

### 候选

- Force Graph / 2D Force Graph
- D3 force
- Sigma.js
- Cytoscape.js
- Vis Network
- React Flow，仅适合流程图和编排视图，不作为 Obsidian 风格知识图谱首选

### 当前倾向

如果目标是 Obsidian 风格关系图谱，优先验证：

- Force Graph / 2D Force Graph：更接近 Obsidian 的 Canvas 力导向、缩放、拖拽体验。
- D3 force：适合自定义 SVG/Canvas 渲染，工程可控。
- Sigma.js：适合大规模图谱和 WebGL 渲染。

当前原型阶段使用轻量 SVG 渲染器，原因是 Web 端仍是无构建静态模块，可保持一键启动和低配置复杂度。渲染层必须保持独立，只消费 `nodes/edges`，后续替换为 Force Graph、D3 force 或 Sigma.js 时不能影响导入、检索、污染治理等业务逻辑。

### 决策状态

原型阶段采用自研轻量 SVG；进入大规模图谱和真实拖拽缩放前，必须完成库 Spike。

## 13. ADR-012：污染默认隔离，不默认硬删除

### 决策

用户标记污染后，默认进入隔离状态。

### 原因

污染治理需要安全感。直接硬删除容易误伤。

### 影响

- 隔离内容默认不参与搜索、问答和图谱推荐。
- 用户可以恢复。
- 用户可以进一步删除派生产物。

## 14. ADR-013：升级失败必须保护源文件

### 决策

任何升级或迁移失败，都不能删除或破坏 `raw/` 下的原始源文件。

### 原因

源文件是用户最重要的数据资产。

### 影响

- 原始源文件不做破坏性迁移。
- 派生产物可以重建。
- 迁移失败时优先恢复数据库和配置。

## 15. ADR-014：同时支持桌面安装包和 npm CLI 安装

### 决策

Local Memory Hub V1 应支持两条本地分发路径：

1. Mac/Windows 桌面安装包，面向普通用户。
2. npm CLI 一键安装/启动，面向开发者、AI 工具重度用户和早期验证用户。

### 推荐 npm 体验

```bash
npm install -g local-memory-hub
lmh start
```

或无需全局安装：

```bash
npx local-memory-hub start
```

启动后 CLI 自动完成：

- 检查 Node 版本。
- 创建或读取本地数据目录。
- 启动本地 API 服务。
- 启动 Web UI。
- 启动 MCP-like 服务，可选。
- 打开浏览器到本地页面。
- 在终端展示数据目录、服务端口和关闭方式。

### 数据约束

npm 模式和桌面模式必须共享同一数据目录规则。

用户数据不能保存在 npm 包安装目录下，必须保存在用户可见、可迁移的数据目录中。

数据目录发现优先级：

1. 命令行参数：`--data-dir`
2. 环境变量：`LMH_DATA_DIR`
3. 已保存的用户配置
4. 系统默认目录

默认目录建议：

| 系统 | 默认目录 |
| --- | --- |
| macOS | `~/Library/Application Support/LocalMemoryHub` |
| Windows | `%APPDATA%/LocalMemoryHub` |
| Linux | `~/.local/share/local-memory-hub` |

桌面模式和 npm 模式必须遵循同一套目录发现规则。

### 原因

- npm 模式更适合快速验证、开发者传播和 Codex/Cursor 等 AI 工具用户。
- 桌面安装包更适合非技术用户和长期使用。
- 两种入口共享服务内核，可以降低维护成本。

### 限制

npm 模式不等同于普通用户的一键桌面安装。

它仍依赖用户本机已有 Node/npm 环境，因此应定位为开发者入口，而不是替代 Mac/Windows 安装包。

### 影响

- 后端服务、Web UI、MCP 服务需要能被 CLI 编排启动。
- 端口冲突、数据目录、日志和升级必须在 CLI 中有清楚提示。
- 包发布前必须避免 `postinstall` 中执行重型下载或隐式启动服务。
- 正式实现需要提供 `lmh doctor`、`lmh start`、`lmh stop`、`lmh open`、`lmh data-dir`、`lmh config`、`lmh migrate`、`lmh version` 等命令。
- CLI 需要标准化退出码，便于脚本和外部 AI 工具判断是否成功。
- 多实例必须检测同一数据目录的锁，避免多个进程同时写入数据库和索引。
- npm 升级后首次启动必须执行 schema 检查，发现迁移时要提示并备份，不允许静默破坏旧数据。

## 16. ADR-015：桌面版和 npm CLI 共用本地运行时

### 决策

桌面安装包和 npm CLI 不能分别实现启动、数据目录、迁移和日志逻辑。

V1 必须抽出共享本地运行时：

```text
入口层 -> DataDirResolver -> ServiceSupervisor -> API/Web/迁移
```

详细设计见：

```text
docs/product-planning/architecture/ARCH-local-runtime-and-distribution.md
```

### 原因

同一用户可能先用 npm 试用，再迁移到桌面版。如果两种入口的数据目录和迁移逻辑不同，升级后很容易出现“数据不见了”的感知问题。

### V1 约束

- 用户数据不得写入应用安装目录或 npm 包目录。
- API 和 Web 默认只监听 `127.0.0.1`。
- 默认端口沿用当前实现：API `4317`，Web `3100`。
- `DataDirResolver` 和 `ServiceSupervisor` 是正式实现前必须抽出的最小模块。

## 17. 下一步待决策

必须通过 Spike 后决策：

- 本地数据库最终方案。
- 向量检索方案。
- 图谱渲染库。
- 本地服务技术栈。
- Python/Node/Rust 的职责分工。
- MCP Server 实现方式。
- OCR 和 PDF 解析工具。
