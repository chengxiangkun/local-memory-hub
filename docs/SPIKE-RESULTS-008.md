# Spike Results 008：模型 Provider 抽象 + Mock 问答

## 结论

第八批 Spike 已通过。

已验证：

- `ModelRouter -> ProviderAdapter` 的最小调用链路。
- Mock Provider 可在无 API Key 情况下生成回答。
- 问答接口可基于本地资料生成带引用结果。
- Provider 模板包含 DeepSeek、通义千问和国产主流模型。
- 支持 OpenAI-Compatible、Anthropic-Compatible、Ollama 的适配结构。

## 新增接口

### 模型供应商模板

```http
GET /api/models/providers
```

包含：

- DeepSeek
- 通义千问 / DashScope
- 豆包 / Volcano Ark
- 百度千帆 / 文心
- 智谱 GLM
- Moonshot / Kimi
- MiniMax
- 腾讯混元
- 讯飞星火
- 自定义 OpenAI-Compatible
- 自定义 Anthropic-Compatible
- Ollama

### 本地问答

```http
POST /api/ask
```

Mock 请求：

```json
{
  "provider_id": "mock",
  "question": "DeepSeek 和通义千问是否支持？"
}
```

## Smoke Test 结果

```text
Model smoke test passed
{
  "provider_count": 13,
  "citations": 1
}
```

## 当前限制

- Mock Provider 只是验证链路，不是真模型能力。
- OpenAI-Compatible 和 Ollama adapter 已写结构，但未用真实 key/本地模型验证。
- 检索为空时暂时 fallback 到最近资料。
- 还没有任务模型策略持久化。

## 下一步建议

1. 增加解析失败时的 Mock LLM 兜底。
2. 保存 LLM 兜底结果。
3. 保存 parser improvement artifact。
4. 验证失败样本可通过 Mock Provider 进入记忆。

