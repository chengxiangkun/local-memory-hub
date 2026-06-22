# Spike Results 023：源文件删除范围

## 结论

源文件删除范围最小闭环已通过。

已实现：

- 源文件可移动到 `trash/`。
- 源资料可标记为 `deleted`。
- 删除后的源资料默认隔离。
- 派生产物通过现有污染隔离链路排除出搜索、向量和图谱。

## 新增接口

```http
POST /api/sources/delete
```

参数：

```json
{
  "source_id": "...",
  "delete_source_file": true,
  "delete_derived": true
}
```

## 新增验证

```text
apps/api/src/delete-scope-smoke-test.js
npm run test:delete-scope
```

## 当前限制

- 当前是软删除/移入 trash，不做硬删除。
- 删除审计日志还没有单独落表。
- 还不能只删除单个文本片段或单个图谱节点。

## 下一步

继续补 MCP/API 外部调用：

- 外部搜索本地记忆。
- 外部获取结构化上下文。
- 外部调用不返回污染内容。
