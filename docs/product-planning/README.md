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
- [问答记忆沉淀与记忆整理 Agent](product/Feature-QA-Memory-and-Habit-Agent-v1.md)
- [飞书与腾讯文档连接器同步](product/Feature-External-Document-Sync-v1.md)
- [中英文混合检索与向量偏移校准](product/Feature-Multilingual-Retrieval-v1.md)
- [图谱探索体验](product/Feature-Graph-Experience-v1.md)

### 架构

- [导入与快捷导入系统架构](architecture/ARCH-import-system.md)
- [搜索、问答与图谱检索架构](architecture/ARCH-search-and-qa.md)
- [模型供应商与大模型调用架构](architecture/ARCH-model-provider-system.md)
- [升级与数据保留架构](architecture/ARCH-upgrade-and-data-retention.md)
- [本地运行时与分发架构](architecture/ARCH-local-runtime-and-distribution.md)
- [V1 技术 Spike 计划](architecture/Technical-Spike-Plan-v1.md)
- [V1 架构决策记录](architecture/Architecture-Decisions-v1.md)

### 交付

- [项目交付文档清单](delivery/DOCS-delivery-checklist.md)
- [V1 实现状态清单](delivery/V1-Implementation-Status.md)

### 设计

- [V1 信息架构](design/Information-Architecture-v1.md)
- [V1 低保真原型](design/Low-Fidelity-Prototype-v1.md)
- [V1 UI 设计方向](design/UI-Direction-v1.md)
- [V1 组件清单](design/Component-Inventory-v1.md)

### 研究

- [V1 Pre-Mortem 风险预演](research/Pre-Mortem-v1.md)

### API

- [外部 AI 工具接入说明](api/External-AI-Integration-v1.md)

### 路线图

- [Local Memory Hub V1 Outcome Roadmap](roadmap/Outcome-Roadmap-local-memory-hub-v1.md)
- [V1 核心闭环优先级 Backlog](roadmap/Prioritized-Backlog-v1-core-loop.md)
- [V1 后续执行计划](roadmap/Next-Execution-Plan-v1.md)

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

当前项目已经从产品规划和技术 Spike 进入 V1 产品硬化阶段。

后续开发按照 [V1 后续执行计划](roadmap/Next-Execution-Plan-v1.md) 推进。推荐顺序：

1. 真多轮 Q&A 会话持久化。
2. 引用追溯体验。
3. 治理审计和片段级污染处理。
4. 外部 embedding 接入与向量重建。
5. 源资料详情页。
6. 内嵌 SQLite 替换。
7. 正式图谱渲染器替换。

## 当前设计约束

- 安装后必须有首次启动引导。
- 引导第二步配置大模型，但允许跳过。
- 引导第三步让用户随便导入一段文本。
- 应用默认首页是 Obsidian 风格图谱首页。
- 用户界面使用中文术语：`chunk` 显示为“文本片段”，`embedding` 显示为“向量索引”。
- 应用升级后必须保留旧数据，用户必须能看到本地数据保存地址。
- 模型 Provider 必须支持 DeepSeek、通义千问和主流国产大模型。

## 最新 Spike 结论

- [Spike Results 013：Force Graph 图谱库验证](../SPIKE-RESULTS-013.md)
- [Spike Results 014：npm CLI 一键安装/启动验证](../SPIKE-RESULTS-014.md)
- [Spike Results 015：Tauri 环境复查与数据目录存储补强](../SPIKE-RESULTS-015.md)
- [Spike Results 016：本地数据库与向量存储选型](../SPIKE-RESULTS-016.md)
- [Spike Results 017：文本、PDF、图片解析最小验证](../SPIKE-RESULTS-017.md)
- [Spike Results 018：视频/音频解析最小验证](../SPIKE-RESULTS-018.md)
- [Spike Results 019：模型 Provider 别名调用与调用日志](../SPIKE-RESULTS-019.md)
- [Spike Results 020：模型配置本地保存](../SPIKE-RESULTS-020.md)
- [Spike Results 021：任务模型策略](../SPIKE-RESULTS-021.md)
- [Spike Results 022：错误引用到污染治理入口](../SPIKE-RESULTS-022.md)
- [Spike Results 023：源文件删除范围](../SPIKE-RESULTS-023.md)
- [Spike Results 024：外部 AI 调用日志与接入说明](../SPIKE-RESULTS-024.md)
