# Local Memory Hub

本目录是 Local Memory Hub 的代码 Spike 工程。

当前阶段目标：

- 验证本地 API 服务。
- 验证本地数据目录初始化。
- 验证 SourceRecord。
- 验证统一 Import Pipeline。
- 验证本地解析、记忆片段、图谱、向量索引、污染治理、模型 Provider、MCP-like 外部调用和升级迁移。

## 目录结构

```text
apps/api/                 本地 API、导入、解析、记忆、图谱、向量、模型 Provider
apps/web/                 图谱首页原型
apps/mcp/                 MCP-like 本地外部调用验证
docs/SPIKE-RESULTS-*.md   每一步工程验证记录
docs/product-planning/    PRD、架构、原型、路线图、用户故事、测试场景
spikes/                   桌面壳等专项 spike
```

## 运行

```bash
npm run dev:api
```

默认服务地址：

```text
http://127.0.0.1:4317
```

默认数据目录：

```text
./.local-memory-data
```

可通过环境变量修改：

```bash
LMH_DATA_DIR=/path/to/data npm run dev:api
LMH_PORT=4318 npm run dev:api
```

## Smoke Test

另开一个终端启动 API 后运行：

```bash
npm run test:api
npm run test:model
npm run test:fallback
npm run test:mcp
npm run test:migration
npm run test:vector
```

## Git

本仓库只管理工程代码和产品/架构文档。

本地运行数据默认保存在 `.local-memory-data/`，已通过 `.gitignore` 排除，不会进入 Git。

## Tauri 状态

当前机器没有 `rustc`，所以 Tauri 编译 Spike 暂未执行。先验证本地服务和数据地基。
