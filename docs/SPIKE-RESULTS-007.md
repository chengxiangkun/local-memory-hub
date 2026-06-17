# Spike Results 007：恢复隔离 + 影响范围 + 后端图谱搜索

## 结论

第七批 Spike 已通过。

已验证：

- `GET /api/sources/impact?source_id=` 可返回影响范围。
- `POST /api/sources/quarantine` 可级联隔离源资料、文本片段、图谱节点。
- `POST /api/sources/restore` 可恢复源资料、文本片段、图谱节点。
- `GET /api/graph/search?q=` 可搜索图谱节点。
- 前端图谱搜索已改为调用后端接口。
- 前端节点详情可查看影响范围。
- 前端节点详情支持隔离和恢复。

## 新增接口

### 影响范围

```http
GET /api/sources/impact?source_id=uuid
```

返回：

- 源资料
- 文本片段数量
- 图谱节点数量
- 图谱关系数量

### 恢复隔离

```http
POST /api/sources/restore
```

请求：

```json
{
  "source_id": "uuid"
}
```

## 验证结果

隔离前：

```json
{
  "counts": {
    "segments": 1,
    "graph_nodes": 2,
    "graph_edges": 1
  }
}
```

隔离后：

```json
{
  "nodes": [],
  "edges": []
}
```

恢复后：

```json
{
  "nodes": 2,
  "edges": 1
}
```

## 当前限制

- 影响范围还不包含历史问答引用。
- 恢复操作没有权限确认。
- 图谱搜索只搜节点标签和类型。
- 前端仍是简化 SVG 图谱。

## 下一步建议

继续验证：

1. 模型 Provider 抽象。
2. Mock Provider 问答。
3. OpenAI-Compatible 配置结构。
4. 解析失败的大模型兜底链路。

