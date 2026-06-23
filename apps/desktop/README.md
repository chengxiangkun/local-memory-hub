# Local Memory Hub 桌面运行时(Tauri)

把本地 Web 原型包装成桌面应用。**生产态 sidecar**:应用启动时由 Rust 拉起本地
API(4317)与 Web(3100)服务,等 Web 就绪后创建窗口加载 `http://127.0.0.1:3100`;
退出时停掉服务。打包出的 `.app` 可"双击即用",无需先手动起服务。

开源项目,**无需 Apple 开发者证书**即可构建与本机使用(未签名 `.app` 首次打开
可能被 Gatekeeper 拦,右键→打开,或 `xattr -dr com.apple.quarantine <App>` 一次即可)。
仅当要分发给他人且免警告时,才需要 Developer ID 签名 + 公证。

## 前置
- Rust 工具链(rustc/cargo 1.96+)
- `@tauri-apps/cli`(已在 devDependencies)
- Node 在常见路径(`/usr/local/bin/node` 等)或设 `LMH_NODE` 指定

## 运行(开发态)
仓库根目录执行:
```bash
npm run desktop
```

## 打包未签名 .app(本机/开源分发)
```bash
npm run desktop:build
```
产物在 `apps/desktop/src-tauri/target/release/bundle/macos/Local Memory Hub.app`。

## 路径解析(GUI 启动时 PATH 精简)
打包后的 `.app` 通过以下方式定位依赖,均可用环境变量覆盖:
- **node**:`LMH_NODE` → `/usr/local/bin/node`/`/opt/homebrew/bin/node`/`/usr/bin/node` → `node`
- **仓库根**:`LMH_HOME` → 编译期路径(`CARGO_MANIFEST_DIR` 上溯三级)

> 说明:`.app` 运行时仍依赖本仓库的 node 工程与 `node_modules`(开源"自构建"模型)。
> 若把 `.app` 移到别的机器,需设 `LMH_HOME` 指向该机器上的仓库副本,或后续做完整
> sidecar 打包(把 node 运行时与工程一并嵌入)。

## 结构
```
apps/desktop/src-tauri/
  Cargo.toml          Rust 依赖(tauri v2)
  tauri.conf.json     构建/图标/窗口(动态创建);frontendDist 指向本地 Web
  build.rs            tauri-build
  src/main.rs         生产态 sidecar(起服务→等就绪→建窗口→退出停服务)
  capabilities/       窗口权限(core:default)
  icons/              应用图标
```
