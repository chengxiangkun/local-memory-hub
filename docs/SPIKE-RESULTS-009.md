# Spike Results 009：解析失败的大模型兜底

## 结论

第九批 Spike 已通过。

已验证：

- 本地解析失败时可触发 `llm_fallback`。
- Mock Provider 可生成兜底解析结果。
- 兜底结果可保存为抽取文本。
- 兜底结果可生成文本片段。
- 兜底结果可生成图谱节点。
- 可保存 parser improvement artifact。
- 源资料状态可更新为 `llm_fallback_success`。

## 新增数据表

```text
parser_improvements
```

## API 用法

```http
POST /api/parse
```

请求：

```json
{
  "source_id": "uuid",
  "llm_fallback": true
}
```

## Smoke Test 结果

```text
Fallback smoke test passed
{
  "status": "llm_fallback_success",
  "graph_nodes": 2
}
```

## 当前限制

- 当前使用 Mock Provider，不是真实外部模型。
- parser improvement 只是保存样例和建议规则，没有自动生成可执行解析器。
- 没有 token 估算。
- 没有模型调用日志表。

## 下一步建议

1. 增加模型调用日志表。
2. 增加 MCP Server 最小验证。
3. 增加升级迁移验证。

