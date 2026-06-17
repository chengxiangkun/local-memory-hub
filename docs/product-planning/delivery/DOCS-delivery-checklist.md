# 项目交付文档清单

项目完结时，至少需要交付三类文档：

1. 外部接入说明
2. 用户使用说明
3. 架构说明

这些文档应和产品一起维护，不能等项目结束才临时补。

## 1. 外部接入说明

文件建议：

```text
docs/integration-guide.md
```

必须包含：

- 本地服务启动方式
- 本地 API 地址
- MCP Server 启用方式
- API Key 配置方式
- 数据权限说明
- 调用限制
- 错误码
- 示例请求
- 示例响应

需要覆盖：

- `memory.search`
- `memory.ask`
- `memory.get_context`
- `source.import`
- `source.search`
- `source.status`
- `source.mark_polluted`
- `graph.search`
- `graph.get_neighbors`
- `graph.trace_source`

还需要说明：

- Codex 如何接入
- Claude Desktop 如何接入
- Cursor 或其他 AI 工具如何通过 API/MCP 接入
- 外部模型是否需要自己生成答案
- 什么时候使用 `memory.ask`
- 什么时候只使用 `memory.get_context`

## 2. 用户使用说明

文件建议：

```text
docs/user-guide.md
```

必须包含：

- 第一次启动
- 设置数据目录
- 配置大模型 API Key
- 配置本地模型
- 导入文件
- 导入链接
- 导入飞书文档
- 导入有道云笔记
- 快捷键导入
- 截图导入
- 查看解析状态
- 查看是否已入记忆
- 搜索源资料
- 使用问答
- 没有大模型时如何使用搜索兜底
- 使用图谱
- 图谱搜索和节点定位
- 标记污染
- 删除源文件
- 选择是否删除向量和图谱
- 备份和恢复

用户说明要避免技术黑话。用户需要知道“该怎么做”和“做完会发生什么”。

## 3. 架构说明

文件建议：

```text
docs/architecture.md
```

必须包含：

- 总体架构
- 桌面端架构
- 本地服务架构
- 数据目录结构
- 源资料生命周期
- 导入系统架构
- 快捷导入架构
- 解析管线
- 大模型兜底闭环
- 搜索和问答架构
- 向量和图谱联合检索
- 污染治理
- 删除策略
- MCP/API 架构
- 外部连接器架构

这份文档可以引用：

- `ARCH-import-system.md`
- `ARCH-search-and-qa.md`
- `PRD-local-memory-hub-v1.md`

## 4. 开发者扩展说明

文件建议：

```text
docs/developer-extension-guide.md
```

必须包含：

- 如何新增一个 Importer
- 如何新增一个外部平台 Adapter
- 如何新增一个 Parser
- 如何新增一个图谱关系生成器
- 如何新增一个 MCP 工具
- 状态机扩展注意事项
- 反模式说明

## 5. 交付前检查

交付前必须确认：

- 用户可以不配置大模型也能搜索资料。
- 用户配置大模型后可以问答。
- 搜索结果和问答结果都能追溯源文件。
- 图谱页面支持搜索和节点定位。
- 污染内容不会进入普通搜索和问答。
- 删除源文件时可选择是否删除解析文本、向量和图谱。
- Codex 或其他外部工具可以通过 MCP/API 获取上下文。
- 所有核心 API 都有示例。
- 用户文档覆盖第一次启动和常见导入方式。

