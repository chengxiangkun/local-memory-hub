# S13 Spike：npm CLI 一键安装/启动

## 目标

验证 Local Memory Hub 是否能提供开发者友好的 npm CLI 入口。

## 已验证命令

```bash
node src/cli.js data-dir --data-dir /tmp/lmh-cli-spike-data
node src/cli.js doctor --data-dir /tmp/lmh-cli-spike-data --port 4397 --web-port 3197
node src/cli.js start --data-dir /tmp/lmh-cli-spike-data --port 4397 --web-port 3197
node src/cli.js stop --data-dir /tmp/lmh-cli-spike-data
```

## 已验证能力

- `data-dir` 输出当前有效数据目录。
- `doctor` 检查 Node 版本、项目根目录、数据目录、API/Web 端口。
- `start` 编排启动现有 API 和 Web 服务。
- `stop` 通过 PID 文件停止 CLI 启动的 API 和 Web 服务。
- 自定义 npm prefix 安装后，bin 入口可执行。

## 重要发现

- 默认 `npm link` 写入 `/usr/local/lib/node_modules` 时可能因为权限失败。
- 使用自定义 prefix 可以绕过权限问题：

```bash
npm install --prefix /tmp/lmh-npm-prefix -g .
/tmp/lmh-npm-prefix/bin/lmh-spike doctor
```

这说明正式文档需要推荐 `npx` 或指导用户配置 npm global prefix。

## 当前限制

- 还没有实现 `lmh open`、`lmh config`、`lmh migrate`。
- 还没有自动打开浏览器。
- 还没有 MCP 服务编排。
- 还没有 Windows 验证。
- 当前 CLI Spike 使用独立默认目录逻辑，正式实现必须和 `data-store.js` 共用同一套目录发现规则。

