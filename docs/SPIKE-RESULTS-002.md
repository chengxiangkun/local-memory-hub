# Spike Results 002：FileImporter + SQLite + 本地搜索

## 结论

第二批地基 Spike 已通过。

已验证：

- `FileImporter` 可导入本地文件。
- 源文件可复制到本地数据目录 `raw/files/`。
- `SourceRecord` 可写入 SQLite。
- `GET /api/sources` 可从 SQLite 读取。
- `GET /api/search?q=` 可进行基础本地搜索。
- 文本、URL、文件三种导入都走统一 Import Pipeline。

## 新增能力

### SQLite

新增数据库：

```text
.local-memory-data/database/main.sqlite
```

新增表：

```text
sources
```

包含状态字段：

- import_status
- parse_status
- memory_status
- trace_status
- pollution_status

### FileImporter

支持请求：

```json
{
  "entrypoint": "file_upload",
  "source_hint": "file",
  "payload": {
    "file_path": "/path/to/file"
  }
}
```

### Search

支持接口：

```http
GET /api/search?q=关键词
```

当前搜索范围：

- 标题
- 类型
- 来源平台
- 原始 URL
- 本地路径

## Smoke Test 结果

```text
Smoke test passed
{
  "source_count": 3,
  "search_count": 1
}
```

## 当前限制

- 还没有全文索引。
- 还没有解析文本搜索。
- 还没有语义搜索。
- 还没有污染状态更新接口。
- SQLite 当前通过系统 `sqlite3` CLI 调用，只适合 Spike；正式项目应考虑 SQLite Node binding 或 Rust 侧数据库访问。

## 下一步建议

1. 增加解析任务表和最小文本解析。
2. 增加解析状态更新。
3. 增加 extracted text 存储。
4. 搜索扩展到解析文本。
5. 增加污染隔离接口。

