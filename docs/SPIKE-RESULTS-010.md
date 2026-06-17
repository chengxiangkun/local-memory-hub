# Spike Results 010：MCP-like 本地调用

## 结论

第十批 Spike 已通过。

已验证：

- 本地 MCP-like 服务可启动。
- 支持 JSON-RPC 风格 `tools/list`。
- 支持 JSON-RPC 风格 `tools/call`。
- 可调用 `memory.search`。
- 可调用 `memory.get_context`。
- 可调用 `graph.search`。
- MCP-like 服务可通过本地 API 获取记忆和图谱上下文。

## 服务地址

```text
http://127.0.0.1:4318
```

## 新增命令

启动 MCP-like 服务：

```bash
npm run dev:mcp
```

测试：

```bash
npm run test:mcp
```

## Smoke Test 结果

```text
MCP-like smoke test passed
{
  "tools": 3
}
```

## 当前限制

- 这是 MCP-like JSON-RPC Spike，不是最终 MCP SDK 集成。
- 没有权限确认 UI。
- 没有外部调用日志表。
- 没有远程访问保护配置。
- 还没有 Codex 实际配置文件验证。

## 下一步建议

1. 接入正式 MCP SDK 或协议实现。
2. 增加外部调用日志。
3. 增加 MCP 开关和只监听本地地址的配置。
4. 生成 Codex 接入说明。

