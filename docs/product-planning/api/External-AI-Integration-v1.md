# 外部 AI 工具接入说明

## 1. 本地地址

V1 默认只监听本地地址：

```text
API: http://127.0.0.1:4317
MCP-like: http://127.0.0.1:4318
```

不开放局域网和公网访问。

## 2. MCP-like JSON-RPC

工具列表：

```http
POST http://127.0.0.1:4318/rpc
```

请求：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

## 3. 可用工具

### memory.search

搜索本地记忆和源资料。

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "memory.search",
    "arguments": {
      "query": "图谱设计"
    }
  }
}
```

### memory.get_context

获取适合外部 AI 使用的结构化上下文。

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "memory.get_context",
    "arguments": {
      "query": "模型配置"
    }
  }
}
```

### memory.ask

让 Local Memory Hub 基于本地记忆生成回答。默认不把这次外部调用写入问答记忆。

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "memory.ask",
    "arguments": {
      "question": "模型配置怎么选？",
      "provider_id": "mock"
    }
  }
}
```

### graph.search

搜索本地图谱节点。

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "graph.search",
    "arguments": {
      "query": "污染治理"
    }
  }
}
```

## 4. 安全边界

- 只返回未隔离、未污染的内容。
- 默认不返回源文件完整内容。
- 外部调用写入 `logs/external-calls.log`。
- 不返回模型 API Key。
- 不支持远程访问。

## 5. 当前限制

- 当前是 MCP-like JSON-RPC Spike，不是正式 MCP SDK 实现。
- 尚未提供授权 UI。
- 尚未提供逐工具权限开关。
- 尚未支持外部工具写入资料。
