# Spike Results 024：外部 AI 调用日志与接入说明

## 结论

外部 AI 工具调用链路补强完成。

已完成：

- MCP-like 服务保留 `memory.search`、`memory.get_context`、`graph.search`。
- 外部工具调用写入 `logs/external-calls.log`。
- 新增外部接入说明文档。

## 更新文件

```text
apps/mcp/src/server.js
apps/mcp/src/external-call-log.js
docs/product-planning/api/External-AI-Integration-v1.md
```

## 当前限制

- 仍是 MCP-like JSON-RPC，不是正式 MCP SDK。
- 没有授权 UI。
- 没有逐工具权限控制。
- 外部导入资料尚未实现。

## 下一步

后续进入正式 MCP SDK 或插件接入前，再做协议兼容 Spike。
