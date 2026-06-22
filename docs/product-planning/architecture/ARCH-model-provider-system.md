# 模型供应商与大模型调用架构设计

## 1. 目标

模型调用系统负责统一管理外部大模型、本地模型和自定义兼容接口。

它必须支持：

- 主流模型供应商。
- 用户自行配置 API Key。
- 自定义 Base URL。
- OpenAI-Compatible 接口。
- Anthropic-Compatible 接口。
- 本地模型，如 Ollama、LM Studio、vLLM。
- 不同任务选择不同模型。
- 成本、隐私和调用日志可见。
- 供应商变更时不影响业务代码。

## 2. 设计原则

### 2.1 业务代码不直接调用具体供应商

错误做法：

```text
解析失败 -> 直接调用 OpenAI
```

正确做法：

```text
解析失败 -> ModelRouter -> ProviderAdapter -> 具体模型
```

### 2.2 Provider 和 Model 分离

Provider 是供应商或接口类型。

Model 是具体模型。

例如：

```text
Provider: OpenAI
Model: gpt-5.5 / gpt-5.4-mini

Provider: Anthropic
Model: Claude 系列

Provider: DeepSeek
Model: deepseek-v4-flash 等

Provider: OpenAI-Compatible
Model: 用户自定义
```

### 2.3 任务和模型分离

用户不应该每次都手动选模型。系统应支持按任务配置默认模型。

任务类型：

- 文本问答
- 深度推理
- 文档解析兜底
- 摘要
- 标签生成
- 图谱关系推断
- 查询改写
- embedding
- rerank
- OCR 兜底
- 多模态理解

## 3. V1 需要支持的供应商

### 3.1 国际主流

- OpenAI
- Anthropic Claude
- Google Gemini

### 3.2 国内主流

- DeepSeek
- 阿里通义千问 / DashScope
- 字节豆包 / Volcano Ark
- 百度千帆 / 文心
- 智谱 GLM
- Moonshot / Kimi
- MiniMax
- 腾讯混元
- 讯飞星火
- 零一万物

### 3.3 本地模型

- Ollama
- LM Studio
- vLLM
- llama.cpp server

### 3.4 自定义兼容接口

必须支持：

- OpenAI-Compatible
- Anthropic-Compatible
- 自定义 HTTP Provider，后续可做

这点非常重要。模型市场变化很快，不应该每新增一家供应商就改核心代码。

## 4. ProviderAdapter 接口

```ts
interface ModelProviderAdapter {
  providerId: string;
  displayName: string;

  listModels(config: ProviderConfig): Promise<ModelInfo[]>;

  chat(request: ChatRequest, config: ProviderConfig): Promise<ChatResponse>;

  streamChat?(request: ChatRequest, config: ProviderConfig): AsyncIterable<ChatChunk>;

  embed?(request: EmbeddingRequest, config: ProviderConfig): Promise<EmbeddingResponse>;

  rerank?(request: RerankRequest, config: ProviderConfig): Promise<RerankResponse>;

  validateConfig(config: ProviderConfig): Promise<ProviderValidationResult>;
}
```

V1 必须实现：

```text
OpenAIProviderAdapter
AnthropicProviderAdapter
GeminiProviderAdapter
DeepSeekProviderAdapter 或 OpenAI-Compatible 配置模板
DashScopeProviderAdapter 或 OpenAI-Compatible 配置模板
VolcanoArkProviderAdapter 或 OpenAI-Compatible 配置模板
QianfanProviderAdapter 或兼容配置模板
ZhipuProviderAdapter 或兼容配置模板
MoonshotProviderAdapter 或 OpenAI-Compatible 配置模板
OpenAICompatibleProviderAdapter
AnthropicCompatibleProviderAdapter
OllamaProviderAdapter
```

国内供应商可以优先通过 OpenAI-Compatible 接入；如果某家能力差异明显，再单独做 adapter。

V1 设置页必须提供国产主流模型的预设模板，至少包括：

- DeepSeek
- 通义千问 / DashScope
- 豆包 / Volcano Ark
- 百度千帆 / 文心
- 智谱 GLM
- Moonshot / Kimi
- MiniMax
- 腾讯混元
- 讯飞星火

## 5. 配置模型

### 5.1 ProviderConfig

```json
{
  "provider_id": "openai",
  "display_name": "OpenAI",
  "base_url": "https://api.openai.com/v1",
  "api_key_ref": "secret_ref",
  "api_format": "openai_responses | openai_chat | anthropic_messages | gemini | ollama",
  "enabled": true,
  "timeout_ms": 60000,
  "proxy": null
}
```

### 5.2 ModelConfig

```json
{
  "model_id": "uuid",
  "provider_id": "openai",
  "model_name": "gpt-5.5",
  "display_name": "GPT-5.5",
  "capabilities": {
    "text": true,
    "vision": true,
    "audio": false,
    "embedding": false,
    "rerank": false,
    "json_schema": true,
    "tool_calling": true,
    "streaming": true
  },
  "context_window": 1000000,
  "cost_profile": "high | medium | low | local",
  "privacy_profile": "external | local",
  "enabled": true
}
```

### 5.3 TaskModelPolicy

```json
{
  "task": "parse_fallback",
  "preferred_model_id": "uuid",
  "fallback_model_ids": ["uuid", "uuid"],
  "allow_external": true,
  "max_input_tokens": 120000,
  "mode": "save_tokens | balanced | deep"
}
```

## 6. ModelRouter

`ModelRouter` 负责根据任务选择模型。

输入：

- 任务类型
- 用户模式
- 内容大小
- 隐私级别
- 模型能力
- 成本策略
- 可用供应商

输出：

- 选中的 provider
- 选中的 model
- fallback 顺序
- 是否允许外部调用

## 7. 当前 Spike 落地状态

已完成：

- Provider 模板包含 DeepSeek、通义千问、豆包、智谱、Kimi、MiniMax、腾讯混元等。
- OpenAI-Compatible 模板可通过通用 Adapter 调用，不再只是 UI 展示项。
- 模型调用日志写入本地数据目录 `logs/model-calls.log`。
- 日志不记录 API Key。
- 成功和失败调用都会记录。

当前仍未完成：

- API Key 加密持久化。
- 任务模型策略持久化。
- Anthropic-Compatible、Gemini、百度千帆、讯飞星火等特殊协议真实验证。
- 精确 token 统计和成本估算。

详细结论见：

```text
docs/SPIKE-RESULTS-019.md
```

示例：

```text
任务：文档解析兜底
隐私：普通
模式：平衡
优先：本地小模型
失败：DeepSeek / OpenAI-Compatible
深度：Claude / OpenAI / Gemini
```

## 7. 隐私和成本控制

调用外部模型前必须记录：

- 使用的供应商
- 使用的模型
- 调用任务
- 来源资料
- 发送内容大小
- 是否包含源文件正文
- 是否包含图片或视频帧
- 调用时间
- 成功或失败
- token 估算或实际 token

UI 需要支持三种模式：

- 省 token：尽量本地，只在用户确认时调用外部模型。
- 平衡：本地失败或低置信度时调用外部模型。
- 深度：更多使用外部模型做结构化、摘要和图谱。

## 8. 无模型兜底

用户未配置模型时，系统不能不可用。

必须保留：

- 源文件搜索
- 全文搜索
- 向量搜索，如果 embedding 已存在或使用本地 embedding
- 图谱搜索
- 命中片段展示
- 来源追溯

问答页面应提示：

```text
当前未启用大模型，已为你展示最相关的搜索结果。配置模型后可生成总结答案。
```

## 9. 设置页设计

模型设置页应包含：

- 供应商列表
- 添加供应商
- 添加自定义 endpoint
- API Key 本地加密保存
- 测试连接
- 拉取模型列表
- 选择默认问答模型
- 选择默认解析兜底模型
- 选择默认 embedding 模型
- 选择默认图谱推断模型
- 设置省 token / 平衡 / 深度模式
- 查看调用日志

## 10. 反模式

必须避免：

- 在业务代码里写死某个模型名。
- 在解析器里直接调用某个供应商 SDK。
- 把 API Key 明文存数据库。
- 外部模型调用没有日志。
- 没有大模型时问答页面直接不可用。
- 每个供应商各写一套业务流程。
- 不支持自定义 Base URL。

## 11. 当前 Spike 落地状态

已完成：

- OpenAI-Compatible 模板可通过通用 Adapter 调用。
- 模型调用日志写入本地数据目录。
- Provider 配置可保存到本地数据目录。
- 设置页可展示并保存 Provider 配置。
- 任务模型策略可保存到本地数据目录。
- 问答和解析兜底可读取任务模型策略。

当前限制：

- API Key 当前仅使用本地文件和 `600` 权限隔离，正式版本仍需接入系统密钥存储或加密文件。
- 当前任务模型策略只支持单 Provider，不支持 fallback 队列。
- 真实外部模型连通性测试还未做。

详细结论：

```text
docs/SPIKE-RESULTS-019.md
docs/SPIKE-RESULTS-020.md
docs/SPIKE-RESULTS-021.md
```
