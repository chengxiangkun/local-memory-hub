# Local Memory Hub 桌面运行时(Tauri)

把本地 Web 原型包装成桌面应用:启动时由 Tauri 通过 `beforeDevCommand` 拉起本地
API(4317)与 Web(3100)服务(sidecar 模式),主窗口 webview 加载
`http://127.0.0.1:3100`;退出开发态时 Tauri 会终止这些子进程。

## 前置
- Rust 工具链(已安装 rustc/cargo 1.96+)
- `@tauri-apps/cli`(已在 devDependencies)
- macOS 自带 WebKit,无需额外 GUI 依赖

## 运行(开发态)
在**仓库根目录**执行(`npm start` 依赖 cwd 为仓库根来定位服务脚本):

```bash
npm run desktop
```

首次会编译整个 Tauri 依赖树(数百个 Rust crate,约 10–20 分钟),之后增量编译很快。

## 打包(可选)
```bash
npm run desktop:build
```
产出 `apps/desktop/src-tauri/target/release/bundle/` 下的 `.app`。注意:正式分发还需
代码签名与公证(Apple Developer 证书),本脚手架不含签名配置。

## 结构
```
apps/desktop/src-tauri/
  Cargo.toml          Rust 依赖(tauri v2)
  tauri.conf.json     窗口/构建/图标配置(frontendDist 指向本地 Web 服务)
  build.rs            tauri-build
  src/main.rs         最小入口
  capabilities/       窗口权限(core:default)
  icons/              应用图标
```
