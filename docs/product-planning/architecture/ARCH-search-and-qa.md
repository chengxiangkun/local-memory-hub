# 搜索、问答与图谱检索架构设计

## 1. 目标

搜索系统负责让用户在没有大模型、使用本地模型、使用外部大模型三种情况下，都能找到源资料、记忆内容和图谱关系。

它必须支持：

- 源文件搜索。
- 全文搜索。
- 向量语义搜索。
- 图谱节点/关系搜索。
- 问答 + 大模型生成答案。
- 没有大模型时的问答兜底。
- 在图谱页面内搜索并定位节点。
- 搜索结果可追溯到源资料。
- 污染数据、隔离数据默认不参与结果。

## 2. 搜索不是一个功能，而是一组能力

V1 至少需要四类搜索：

```text
源资料搜索：找原始文件、链接、外部文档。
全文搜索：找解析后的文字。
语义搜索：根据意思找相关 chunk。
图谱搜索：找节点、关系、主题、人物、项目、想法。
```

问答建立在搜索之上：

```text
用户问题
  ↓
检索上下文
  ↓
有大模型：生成答案 + 引用
无大模型：返回结构化搜索结果 + 摘要片段
```

## 3. 页面搜索入口

### 3.1 全局搜索

应用顶部应有一个全局搜索框。

支持：

- 搜源文件
- 搜记忆
- 搜图谱节点
- 搜问答历史
- 直接提问

用户输入后可以选择模式：

```text
全部
源资料
记忆
图谱
问答
```

### 3.2 源资料库搜索

源资料库搜索偏精确。

筛选条件：

- 文件夹
- 日期
- 类型
- 来源平台
- 解析状态
- 入记忆状态
- 污染状态
- 是否可追溯

搜索字段：

- 文件名
- 标题
- 源 URL
- 本地路径
- 外部文档 ID
- 标签
- 解析文本摘要

### 3.3 记忆库搜索

记忆库搜索偏语义。

支持：

- 关键词搜索
- 语义搜索
- 标签搜索
- 来源过滤
- 是否污染过滤
- 最近被 AI 使用过滤

### 3.4 图谱页搜索

图谱页面必须有搜索，不然节点一多就会变成宇宙烟花。

图谱搜索支持：

- 搜节点名称
- 搜节点类型
- 搜主题
- 搜人物
- 搜项目
- 搜源文件
- 搜关系类型
- 搜污染节点

交互建议：

```text
搜索关键词
  ↓
匹配节点高亮
  ↓
图谱自动聚焦
  ↓
右侧打开节点详情
  ↓
显示相邻节点和关系原因
```

图谱页还可以提供一个“探索搜索”：

```text
从这个节点出发，找相似内容
从这个主题出发，找相关项目
从这个人物出发，找相关文件
从这个污染节点出发，查看影响范围
```

这比普通搜索更适合图谱。

## 4. 问答模式

### 4.1 有大模型时

流程：

```text
用户提问
  ↓
Query Planner 判断意图
  ↓
多路检索：全文 + 向量 + 图谱
  ↓
过滤污染/隔离内容
  ↓
重排序
  ↓
组织上下文
  ↓
调用大模型
  ↓
返回答案、引用源资料、使用的 chunk、图谱扩展节点
```

### 4.2 没有大模型时

没有配置大模型 API Key、本地模型不可用、网络不可用、用户选择省 token 模式时，问答仍然要可用。

兜底方式：

```text
用户提问
  ↓
关键词提取
  ↓
全文搜索 + 向量搜索 + 图谱搜索
  ↓
返回相关资料卡片
  ↓
展示命中片段
  ↓
展示来源和时间
  ↓
提供“配置模型后生成答案”按钮
```

无大模型回答不应该假装自己会总结。它应该清楚地说：

```text
当前未启用大模型，已为你找到最相关的资料。
```

然后展示：

- 最相关源资料
- 命中片段
- 相关图谱节点
- 相关主题
- 文件日期
- 来源平台

### 4.3 本地小模型时

如果用户配置了本地模型，可以使用本地模型做：

- 简短摘要
- 查询改写
- 关键词扩展
- 结果聚合
- 低风险问答

但需要在 UI 中标明：

```text
使用本地模型生成。
```

## 5. Query Planner

搜索和问答中间需要一个 `QueryPlanner`。

职责：

- 判断用户是搜索还是提问。
- 判断需要哪些检索通道。
- 判断是否需要调用大模型。
- 判断是否需要进入图谱扩展。
- 判断是否需要展示无模型兜底结果。

示例：

```text
“帮我总结上周的飞书资料”
  -> 问答模式 + 时间过滤 + 飞书来源过滤 + LLM

“MCP”
  -> 搜索模式 + 全文 + 向量 + 图谱节点

“这个污染节点影响了哪些回答？”
  -> 图谱治理搜索 + 影响范围分析
```

## 6. 检索通道

### 6.1 FullTextRetriever

用于：

- 文件名
- 标题
- URL
- 精确关键词
- 解析文本

### 6.2 VectorRetriever

用于：

- 语义相似
- 自然语言问题
- 跨措辞召回

### 6.3 GraphRetriever

用于：

- 节点搜索
- 关系扩展
- 主题探索
- 影响范围分析

### 6.4 SourceRetriever

用于：

- 源资料管理
- 文件夹/日期/类型/来源过滤
- 是否入记忆
- 是否解析成功

## 7. 结果融合

多路检索结果需要融合排序。

排序因素：

- 语义相似度
- 关键词命中
- 图谱距离
- 来源可信度
- 用户标星
- 最近使用
- 时间新鲜度
- 是否已入记忆
- 是否污染或隔离

污染或隔离数据默认排除。

如果用户在治理模式中搜索污染内容，则可以显示，但必须明显标注。

## 8. 搜索结果模型

```json
{
  "result_id": "uuid",
  "result_type": "source | chunk | graph_node | graph_edge | answer",
  "title": "结果标题",
  "snippet": "命中片段",
  "score": 0.91,
  "source_id": "uuid",
  "chunk_id": "uuid",
  "graph_node_id": "uuid",
  "trace": {
    "source_title": "源文件标题",
    "source_platform": "feishu",
    "source_url": "https://...",
    "local_file_path": "/data/raw/...",
    "position": "page 3 / 02:31-03:10"
  },
  "status": {
    "parse_status": "parse_success",
    "memory_status": "memory_indexed",
    "pollution_status": "clean"
  }
}
```

## 9. 问答结果模型

```json
{
  "answer_id": "uuid",
  "mode": "llm_answer | local_model_answer | search_fallback",
  "answer": "回答内容",
  "citations": [
    {
      "source_id": "uuid",
      "chunk_id": "uuid",
      "title": "源资料标题",
      "position": "page 2",
      "quote": "引用片段"
    }
  ],
  "used_graph_nodes": ["uuid"],
  "used_retrievers": ["full_text", "vector", "graph"],
  "warnings": ["当前未启用大模型，展示的是搜索结果兜底。"]
}
```

## 10. API 设计建议

### 10.1 搜索 API

```http
POST /api/search
```

请求：

```json
{
  "query": "本地 AI 记忆",
  "mode": "all | source | memory | graph",
  "filters": {
    "source_platform": ["feishu"],
    "date_from": "2026-01-01",
    "date_to": "2026-06-17",
    "parse_status": ["parse_success"],
    "memory_status": ["memory_indexed"],
    "include_polluted": false
  }
}
```

### 10.2 问答 API

```http
POST /api/ask
```

请求：

```json
{
  "question": "我最近关于图谱设计讨论了什么？",
  "model_mode": "auto | external_llm | local_model | search_only",
  "filters": {
    "include_polluted": false
  }
}
```

### 10.3 图谱搜索 API

```http
POST /api/graph/search
```

### 10.4 图谱邻居 API

```http
GET /api/graph/nodes/{node_id}/neighbors
```

## 11. MCP 工具

需要给外部大模型和 Codex 暴露这些工具：

```text
memory.search
memory.ask
memory.get_context
source.search
source.status
graph.search
graph.get_neighbors
graph.trace_source
```

其中 `memory.ask` 应支持：

```text
use_llm: true | false
```

如果外部模型自己有生成能力，可以只调用：

```text
memory.get_context
```

然后由外部模型生成答案。

## 12. 用户体验原则

- 搜索永远可用，即使没有大模型。
- 大模型增强答案，但不能成为找资料的唯一方式。
- 所有答案都要能回到源资料。
- 图谱搜索要能定位节点，而不是只返回列表。
- 污染数据默认不参与普通搜索。
- 用户需要明确知道当前结果是“AI 生成答案”还是“搜索兜底结果”。

