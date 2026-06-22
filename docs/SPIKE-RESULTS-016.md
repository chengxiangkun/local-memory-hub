# Spike Results 016：本地数据库与向量存储选型

## 结论

V1 默认方案：

```text
SQLite 作为本地元数据主库
轻量本地向量索引作为 V1 内置默认
Qdrant 作为后续高级可选项
PostgreSQL + pgvector 不作为 V1 默认本地方案
```

## 原因

Local Memory Hub 的第一优先级是一键启动、本地数据安全和升级不丢数据。

SQLite 更适合 V1：

- 单文件数据库，便于备份和迁移。
- 无需本地数据库服务。
- 更符合桌面应用和 npm CLI 的启动模型。
- 当前代码已经通过 SQLite 跑通源资料、文本片段、图谱、向量索引和污染治理链路。

PostgreSQL + pgvector 暂不作为 V1 默认：

- 本地安装和打包复杂。
- 需要额外服务进程。
- 对普通用户一键启动不友好。

Qdrant 暂不作为 V1 默认：

- 官方本地快速启动依赖 Docker。
- Docker 对普通桌面用户不是零配置。
- 适合后续高级用户或大规模数据模式。

## 当前实现状态

当前 Spike 使用：

```text
apps/api/src/sqlite-store.js
```

现状：

- 使用系统 `sqlite3` CLI。
- 数据库文件位于 `database/main.sqlite`。
- 已建表：
  - `sources`
  - `parse_jobs`
  - `extracted_texts`
  - `memory_segments`
  - `graph_nodes`
  - `graph_edges`
  - `parser_improvements`
  - `vector_index`

这能继续用于验证，但不适合正式一键启动。

## 正式实现建议

进入正式实现时，不再依赖系统 `sqlite3` 命令。

可选路径：

### 路径 A：Node 内嵌 SQLite

使用 `better-sqlite3`。

优点：

- Node 侧改造成本低。
- API 简单。
- 支持事务、WAL 和扩展。

风险：

- 原生模块需要关注 Mac/Windows 打包。
- npm 安装时要关注 Node 版本和预构建二进制。

### 路径 B：Tauri/Rust 侧 SQLite

使用 Rust SQLite binding，由桌面壳或本地服务统一访问数据库。

优点：

- 更贴近 Tauri 桌面分发。
- 打包可控。

风险：

- 当前机器缺 Rust，Spike 暂不能验证。
- Node API 层需要调整为调用 Rust 或共享数据库访问边界。

## 向量存储策略

V1 继续保留可插拔向量层：

```text
VectorIndexAdapter
  - HashVectorAdapter（当前默认，只用于无模型兜底和工程链路）
  - EmbeddingProviderAdapter（外部或本地 embedding）
  - SQLiteVecAdapter（候选）
  - QdrantAdapter（后续高级模式）
```

当前 hash-bag 向量只用于验证：

- 索引写入。
- 搜索排序。
- 污染隔离后排除结果。
- 无模型时可兜底。

正式语义效果不能依赖它。

## 外部方案扫描

- `better-sqlite3`：Node SQLite 库，官方 README 强调事务、性能和简单同步 API，适合替代系统 `sqlite3` CLI。
- `sqlite-vec`：SQLite 向量扩展，官方说明其小、可运行在多平台，但仍是 pre-v1，V1 可作为候选，不直接强依赖。
- Qdrant：官方本地快速启动使用 Docker，适合高级模式，不适合作为普通用户 V1 默认。
- Tauri：官方要求 Rust 工具链，当前机器缺 Rust，因此桌面壳数据库路径需后续继续验证。

参考：

- https://github.com/WiseLibs/better-sqlite3
- https://github.com/asg017/sqlite-vec
- https://qdrant.tech/documentation/quickstart/
- https://tauri.app/start/prerequisites/

## 下一步

短期继续保留当前 `sqlite3` CLI Spike 实现，避免现在引入原生依赖。

正式代码阶段需要新增一个 `StorageAdapter` 边界：

```text
业务服务 -> StorageAdapter -> SQLite 实现
```

先迁移最核心的接口：

- 初始化 schema。
- 写入源资料。
- 列表查询。
- 搜索。
- 污染隔离。

迁移完成后，再替换底层 SQLite 访问方式。
