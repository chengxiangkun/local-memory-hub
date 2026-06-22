# 技术 Spike 计划：Local Memory Hub V1

## 1. 目标

本文件定义进入正式代码开发前必须验证的技术 Spike。

Spike 的目标不是做完整功能，而是回答：

- 这个技术路径能不能跑通？
- 本地一键启动是否可行？
- 核心链路有没有明显阻塞？
- 哪些方案需要提前换路？

## 2. Spike 原则

- 每个 Spike 控制在小范围内。
- 每个 Spike 必须有明确成功标准。
- Spike 代码可以丢弃，不要求产品级质量。
- Spike 结论必须沉淀到架构文档。
- 不做 UI 精修，只验证关键能力。

## 3. Spike 总览

| 编号 | Spike | 目的 | 优先级 |
| --- | --- | --- | --- |
| S1 | Tauri 一键启动本地服务 | 验证桌面壳和本地服务联动 | P0 |
| S2 | 本地数据目录与文件存储 | 验证源资料本地保存 | P0 |
| S3 | 本地数据库选择 | 验证 SQLite/Postgres/pgvector 路径 | P0 |
| S4 | SourceRecord 最小模型 | 验证源资料状态和追溯 | P0 |
| S5 | Import Pipeline 最小闭环 | 验证导入架构不变屎山 | P0 |
| S6 | 文本/PDF/图片解析 | 验证本地解析基础能力 | P0 |
| S7 | 向量索引和无模型搜索 | 验证未配置模型时可搜索 | P0 |
| S8 | 图谱首页最小渲染 | 验证 Obsidian 风格图谱可行 | P0 |
| S9 | 大模型 Provider 接入 | 验证主流/兼容模型调用 | P0 |
| S10 | 大模型解析兜底 | 验证解析失败后的模型兜底 | P0 |
| S11 | MCP Server Demo | 验证 Codex/外部工具调用本地记忆 | P0 |
| S12 | 污染隔离与删除派生产物 | 验证治理状态和索引排除 | P0 |
| S13 | npm CLI 一键安装/启动 | 验证开发者分发路径和本地服务编排 | P0 |

## 4. S1：Tauri 一键启动本地服务

### 问题

Tauri 能否在 Mac/Windows 上启动本地后端服务，并在退出时正确关闭？

### 验证内容

- Tauri 打开窗口。
- 自动拉起本地 API 服务。
- 前端访问本地 API。
- 应用退出时关闭本地服务。
- 服务崩溃后能提示并重启。

### 成功标准

- 双击 App 后无需命令行即可打开界面。
- 前端能请求本地 `/health`。
- 退出 App 后本地服务不残留。

### 风险

- 多平台进程管理差异。
- 端口冲突。
- 后端服务打包复杂。

### 当前状态

当前机器缺少 Rust/Cargo，Tauri 编译运行暂不能验证。

已先抽出可复用的 `DataDirResolver` 和 `ServiceSupervisor`。安装 Rust 后，S1 只验证桌面壳复用这两个模块，不重新实现启动和数据目录逻辑。

## 5. S2：本地数据目录与文件存储

### 问题

用户选择数据目录后，系统能否稳定保存源文件、元数据和派生产物？

### 验证内容

- 首次启动选择数据目录。
- 创建标准目录结构。
- 保存上传文件。
- 保存截图或文本。
- 读取文件。
- 目录不可写时提示。

### 推荐目录结构

```text
LocalMemoryHub/
  raw/
  extracted/
  index/
  graph/
  logs/
  config/
  trash/
```

### 成功标准

- 文件可保存、读取、移动到回收站。
- 目录权限错误可解释。

## 6. S3：本地数据库选择

### 问题

V1 本地存储应该使用 SQLite、PostgreSQL + pgvector，还是两者分层？

### 待验证方案

#### 方案 A：SQLite + 本地向量库

优点：

- 一键启动简单。
- 打包轻。

缺点：

- 向量检索和复杂查询需要额外方案。

#### 方案 B：PostgreSQL + pgvector

优点：

- 业务数据和向量数据统一。
- 后期扩展更好。

缺点：

- 本地打包和启动更复杂。

#### 方案 C：SQLite + Qdrant 本地

优点：

- 业务数据轻，向量检索专业。

缺点：

- 多一个本地服务。

### 成功标准

- 选出 V1 默认方案。
- 能存 `SourceRecord`、文本片段、向量索引状态。
- 能完成一次语义搜索。

### 初步建议

Spike 阶段同时验证：

- SQLite 作为基础元数据存储。
- Qdrant 或轻量向量方案作为向量检索。

如果 Postgres 打包复杂，V1 桌面版不应强依赖本地 Postgres。

### 当前状态

已决策：

- V1 默认使用 SQLite 作为本地元数据主库。
- PostgreSQL + pgvector 不作为 V1 默认本地方案。
- Qdrant 作为后续高级可选项，不作为普通用户默认依赖。
- 当前系统 `sqlite3` CLI 实现只保留为 Spike，正式实现需替换为内嵌 SQLite 访问。

## 7. S4：SourceRecord 最小模型

### 问题

源资料状态是否能完整表达导入、解析、入记忆、追溯和污染？

### 验证字段

- source_id
- title
- source_type
- source_platform
- entrypoint
- original_url
- local_file_path
- content_hash
- import_status
- parse_status
- memory_status
- trace_status
- pollution_status
- created_at
- updated_at

### 成功标准

- 文件导入后生成 SourceRecord。
- 状态可以正确流转。
- UI 可以展示状态。

## 8. S5：Import Pipeline 最小闭环

### 问题

统一导入管线是否能支撑文件、链接、剪贴板和截图？

### 验证内容

- ImportRequest。
- ImporterRegistry。
- FileImporter。
- UrlImporter。
- ClipboardImporter。
- ScreenshotImporter。
- 创建 SourceRecord。
- 创建 ParseJob。

### 成功标准

- 四种入口都进入同一条导入管线。
- 没有入口直接写记忆库。
- 失败原因可返回。

## 9. S6：文本/PDF/图片解析

### 问题

本地解析是否能覆盖 V1 基础来源？

### 验证内容

- 纯文本解析。
- Markdown 解析。
- PDF 文本抽取。
- 图片 OCR。
- 解析失败原因。

### 当前状态

已完成最小验证：

- 文本和 Markdown 可直接本地解析。
- PDF 可通过 `pdftotext` 路径解析；当前机器缺少该工具，因此已验证中文失败提示。
- 图片 OCR 可通过 `tesseract` 路径解析；当前机器缺少该工具，因此已验证失败后大模型兜底。
- 解析失败不会影响源文件保存。

正式 V1 需要决定桌面包是否随应用打包 Poppler/Tesseract，npm CLI 则通过 `doctor` 提示缺失工具。

### 视频/音频补充状态

已完成最小验证：

- 本机存在 `ffmpeg` 和 `ffprobe`。
- 视频可读取媒体信息。
- 视频可抽取音频到 `extracted/audio/`。
- 当前机器缺少本地转写器，系统会返回中文错误。
- 开启大模型兜底后，媒体源资料可继续进入记忆系统。

V1 不强绑定具体转写引擎，后续通过 `TranscriptionAdapter` 接入 Whisper.cpp、faster-whisper 或外部模型。

### 成功标准

- 至少 20 个样本中，基础解析成功率 >= 80%。
- 解析失败可解释。
- 解析结果可保存为抽取文本。

### 可选工具

- PDF：PyMuPDF / pdfplumber
- OCR：PaddleOCR / Tesseract
- 文本：本地解析脚本

## 10. S7：向量索引和无模型搜索

### 问题

用户不配置大模型时，是否仍能搜索源资料和记忆？

### 验证内容

- 全文搜索。
- 简单语义搜索。
- 结果带来源。
- 污染内容过滤。

### 成功标准

- 未配置外部模型时，搜索仍可用。
- 搜索结果能点回源资料。
- 污染内容默认排除。

### 备注

如果语义搜索需要 embedding 模型，可验证本地 embedding 模型或可选外部 embedding。

## 11. S8：图谱首页最小渲染

### 问题

Obsidian 风格图谱作为默认首页是否能稳定渲染并交互？

### 验证内容

- 50 个节点。
- 100 条边。
- 缩放和平移。
- 节点拖拽。
- hover/选中高亮。
- 搜索节点。
- 点击节点打开详情。
- 污染节点隐藏。
- 支持关闭非必要动画。

### 成功标准

- 图谱加载时间可接受。
- 搜索节点后可以聚焦。
- 基础拖拽、缩放、平移不卡顿。
- hover 和选中高亮不会遮挡文字。
- 节点能点回源资料。
- 空状态不伪造数据。
- `prefers-reduced-motion` 开启时，非必要动效停止。

### 候选技术

- Force Graph / 2D Force Graph
- D3 force
- Sigma.js
- Cytoscape.js
- React Flow

### 选择建议

如果目标是 Obsidian 风格大图谱，优先 Spike：

- Force Graph / 2D Force Graph
- D3 force
- Sigma.js

Cytoscape.js 可作为图分析和交互备选。如果更偏流程图和可编辑节点，才考虑 React Flow。

节点跟随鼠标移动、靠近避让、局部力场扰动不作为 S8 成功标准，只作为后置增强实验项。

## 12. S9：大模型 Provider 接入

### 问题

模型供应商抽象是否能覆盖主流模型和自定义 endpoint？

### 验证内容

- OpenAI-Compatible。
- Anthropic-Compatible。
- Ollama。
- 测试连接。
- 任务模型策略。

### 成功标准

- 至少一个外部模型可成功问答。
- 至少一个自定义 OpenAI-Compatible endpoint 可用。
- 至少一个本地模型 endpoint 可用。
- API Key 不明文写入普通配置。

## 13. S10：大模型解析兜底

### 问题

本地解析失败后，大模型是否能返回可用结构化结果？

### 验证内容

- 构造解析失败样本。
- 调用模型解析。
- 保存兜底结果。
- 保存本地失败输出和大模型修正输出。
- 生成解析改进样例。

### 成功标准

- 至少 3 类失败样本可以通过模型生成可用结果。
- 调用日志完整。
- 兜底结果可以入记忆。

## 14. S11：MCP Server Demo

### 问题

Codex 或外部 AI 工具能否通过 MCP 调用本地记忆？

### 验证内容

- 启动本地 MCP Server。
- 暴露 `memory.search`。
- 暴露 `memory.get_context`。
- 返回结构化上下文。
- 记录调用日志。
- 过滤污染内容。

### 成功标准

- 外部工具能成功调用。
- 返回结果可追溯源资料。
- 关闭 MCP 后不可调用。

## 15. S12：污染隔离与删除派生产物

### 问题

污染内容能否从搜索、问答和图谱中排除？删除源文件时，派生产物能否按用户选择处理？

### 验证内容

- 标记源资料污染。
- 标记文本片段污染。
- 从搜索排除。
- 从图谱隐藏。
- 删除源文件但保留记忆。
- 删除源文件、向量索引和图谱。

### 成功标准

- 污染内容默认不出现在普通搜索中。
- 污染节点默认不出现在图谱中。
- 删除操作后状态一致。
- 删除记录可查询。

## 16. S13：npm CLI 一键安装/启动

### 问题

Local Memory Hub 能否通过 npm 面向开发者实现一键安装、启动和诊断？

### 验证内容

- `npm install -g local-memory-hub` 后提供 `lmh` 命令。
- `npx local-memory-hub start` 无需全局安装也能启动。
- `lmh start` 自动启动本地 API、Web UI 和可选 MCP-like 服务。
- 自动选择或创建本地数据目录。
- 端口冲突时自动换端口或给出清晰提示。
- 启动后自动打开浏览器。
- 终端展示数据目录、服务端口、关闭方式。
- `lmh doctor` 检查 Node 版本、端口占用、数据目录权限、模型配置状态。
- `lmh stop` 可以停止由 CLI 启动的本地服务。
- `lmh migrate` 可以在 npm 升级后触发 schema 检查和迁移。
- 命令返回标准化退出码。
- macOS、Windows、Linux 路径和进程行为差异。

### 成功标准

- 新机器已有 Node/npm 时，用户只需一条 npm/npx 命令即可打开本地页面。
- npm 包安装目录不保存用户源资料和数据库。
- 服务崩溃时终端能看到原因。
- 重启后仍使用同一数据目录。
- 不在 `postinstall` 中执行重型下载、隐式启动服务或写入用户数据。
- 模拟 npm 升级后，schema 检查、备份和迁移提示正常。
- Windows 路径、端口占用和进程退出行为至少有一次验证记录。

### 风险

- Windows shell、路径和进程管理差异。
- 全局 npm 权限问题。
- npx 临时包启动后的缓存和升级行为。
- 多服务生命周期管理复杂。
- 用户误以为 npm 模式等同于普通桌面安装。

### 建议

npm 模式优先作为开发者入口和早期验证入口。普通用户仍优先使用 Mac/Windows 桌面安装包。

## 17. 推荐执行顺序

```text
S1 Tauri 一键启动本地服务
S13 npm CLI 一键安装/启动
S2 本地数据目录与文件存储
S3 本地数据库选择
S4 SourceRecord 最小模型
S5 Import Pipeline 最小闭环
S6 文本/PDF/图片解析
S7 向量索引和无模型搜索
S8 图谱首页最小渲染
S9 大模型 Provider 接入
S10 大模型解析兜底
S12 污染隔离与删除派生产物
S11 MCP Server Demo
```

MCP 可以和搜索完成后并行推进，但不要早于 SourceRecord、搜索和权限过滤。

## 18. Spike 完成后的决策

Spike 完成后必须明确：

- 桌面技术栈是否确认 Tauri。
- npm CLI 是否作为 V1 开发者分发路径。
- 本地数据库方案。
- 向量检索方案。
- 图谱渲染库。
- 模型 Provider 抽象是否成立。
- MCP 接入是否放入第一轮实现。
- 哪些解析能力进入 V1。
- 哪些能力只做兜底或后置。

## 19. 不进入正式开发的条件

如果以下问题没有答案，不建议进入正式开发：

- 本地服务不能稳定随 App 启停。
- 本地数据目录无法可靠保存和迁移。
- 源资料状态机没有跑通。
- 导入入口没有统一管线。
- 无模型搜索不可用。
- 图谱首页无法搜索和定位节点。
- 污染内容无法从检索中排除。
