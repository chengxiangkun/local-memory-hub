# Spike Results 004：文本片段 + 图谱最小模型

## 结论

第四批 Spike 已通过。

已验证：

- 解析成功后生成“文本片段”。
- 文本片段写入 SQLite `memory_segments` 表。
- 搜索可命中文本片段。
- 解析成功后生成基础图谱节点。
- 图谱节点写入 `graph_nodes` 表。
- 图谱关系写入 `graph_edges` 表。
- `GET /api/segments?source_id=` 可返回文本片段。
- `GET /api/graph` 可返回节点和关系。

## 新增数据表

```text
memory_segments
graph_nodes
graph_edges
```

## 新增接口

### 获取源资料的文本片段

```http
GET /api/segments?source_id=uuid
```

### 获取图谱

```http
GET /api/graph
```

## Smoke Test 结果

使用临时数据目录：

```text
/tmp/lmh-spike-004
```

结果：

```text
Smoke test passed
{
  "source_count": 3,
  "search_count": 2,
  "segment_count": 1,
  "graph_node_count": 4,
  "search_after_quarantine_count": 1
}
```

## 当前图谱生成规则

当前只是最小规则：

- 每个解析成功的源资料生成一个 source 节点。
- 根据标题和首个文本片段猜一个 topic 节点。
- source 节点和 topic 节点之间生成一条 `contains_topic` 关系。

## 当前限制

- 文本片段切分非常粗糙。
- 没有向量索引。
- 图谱节点没有坐标布局。
- 图谱还没有前端渲染。
- 没有图谱搜索接口。
- 隔离源资料后，已生成图谱节点不会自动隔离。

## 下一步建议

1. 增加图谱搜索接口。
2. 隔离源资料时同步隔离图谱节点和文本片段。
3. 增加最小前端页面，展示图谱首页。
4. 增加 Vite/React 前端，用 D3/Sigma/Cytoscape 之一渲染图谱。

