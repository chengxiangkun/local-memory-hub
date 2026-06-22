# Local Memory Hub 外部接入说明

## 本地服务

默认 API：

```text
http://127.0.0.1:4317
```

默认 Web：

```text
http://127.0.0.1:3100
```

MCP-like 服务默认只应监听本地地址，避免把本地记忆暴露到公网。

## 常用 API

### 健康检查

```http
GET /health
```

### 搜索本地记忆

```http
GET /api/search?q=关键词
GET /api/vector/search?q=关键词
GET /api/graph/search?q=关键词
```

### 问答

```http
POST /api/ask
Content-Type: application/json

{
  "question": "这些资料里有什么产品机会？",
  "provider_id": "deepseek",
  "persist_memory": true
}
```

### 导入资料

```http
POST /api/import
Content-Type: application/json

{
  "entrypoint": "external_tool",
  "source_hint": "text",
  "payload": {
    "title": "外部工具导入",
    "text": "需要进入本地记忆的内容"
  }
}
```

### 连接器状态

```http
GET /api/connectors
POST /api/connectors
POST /api/connectors/sync
```

第一版飞书支持按文档/文件夹链接真实拉取并导入；腾讯文档先支持链接登记和归档，内容解析需要导出原文或后续接入腾讯文档 API。

飞书详细说明见：[飞书接入说明](integrations/feishu.md)。

### 污染治理

```http
POST /api/sources/quarantine
POST /api/sources/restore
POST /api/sources/delete
```

外部工具默认不应返回隔离内容。

## Codex / 外部 AI 工具接入

推荐优先使用：

- `memory.search`：只取上下文，由外部模型自己生成答案。
- `memory.get_context`：获取结构化上下文。
- `graph.search`：查找图谱节点。

只有当调用方希望 Local Memory Hub 直接生成回答时，才使用 `/api/ask` 或 `memory.ask`。
