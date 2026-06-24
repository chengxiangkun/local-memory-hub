# AGENTS.md — AI 接手指南(Local Memory Hub)

> 给"另一个窗口/会话"的接手文档:看完即可直接上手开发、测试、发版。
> 全局编码规范见仓库外 `codex-projects/AGENTS.md`(阿里规范、本地优先、避免造轮子)。

## 1. 项目是什么
本地优先的个人 AI 记忆层:资料导入 → 本地解析(失败大模型兜底)→ 变成"记忆"(文本片段+向量+图谱)→ 图谱/带引用问答/污染治理 → MCP 供外部 AI 调用。数据全程留本机。

- 仓库:`https://github.com/chengxiangkun/local-memory-hub`(公开,MIT;remote=origin,main 跟踪 origin/main)
- 技术栈:Node(原生 http,几乎零框架)+ SQLite(better-sqlite3,schema v4);桌面 = Tauri 2(Rust sidecar)
- 三应用:`apps/api`(4317)、`apps/web`(3100)、`apps/mcp`(stdio + 兼容 HTTP)

## 2. 仓库地图
```
apps/api/src/      API:server.js(主路由)、import-pipeline、parser-service、retrieval-service、
                   sqlite-store、model-provider(供应商+适配器)、feishu/tencent-*、
                   service-supervisor(起停子服务)、local-cli、secret-store、connector-credentials
apps/web/public/   前端:index.html、main.js、styles.css、js/*(qa-view/settings-view/graph-renderer-force/
                   modal/onboarding/help-view/share-card 等)
apps/desktop/      Tauri 桌面:src-tauri/(main.rs sidecar+updater、tauri.conf.json、Cargo.toml)、
                   stage-runtime.mjs(自包含运行时组装)
docs/              PRD/架构/路线图/DISTRIBUTION.md/USAGE.md/design-archive(早期UI稿)
.github/workflows/release.yml   发版流水线
```

## 3. 跑起来 / 测试 / 构建
```bash
npm install
npm start            # 起 API+Web,开 http://127.0.0.1:3100;npm run stop 停
npm test             # 全量测试(改后端必须保持全绿;当前 29 组)
npm run dev:mcp      # stdio MCP
npm run desktop      # 桌面开发态
npm run desktop:build# 自包含桌面包(先 stage-runtime 再 tauri build)
```
- 数据目录:macOS `~/Library/Application Support/LocalMemoryHub`(真实数据,勿删);可 `LMH_DATA_DIR=` 覆盖。
- 自检无头浏览器:用 `/Applications/Google Chrome.app/.../Google Chrome --headless`(无 puppeteer);改 UI 后**重载截图自验**。

## 4. 约定(重要)
- **改动→`npm test` 全绿→提交→推送**。提交信息结尾带两行 trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 和 `Claude-Session: <url>`。
- 在默认分支可直接提交;**只在用户明确要时才 commit/push**(除非用户已授权自主执行)。
- **绝不提交数据/密钥**:`.env.local`、`.secret-key`、`.tauri-keys/`、`.archive/`、`marketing/`、
  本地数据均已 gitignore。提交前 `git ls-files | grep -iE '\.env|secret|sqlite|\.key'` 自查。
- 推 `.github/workflows/` 需要 gh token 有 `workflow` scope(`gh auth refresh -h github.com -s workflow`)。

## 5. 密钥 / 凭证位置
- 飞书/腾讯凭证:`.env.local`(gitignore),或 UI「导入中心→凭证配置」加密存数据目录。
  腾讯 access_token 约 30 天有效(到 2026-07-23),过期在 docs.qq.com/open 控制台重置后更新。
- **更新签名密钥**:`.tauri-keys/lmh-updater.key`(私钥,gitignore,**务必保管,丢了所有用户无法自动升级**);
  公钥已写入 `tauri.conf.json` 的 `plugins.updater.pubkey`(**不要重新生成**,否则与已安装版本不匹配)。
- GitHub Secrets 已设:`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`(空)。

## 6. 发版步骤(出新版 + 用户自动升级)
1. 确保 `npm test` 全绿。
2. **三处版本号同步**改成新版 `vX.Y.Z`:
   - `apps/desktop/src-tauri/tauri.conf.json` → `"version"`
   - `apps/desktop/src-tauri/Cargo.toml` → `[package] version`
   - `package.json` → `"version"`
3. 提交并推送 main。
4. 打 tag 触发发版:
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin main && git push origin vX.Y.Z
   ```
5. GitHub Actions 在 macos-latest + windows-2022 各自:`npm install` → `node apps/desktop/stage-runtime.mjs`
   (组装自包含运行时)→ tauri-action 构建 + 用签名密钥签名 → **自动发布** Release(`releaseDraft:false`),
   产出:Mac `.dmg`/`.app.tar.gz`、Windows `.msi`/`.exe`,各带 `.sig` + 一份 `latest.json`。
6. 用户端:App 启动后台查 `…/releases/latest/download/latest.json`,版本更高→自动下载安装→重启升级。
   **升级不丢数据**(数据目录独立 + 迁移前自动备份)。
- 查 CI:`gh run list --workflow=release.yml`;失败看 `gh run view <id> --log-failed`。
- 重跑某版:`git tag -d vX.Y.Z; git push origin :refs/tags/vX.Y.Z; git tag vX.Y.Z; git push origin vX.Y.Z`。

## 7. 已知坑 / 注意
- **Windows 必须用 `windows-2022` runner**(windows-latest=2025 上 node-gyp 找不到 VS,better-sqlite3 编译失败)。
- `bundle.targets` 用 `"all"`(`"app"` 仅 macOS,会导致 Windows 找不到产物)。
- 桌面子服务 stdio:**无终端(GUI)时不能用 `inherit`**(Windows 无控制台句柄会崩),已改为写
  `数据目录/logs/{api,web}.log`(开发态有 TTY 仍 inherit)。排查 Windows 起不来就看这俩 log。
- 安装包**未做平台签名**(开源不搞证书):Mac 首次右键→打开;Windows SmartScreen→仍要运行。
- 自包含包体积大(~数百 MB,onnxruntime 占大头);e5 模型首次按需下载。若要瘦身→把"本地向量"做成可选依赖。
- Mac 包目前只出 **aarch64(Apple 芯片)**;Intel 需另加构建。
- 无法在 macOS 验证 Windows 实跑——Windows 相关改动需在真 Windows 上测一次。

## 8. 当前状态(2026-06-24)
- 已发布 v0.0.1 / v0.0.2;Mac+Windows 安装包 + 自动升级链路就绪(latest.json 覆盖双平台)。
- 待办:Windows 首启"拒绝连接"+ 黑图标已修(本次:supervisor 日志化 + 启动重载 + 真图标),需发新版在 Windows 复验;
  Intel Mac 构建;本地向量可选化(瘦身);表格/结构化数据检索增强。
