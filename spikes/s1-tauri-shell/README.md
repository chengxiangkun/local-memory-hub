# S1 Tauri 一键启动本地服务 Spike

当前机器缺少 Rust：

```text
rustc: command not found
```

所以本 Spike 暂时只验证本地 API 服务。

后续需要验证：

1. 安装 Rust。
2. 创建 Tauri 壳。
3. Tauri 启动本地 API sidecar。
4. 前端请求 `/health`。
5. 应用退出时关闭 sidecar。

当前可运行：

```bash
cd local-memory-hub
npm run dev:api
```
