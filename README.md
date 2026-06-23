# Local Memory Hub

**本地优先的个人 AI 记忆层。** 把你散落各处的资料(文本、文件、网页、飞书/腾讯文档…)统一导入,本地解析成可搜索、可追溯、可治理的「记忆」,再通过图谱、问答,以及 MCP 让 Codex / Claude / Cursor 等外部 AI 调用——数据全程留在本机。

> 核心理念:**源资料是你存的,记忆是 AI 能用的**。一条资料只有"进入记忆"(生成文本片段 + 向量索引 + 图谱节点)后,才会被搜索命中、被问答引用、在图谱中出现。

## 特性

- 🗂️ **统一导入管线**:文本 / 文件 / 链接 / 外部文档走同一条流水线,先存源资料再解析。
- 🧠 **本地优先解析 + 大模型兜底**:省 token / 平衡 / 深度三档,本地失败再调模型。
- 🔎 **向量 + 图谱联合检索**:语义召回 + 一跳扩展,问答**带可点击 `[n]` 引用**,可追溯回源文件。
- 🕸️ **力导向知识图谱**:关系 / 社区 / 向量 / 时间四种视图,支持导出快照。
- 🧹 **污染治理**:标记 / 隔离 / 恢复 / 删除,治理审计日志,被隔离内容不进检索与问答。
- 🔌 **可拔插 embedding**:默认本地 `multilingual-e5-small`(免费离线),也可换 e5-base/large、BGE、或云端接口。
- 🤝 **外部文档接入**:飞书、腾讯文档(增量 / 修改 / 删除轮询同步),凭证可在界面加密配置。
- 🛰️ **外部 AI 调用(MCP)**:标准 stdio MCP 暴露 `memory.search / get_context / ask / graph.search`,逐工具开关 + 调用审计。
- 🎨 **深色 / 亮色双主题**,问答回答 Markdown 渲染。
- 🔒 **本地与隐私**:数据存本机,API Key / 连接器凭证 AES-256-GCM 加密落盘,绝不进 Git。

## 快速开始(npm)

需要 Node.js(建议 18+)。

```bash
npm install
npm start
```

默认地址:

```text
Web: http://127.0.0.1:3100
API: http://127.0.0.1:4317
```

停止:`npm run stop`。

> 首次打开是空的:进「图谱」点 **导入示例文本**,或在「导入中心」粘贴一段文本,即可看到它进入记忆、出现在图谱并可被问答检索。

## 桌面应用(macOS,未签名)

开源 / 本机使用**无需 Apple 开发者证书**:

```bash
npm run desktop        # 开发态
npm run desktop:build  # 打包未签名 .app(双击即用,首次右键→打开绕过 Gatekeeper)
```

产物:`apps/desktop/src-tauri/target/release/bundle/macos/`。详见 `apps/desktop/README.md`。

> 说明:当前 `.app` 仍依赖本机的本仓库与 node;跨机器分发(自包含安装器、Windows 包)是后续工程。

## 数据与隐私

- 默认数据目录:
  - macOS:`~/Library/Application Support/LocalMemoryHub`
  - 其它:`./.local-memory-data`
- 可用 `LMH_DATA_DIR=/path npm start` 覆盖。
- 源资料、记忆、向量、图谱、配置、加密凭证都存在该目录,升级保留。
- `.env.local`、`.secret-key`、`.local-memory-data/`、加密凭证均已 `.gitignore`,**不会进入 Git**。

## 模型配置

设置中心 →「模型 Provider」内置 ~20 家供应商(DeepSeek、Claude 官方、OpenAI、通义千问、智谱、Kimi、豆包、OpenRouter、Gemini、硅基流动、Grok、Groq 等)。填 Base URL / 模型 / API Key 即可;模型名是可输入下拉,列出常见模型也支持自定义。问答默认选**已配置的模型**并记住你上次的选择。

也可在 `.env.local` 配置(示例见 `.env.example`)。

## 外部文档接入

「导入中心 → 外部文档」连接飞书 / 腾讯文档。App 凭证可在卡片的 **「凭证配置」** 里加密填写(无需手改 `.env.local`、保存即生效),也可仍用 `.env.local`。支持增量 / 修改 / 删除轮询同步,已做节流 + 未变跳过以省调用额度。

## 外部 AI 调用(MCP)

```bash
npm run dev:mcp   # stdio MCP server: apps/mcp/src/mcp-stdio.js
```

在 Claude Desktop / Cursor 的 MCP 配置里指向 `apps/mcp/src/mcp-stdio.js`(设置页有可复制的接入示例)。隔离 / 删除的内容不会外泄;每次调用有审计记录。

## 目录结构

```text
apps/api/    本地 API:导入、解析、记忆、图谱、向量、模型 Provider、连接器
apps/web/    Web UI(图谱首页、源资料库、问答、治理、导入、设置)
apps/mcp/    MCP(stdio + 兼容 HTTP)
apps/desktop/ Tauri 桌面壳(生产态 sidecar)
docs/        PRD、架构、路线图、集成与验证记录
```

## 测试

```bash
npm test    # 全量测试组
```

## 路线图

V1 主项(导入 / 解析 / 记忆 / 图谱 / 问答 / 治理 / 飞书+腾讯接入 / MCP / 桌面 .app)已完成。后续:完整首启向导、跨机分发(Windows / 自包含安装器)、社交分享产物。详见 `docs/product-planning/`。

## 许可

开源项目(许可证待定)。
