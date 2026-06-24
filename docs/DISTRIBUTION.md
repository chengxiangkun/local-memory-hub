# 分发与打包说明

记录当前可用的分发方式与待办的工程,**如实标注哪些已验证、哪些受限未做**。

## 现状一览

| 形态 | 状态 | 说明 |
| --- | --- | --- |
| 源码自构建(开发者) | ✅ 可用 | `git clone` → `npm install` → `npm start` |
| macOS **自包含** `.app`(免依赖仓库/node) | ✅ **已实现并验证** | `npm run desktop:build`(672MB);内置 node + 工程 + 依赖,**脱离仓库/系统 node 也能跑**;已实测双击启动→自动起服务→窗口加载。未签名,首次右键→打开 |
| Windows 自包含安装包 | ⏳ CI 可出,**未实测** | GitHub Actions 在 windows runner 上同样组装运行时打包;**本机是 Mac,无法验证 Windows 实跑**,需在 Windows 上测一次 |
| macOS 签名 + 公证(分发给他人免警告) | ⏳ 未做(可选) | 需 Apple Developer ID;开源不强制 |
| npm 全局命令(`lmh start`) | ⏳ 未做 | 可发布为 npm 包,面向开发者 |

> **自包含原理**:`apps/desktop/stage-runtime.mjs` 在构建前把"当前平台的 node 二进制 + apps/ + node_modules"组装到 `src-tauri/runtime/`,经 `tauri.conf.json` 的 `bundle.resources` 打进包;`main.rs` 优先用包内 `resources/runtime/`(回退开发态)。子进程用 `process.execPath`(即包内 node),所以无 node 的机器也能跑。
> **体积与模型**:包约 672MB(含 onnxruntime 等本地向量依赖);e5 向量模型(~470MB)首次按需下载,离线时自动回退轻量向量。若要显著瘦身,可后续把"本地向量"做成可选项。

## macOS 未签名 .app(已验证)

```bash
npm run desktop:build
# 产物:apps/desktop/src-tauri/target/release/bundle/macos/Local Memory Hub.app
```

首次打开被 Gatekeeper 拦时:右键 → 打开,或:

```bash
xattr -dr com.apple.quarantine "/path/to/Local Memory Hub.app"
```

> **限制**:当前 `.app` 运行时仍依赖**本机的本仓库与 node**(开源"自构建"模型)。移到别的 Mac 需设 `LMH_HOME` 指向该机的仓库副本、`LMH_NODE` 指向 node,否则无法启动。

## 分发给他人(macOS):签名 + 公证

免 Gatekeeper 警告需 Apple Developer ID($99/年):

1. `codesign --deep --sign "Developer ID Application: <你的名字>" "Local Memory Hub.app"`
2. `xcrun notarytool submit ... --wait` 公证
3. `xcrun stapler staple "Local Memory Hub.app"`

开源/本机使用**不需要**这一步。

## 自包含 .app(跨机免依赖)——待办工程

要让 `.app` 拷到任意 Mac 双击即用,需要:

1. 把 node 运行时打进 Tauri `resources`(或用 `pkg`/`node --build-sea` 生成单文件可执行)。
2. 把本仓库(去掉开发依赖)+ `node_modules` 一并打进 `resources`。
3. 改 `apps/desktop/src-tauri/src/main.rs`:`repo_root` / `node_bin` 优先指向 bundle 内 `resources`,而非本机路径。
4. 体积会显著变大(node + node_modules + e5 模型),需评估是否首次启动再按需下载 embedding 模型。

这是一块独立的中大型工程,目前未做。

## Windows 安装包 —— 本机无法构建(如实说明)

Tauri 的 Windows 安装包需要在 **Windows** 上(或交叉编译链)用 `windows` target 构建,本开发机为 macOS,**无法在此构建或验证 Windows 产物**。在 Windows 机器上的大致步骤:

```bash
rustup target add x86_64-pc-windows-msvc
npm install
npm run desktop:build   # 产出 .msi / .exe(NSIS)
```

代码是跨平台的(Rust sidecar + 本地 Node 服务),理论可构建,但需在 Windows 实测后才能确认。

## npm 全局命令(可选,面向开发者)

可将本仓库发布为 npm 包,提供 `lmh start / stop / open / doctor`(`local-cli.js` 已具雏形),`npx local-memory-hub start` 一键起服务。属后续待办。
