# Spike Results 003：解析任务 + 抽取文本 + 污染隔离

## 结论

第三批 Spike 已通过。

已验证：

- 新增 `parse_jobs` 表。
- 新增 `extracted_texts` 表。
- 文本源资料可解析。
- URL 源资料可解析为保存的链接文本。
- 纯文本类文件可解析。
- 解析状态可从 `parse_pending` 更新为 `parsing` / `parse_success` / `parse_failed`。
- 解析成功后可写入 `extracted/text/`。
- 搜索可覆盖源资料字段和抽取文本预览。
- 污染隔离后，普通搜索默认排除该源资料。

## 新增接口

### 解析源资料

```http
POST /api/parse
```

请求：

```json
{
  "source_id": "uuid"
}
```

### 污染隔离

```http
POST /api/sources/quarantine
```

请求：

```json
{
  "source_id": "uuid"
}
```

## Smoke Test 结果

使用临时数据目录：

```text
/tmp/lmh-spike-003
```

结果：

```text
Smoke test passed
{
  "source_count": 3,
  "search_count": 2,
  "search_after_quarantine_count": 1
}
```

## 当前限制

- 解析还只是最小文本解析。
- PDF/OCR/音视频尚未接入。
- 没有真正的异步任务队列。
- 当前解析接口是同步执行。
- 没有文本片段切分。
- 没有向量索引。
- 污染治理只有隔离，没有恢复和影响范围。

## 下一步建议

1. 增加文本片段表。
2. 实现最小 chunker，也就是用户界面中的“文本片段”生成。
3. 增加内存级或 SQLite 级全文搜索。
4. 增加恢复隔离接口。
5. 开始 Spike 图谱首页最小渲染，或先做 API 层图谱节点表。

