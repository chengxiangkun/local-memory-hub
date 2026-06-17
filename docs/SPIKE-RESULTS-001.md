# Spike Results 001：本地 API + 数据目录 + SourceRecord + Import Pipeline

## 结论

第一批非 Tauri 地基 Spike 已通过。

已验证：

- 本地 API 服务可启动。
- `/health` 可返回服务状态和数据目录。
- 应用可初始化本地数据目录。
- 可创建 `SourceRecord`。
- 文本导入可走统一导入管线。
- URL 导入可走统一导入管线。
- URL 可识别基础平台，例如 B 站。
- 导入结果可落盘到 `database/sources.json`。

## 当前限制

Tauri 编译未验证，因为当前机器缺少 Rust：

```text
rustc: command not found
```

因此 S1 只完成了本地 API 服务部分，Tauri sidecar 启停需后续安装 Rust 后继续。

## 验证命令

启动 API：

```bash
cd local-memory-hub
npm run dev:api
```

运行 smoke test：

```bash
npm run test:api
```

## Smoke Test 结果

```text
Smoke test passed
```

验证接口：

- `GET /health`
- `POST /api/import`
- `GET /api/sources`

## 数据目录

默认数据目录：

```text
local-memory-hub/.local-memory-data
```

当前目录结构：

```text
.local-memory-data/
  app-meta/
  raw/
  extracted/
  database/
  index/
  graph/
  config/
  logs/
  backups/
  trash/
```

## 下一步

建议继续：

1. 增加 FileImporter。
2. 增加 SQLite 存储 Spike，替换 `sources.json`。
3. 增加本地搜索接口。
4. 安装 Rust 后继续 Tauri shell Spike。

