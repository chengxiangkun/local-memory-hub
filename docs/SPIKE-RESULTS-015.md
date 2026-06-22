# Spike Results 015：Tauri 环境复查与数据目录存储补强

## 结论

S1 Tauri 桌面壳验证当前仍受环境限制阻塞；S2 本地数据目录与文件存储验证已补强通过。

## S1：Tauri 当前状态

当前机器未安装 Rust 工具链：

```text
rustc: command not found
cargo: command not found
```

因此暂不能验证：

- Tauri 窗口启动。
- Tauri 拉起本地 API/Web。
- 桌面应用退出后自动清理子进程。

但 npm CLI 路径已经抽出：

- `DataDirResolver`
- `ServiceSupervisor`

后续安装 Rust 后，Tauri Spike 只需要验证桌面壳能否复用这两个模块，不需要重新实现数据目录和服务编排。

## S2：数据目录与文件存储

新增验证脚本：

```text
apps/api/src/data-dir-smoke-test.js
```

新增命令：

```bash
npm run test:data-dir
```

已验证：

- 创建标准数据目录结构。
- 初始化 `app-meta/app-version.json`。
- 初始化 `app-meta/schema-version.json`。
- 初始化 `database/sources.json`。
- 保存原始文本到 `raw/text/`。
- 保存链接到 `raw/links/`。
- 复制源文件到 `raw/files/`。
- 保存抽取文本到 `extracted/text/`。
- 相同内容源资料不会重复插入。
- 数据目录不可用时返回中文错误。

## 验证结果

```text
npm run test:data-dir
Data directory smoke test passed
```

同时通过：

```text
node --check apps/api/src/data-store.js
node --check apps/api/src/data-dir-smoke-test.js
```

## 当前限制

- 还没有实现“移动到回收站”文件级 API。
- 还没有设置页的数据目录迁移向导。
- Tauri 仍需 Rust 环境后继续验证。

## 下一步

继续推进 S3：本地数据库选择。

V1 当前已能使用 SQLite 作为元数据存储，但还需要明确最终默认方案：

- SQLite 继续作为元数据主库。
- 向量索引用轻量本地方案还是 Qdrant。
- 是否完全放弃本地 PostgreSQL + pgvector 作为 V1 默认路径。
