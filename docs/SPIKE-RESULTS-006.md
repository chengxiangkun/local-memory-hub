# Spike Results 006：图谱搜索 + 级联隔离 + 前端错误提示

## 结论

第六批 Spike 已完成。

已验证：

- API 增加 `GET /api/graph/search?q=`。
- 隔离源资料时，会级联隔离：
  - 源资料
  - 文本片段
  - 图谱节点
- 隔离后 `GET /api/graph` 不再返回相关节点和关系。
- 图谱前端导入失败会显示错误提示。
- 图谱节点详情增加“隔离该源资料”操作。

## 新增接口

### 图谱搜索

```http
GET /api/graph/search?q=关键词
```

注意：中文 query 需要 URL encode。浏览器会自动处理。

### 级联隔离

```http
POST /api/sources/quarantine
```

隔离范围：

- `sources.pollution_status`
- `memory_segments.pollution_status`
- `graph_nodes.pollution_status`

## 验证结果

隔离前：

- 源资料可解析。
- 文本片段可生成。
- 图谱节点可生成。

隔离后：

```json
{
  "nodes": [],
  "edges": []
}
```

说明隔离后的图谱节点和边已从普通图谱视图中排除。

## 当前限制

- `graph_edges` 没有单独污染状态，当前通过两端节点过滤。
- 前端搜索仍是本地过滤，尚未调用图谱搜索 API。
- 还没有恢复隔离接口。
- 还没有影响范围预览。

## 下一步建议

1. 增加恢复隔离接口。
2. 增加影响范围 API。
3. 前端图谱搜索改为调用 `/api/graph/search`。
4. 引入专业图谱渲染库 Spike。

