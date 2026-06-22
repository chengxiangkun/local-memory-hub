# Spike Results 019：模型 Provider 别名调用与调用日志

## 结论

S9/S10 的模型调用基础链路已补强。

已验证：

- DeepSeek 等 OpenAI-Compatible 供应商模板不只是展示项，也可以通过通用适配器调用。
- 模型调用会写入本地 JSONL 日志。
- 成功调用和失败调用都会记录。
- 日志不会记录 API Key。
- 解析兜底、媒体兜底继续可用。

## 已实现内容

新增：

```text
apps/api/src/model-call-log.js
apps/api/src/model-provider-unit-test.js
```

更新：

```text
apps/api/src/model-provider.js
apps/api/src/parser-service.js
apps/api/src/server.js
```

新增命令：

```bash
npm run test:model-provider
```

## 日志位置

模型调用日志写入用户数据目录：

```text
logs/model-calls.log
```

每行一条 JSON。

记录字段包括：

- provider_id
- model
- task
- status
- duration_ms
- question_chars
- context_count
- context_chars
- answer_chars
- error

不会记录：

- api_key
- 完整请求配置
- 完整 prompt
- 完整回答内容

## OpenAI-Compatible 别名策略

以下 Provider 模板可复用通用 OpenAI-Compatible Adapter：

- DeepSeek
- 通义千问 / DashScope
- 豆包 / Volcano Ark
- 智谱 GLM
- Moonshot / Kimi
- MiniMax
- 腾讯混元
- 自定义 OpenAI-Compatible

用户仍需配置：

- api_key
- model

部分供应商有默认 `base_url`，用户也可以覆盖。

## 验证结果

```text
npm run test:model-provider
Model provider unit test passed
```

回归通过：

```text
npm run test:parser
npm run test:media
```

## 当前限制

- 没有真实调用外部模型，只使用本地假 OpenAI-Compatible HTTP 服务验证协议。
- API Key 还没有加密持久化。
- 还没有任务模型策略持久化。
- 还没有 token 精确统计，只记录字符数用于早期成本观察。
- Anthropic-Compatible、Gemini、百度千帆、讯飞星火等特殊协议尚未单独验证。

## 下一步

继续补：

- 本地 Provider 配置保存，API Key 加密或至少本地隔离。
- 设置页模型配置与问答页模型选择联动。
- 任务模型策略：问答、解析兜底、摘要、图谱推断分别选择模型。
- 模型调用失败后的 fallback 顺序。
