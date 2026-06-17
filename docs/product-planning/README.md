# Local Memory Hub 产品文档库

这个目录保存本次对话中沉淀出的 Local Memory Hub 产品、架构和交付文档。

## 目录结构

```text
local-memory-hub-docs/
  product/        产品需求、PRD、产品范围
  architecture/   技术架构、模块设计、状态机、接口抽象
  delivery/       项目交付文档清单、验收说明
  roadmap/        路线图、阶段计划、里程碑
  research/       用户研究、竞品分析、假设验证
  design/         页面设计、交互设计、视觉方向
  api/            API、MCP、外部接入说明
```

## 当前文档

### 产品

- [Local Memory Hub V1 PRD](product/PRD-local-memory-hub-v1.md)
- [V1 核心闭环用户故事](product/User-Stories-v1-core-loop.md)
- [V1 核心闭环测试场景](product/Test-Scenarios-v1-core-loop.md)

### 架构

- [导入与快捷导入系统架构](architecture/ARCH-import-system.md)
- [搜索、问答与图谱检索架构](architecture/ARCH-search-and-qa.md)
- [模型供应商与大模型调用架构](architecture/ARCH-model-provider-system.md)
- [升级与数据保留架构](architecture/ARCH-upgrade-and-data-retention.md)
- [V1 技术 Spike 计划](architecture/Technical-Spike-Plan-v1.md)
- [V1 架构决策记录](architecture/Architecture-Decisions-v1.md)

### 交付

- [项目交付文档清单](delivery/DOCS-delivery-checklist.md)

### 设计

- [V1 信息架构](design/Information-Architecture-v1.md)
- [V1 低保真原型](design/Low-Fidelity-Prototype-v1.md)
- [V1 UI 设计方向](design/UI-Direction-v1.md)
- [V1 组件清单](design/Component-Inventory-v1.md)

### 研究

- [V1 Pre-Mortem 风险预演](research/Pre-Mortem-v1.md)

### 路线图

- [Local Memory Hub V1 Outcome Roadmap](roadmap/Outcome-Roadmap-local-memory-hub-v1.md)
- [V1 核心闭环优先级 Backlog](roadmap/Prioritized-Backlog-v1-core-loop.md)

## 产品当前定义

Local Memory Hub 是一个本地优先的个人源资料库与 AI 记忆系统。

它支持：

- 本地保存源文件。
- 导入飞书、有道云、网页、文件、截图、视频链接等资料。
- 显示解析状态、入记忆状态和可追溯状态。
- 本地解析失败时调用用户配置的大模型兜底。
- 将大模型解析结果沉淀为本地解析规则，减少后续 token 消耗。
- 构建向量索引和 Obsidian 风格图谱。
- 支持搜索、问答、无大模型兜底搜索。
- 支持污染数据隔离、删除和恢复。
- 支持 API/MCP 被 Codex 或其他 AI 工具调用。

## 下一步建议

按照当前 PM skills 流程，`outcome-roadmap`、`user-stories`、`prioritization-frameworks` 和 `test-scenarios` 已完成。

下一步建议继续设计阶段：

推荐顺序：

1. 执行技术 Spike：验证 Tauri、本地服务、存储、图谱、搜索、模型和 MCP。
2. 根据 Spike 结论做脚手架前技术决策。
3. 代码脚手架：在关键 Spike 通过后创建项目结构。
4. 第一轮实现：图谱首页 + 首次引导 + 源资料导入最小闭环。

优先建议先完成：

- 脚手架前技术决策记录

建议输出文件：

```text
architecture/Architecture-Decisions-v1.md
```

## 当前设计约束

- 安装后必须有首次启动引导。
- 引导第二步配置大模型，但允许跳过。
- 引导第三步让用户随便导入一段文本。
- 应用默认首页是 Obsidian 风格图谱首页。
- 用户界面使用中文术语：`chunk` 显示为“文本片段”，`embedding` 显示为“向量索引”。
- 应用升级后必须保留旧数据，用户必须能看到本地数据保存地址。
- 模型 Provider 必须支持 DeepSeek、通义千问和主流国产大模型。
