# 本地运行时与分发架构

## 1. 目标

Local Memory Hub V1 同时支持两种启动入口：

- 桌面安装包：给普通用户使用，双击启动。
- npm CLI：给开发者、AI 工具重度用户和早期验证用户使用。

两种入口不能各写一套启动逻辑。V1 只保留一套本地服务内核，桌面壳和 CLI 只负责拉起、停止和展示状态。

## 2. 共享内核

桌面安装包和 npm CLI 必须共用：

- 数据目录解析规则。
- API 服务。
- Web UI 服务。
- schema 检查和迁移逻辑。
- 配置读写逻辑。
- 日志目录。
- 端口检测和进程记录。

不共用的是外层交互：

- 桌面版用窗口、设置页和弹窗提示用户。
- CLI 用终端输出和退出码提示用户。

## 3. DataDirResolver

所有入口必须通过 `DataDirResolver` 获取最终数据目录。

优先级：

1. 命令行参数：`--data-dir`
2. 环境变量：`LMH_DATA_DIR`
3. 已保存的用户配置。
4. 系统默认目录。

系统默认目录：

| 系统 | 默认目录 |
| --- | --- |
| macOS | `~/Library/Application Support/LocalMemoryHub` |
| Windows | `%APPDATA%/LocalMemoryHub` |
| Linux | `~/.local/share/local-memory-hub` |

约束：

- 用户数据不能写入应用安装目录。
- 用户数据不能写入 npm 包安装目录。
- 设置页只能只读展示当前路径。
- 修改数据目录必须走受控迁移流程，不能直接改文本框。

## 4. ServiceSupervisor

`ServiceSupervisor` 是本地服务编排器，V1 只做最小职责。

当前最小实现位置：

```text
apps/api/src/service-supervisor.js
```

必须负责：

- 启动 API 服务。
- 启动 Web UI 服务。
- 停止由当前入口启动的服务。
- 检查 API 和 Web 端口是否可用。
- 在数据目录下写入 PID 记录。
- 清理已失效 PID。
- 输出健康检查结果。

不负责：

- 模型供应商配置。
- 导入任务调度。
- 迁移具体执行。
- 后台守护和自启动。
- 自动更新。

默认端口：

| 服务 | 默认端口 |
| --- | --- |
| API | `4317` |
| Web UI | `3100` |

端口只能监听 `127.0.0.1`。V1 不开放远程访问。

## 5. 启动流程

```text
入口启动
  ↓
解析数据目录
  ↓
创建标准目录结构
  ↓
检查端口和 PID
  ↓
启动 API
  ↓
执行 schema 检查
  ↓
需要迁移则进入迁移流程
  ↓
启动 Web UI
  ↓
打开页面或输出本地地址
```

桌面版可以在迁移阶段展示 UI；CLI 则输出提示并支持 `--yes`。

## 6. 迁移触发点

迁移只在启动时触发，或由用户主动执行 `lmh migrate`。

迁移前必须：

- 读取 `app-meta/schema-version.json`。
- 备份数据库、配置和索引元数据。
- 明确提示源文件不会被删除。

迁移失败时：

- 不删除 `raw/` 下的源文件。
- 记录 `logs/migration.log`。
- 写入迁移历史。
- 服务进入受限模式，只允许查看错误、恢复备份或重试。

## 7. 日志

日志统一写入数据目录：

```text
logs/
  app.log
  migration.log
  model-calls.log
  external-calls.log
```

要求：

- 不记录 API Key 明文。
- CLI 将关键状态输出到终端。
- 桌面版在设置页提供查看日志入口。
- V1 不做自动日志上报。

## 8. CLI 最小命令

V1 npm CLI 至少支持：

```text
lmh start
lmh stop
lmh open
lmh doctor
lmh data-dir
lmh migrate
lmh version
```

退出码约定：

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 普通失败 |
| `2` | 环境或端口不可用 |
| `3` | 数据目录不可用 |
| `4` | 迁移失败 |

## 9. V1 不做

- 桌面自动更新。
- 系统级后台守护进程。
- 开机自启动。
- 跨设备同步。
- 云备份。
- 完整一键回滚。
- 远程局域网访问。
- 多数据目录热切换。

这些能力需要真实使用数据证明后再加。
