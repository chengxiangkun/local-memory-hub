# Spike Results 014：npm CLI 一键安装/启动验证

## 结论

npm CLI 入口可行，适合作为 Local Memory Hub V1 的开发者分发路径。

它不能替代 Mac/Windows 桌面安装包，但可以满足：

- 开发者快速试用。
- AI 工具重度用户通过终端启动本地记忆服务。
- 后续 Codex/Cursor 等工具接入前的本地服务启动。

## 验证位置

```text
spikes/s13-npm-cli/
```

## 已实现命令

```bash
lmh-spike start
lmh-spike stop
lmh-spike doctor
lmh-spike data-dir
```

Spike 中使用 `lmh-spike` 避免和未来正式命令 `lmh` 冲突。

## 验证结果

### 语法检查

```bash
npm run check
```

结果：通过。

### 数据目录

```bash
node src/cli.js data-dir --data-dir /tmp/lmh-cli-spike-data
```

结果：

```text
/tmp/lmh-cli-spike-data
```

### Doctor

```bash
node src/cli.js doctor --data-dir /tmp/lmh-cli-spike-data --port 4397 --web-port 3197
```

结果：

```text
✓ Node 版本：v24.14.0
✓ 项目根目录：/Users/xiaocheng/build/codex/codex-projects/local-memory-hub
✓ 数据目录：/tmp/lmh-cli-spike-data
✓ API 端口 4397：未占用
✓ Web 端口 3197：未占用
```

### Start

```bash
node src/cli.js start --data-dir /tmp/lmh-cli-spike-data --port 4397 --web-port 3197
```

结果：

- API 启动：`http://127.0.0.1:4397`
- Web 启动：`http://127.0.0.1:3197`
- API `/health` 返回正常。
- Web 首页返回 HTTP 200。

### Stop

```bash
node src/cli.js stop --data-dir /tmp/lmh-cli-spike-data
```

结果：

```text
已停止 api 服务
已停止 web 服务
```

停止后：

- API/Web 端口释放。
- PID 文件移除。
- 父进程退出。

### npm 安装验证

默认 `npm link` 失败：

```text
EACCES: permission denied, symlink ... -> /usr/local/lib/node_modules/local-memory-hub-cli-spike
```

原因是当前机器全局 npm 目录需要更高权限。

使用自定义 prefix 验证成功：

```bash
npm install --prefix /tmp/lmh-npm-prefix -g .
/tmp/lmh-npm-prefix/bin/lmh-spike doctor --data-dir /tmp/lmh-cli-spike-data --port 4397 --web-port 3197
```

结果：通过。

### npm pack dry-run

```bash
npm pack --dry-run
```

结果：

```text
package size: 2.7 kB
unpacked size: 7.1 kB
total files: 2
```

## 发现的问题

### 1. 全局 npm 安装可能遇到权限问题

这会影响 `npm install -g local-memory-hub`。

正式文档需要优先推荐：

```bash
npx local-memory-hub start
```

或提供 npm global prefix 配置说明。

### 2. 正式默认数据目录尚未统一

当前 API `data-store.js` 默认使用项目内 `.local-memory-data`，而 ADR 已要求正式产品使用系统默认目录。

正式开发前需要统一：

```text
参数 --data-dir > LMH_DATA_DIR > 用户配置 > 系统默认目录
```

### 3. Stop 需要 PID 文件或进程管理器

Spike 使用数据目录下的 PID 文件：

```text
app-meta/cli-spike-pids.json
```

正式实现需要增加：

- stale PID 检测。
- 端口占用进程提示。
- Windows 进程退出验证。

### 4. 迁移尚未接入 CLI

正式 `lmh start` 应在 API ready 后触发 schema 检查，必要时提示用户迁移。

## 建议

V1 可以保留两条入口：

1. 桌面安装包：普通用户优先。
2. npm CLI：开发者和 AI 工具用户优先。

正式 CLI 最小命令：

```text
lmh start
lmh stop
lmh open
lmh doctor
lmh data-dir
lmh migrate
lmh version
```

下一步如果进入实现，应先抽出统一的 `DataDirResolver` 和 `ServiceSupervisor`，避免 Tauri、npm CLI、测试脚本各自实现一套启动逻辑。

## 后续落地

已抽出：

- `apps/api/src/data-dir-resolver.js`
- `apps/api/src/service-supervisor.js`

CLI Spike 已改为复用这两个模块。后续 Tauri 桌面壳应继续复用同一套模块，不再复制启动、停止、端口检测和 PID 文件逻辑。
