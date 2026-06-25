import { appendModelCallLog } from "./model-call-log.js";
import { normalizeCitation } from "./retrieval-service.js";

const providers = new Map();

// 统一的系统提示词:让回答有温度、像了解你的私人助手,而不是冷冰冰的检索工具。
const SYSTEM_PROMPT = [
  "你是 Local Memory Hub 的私人记忆助手,在帮用户回顾和利用他自己的本地资料(日记、笔记、文档、聊天记录等)。",
  "语气要像一个了解他、真诚、温暖的朋友:自然口语化的中文,适度共情与鼓励,但不浮夸、不油腻。",
  "严格基于「本地上下文」作答,用到的资料用 [n] 标注来源;上下文不足时坦诚说明,可给力所能及的建议,但绝不编造事实。",
  "先给结论或重点,再按需展开;简洁、有条理,避免空话套话。"
].join("\n");

export function initModelProviders() {
  registerProvider(new MockProviderAdapter());
  registerProvider(new OpenAICompatibleProviderAdapter());
  registerProvider(new AnthropicProviderAdapter());
  registerProvider(new OllamaProviderAdapter());
}

export function registerProvider(provider) {
  providers.set(provider.providerId, provider);
}

export function listProviderTemplates() {
  return [
    providerTemplate("mock", "Mock 本地演示模型", "mock", false, { defaultModel: "mock-memory-chat" }),
    providerTemplate("local_weak", "本地弱向量", "local_embedding", false, {
      defaultModel: "local-weak-bigram-v1",
      embedding: true,
      embeddingDimension: 32
    }),
    providerTemplate("claude_official", "Claude 官方 / Anthropic", "anthropic_compatible", true, {
      defaultBaseUrl: "https://api.anthropic.com",
      defaultModel: "claude-sonnet-4-20250514",
      modelOptions: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"]
    }),
    providerTemplate("openai", "OpenAI 官方", "openai_compatible", true, {
      defaultBaseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4o",
      modelOptions: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3", "o3-mini", "o1"],
      embedding: true,
      defaultEmbeddingModel: "text-embedding-3-small",
      embeddingModelOptions: ["text-embedding-3-small", "text-embedding-3-large"]
    }),
    providerTemplate("deepseek", "DeepSeek", "openai_compatible", true, {
      defaultBaseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-chat",
      // V4(2026-04 起)+ 旧名(deepseek-chat/reasoner 将于 2026-07-24 弃用,届时映射到 v4-flash)
      modelOptions: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"]
    }),
    providerTemplate("dashscope", "通义千问 / DashScope", "openai_compatible", true, {
      defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      defaultModel: "qwen-plus",
      modelOptions: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-long"],
      embedding: true,
      defaultEmbeddingModel: "text-embedding-v3",
      embeddingModelOptions: ["text-embedding-v3", "text-embedding-v2", "text-embedding-v1"]
    }),
    providerTemplate("volcano_ark", "豆包 / Volcano Ark", "openai_compatible", true, {
      defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      defaultModel: "doubao-seed-1-6",
      modelOptions: ["doubao-seed-1-6", "doubao-seed-1-6-thinking", "doubao-1-5-pro-32k"]
    }),
    providerTemplate("qianfan", "百度千帆 / 文心", "custom_or_compatible", true, {
      modelOptions: ["ernie-4.5-turbo-128k", "ernie-4.0-turbo-8k"]
    }),
    providerTemplate("zhipu", "智谱 GLM", "openai_compatible", true, {
      defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
      defaultModel: "glm-4-flash",
      modelOptions: ["glm-4-flash", "glm-4-plus", "glm-4-air"],
      embedding: true,
      defaultEmbeddingModel: "embedding-3",
      embeddingModelOptions: ["embedding-3", "embedding-2"]
    }),
    providerTemplate("moonshot", "Moonshot / Kimi", "openai_compatible", true, {
      defaultBaseUrl: "https://api.moonshot.cn/v1",
      defaultModel: "kimi-latest",
      modelOptions: ["kimi-latest", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"]
    }),
    providerTemplate("minimax", "MiniMax", "openai_compatible", true, {
      defaultBaseUrl: "https://api.minimax.chat/v1",
      modelOptions: ["MiniMax-Text-01", "abab6.5s-chat"]
    }),
    providerTemplate("hunyuan", "腾讯混元", "openai_compatible", true, {
      defaultBaseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
      modelOptions: ["hunyuan-turbo", "hunyuan-large"]
    }),
    providerTemplate("spark", "讯飞星火", "custom_or_compatible", true, {
      modelOptions: ["generalv3.5", "max-32k"]
    }),
    providerTemplate("openrouter", "OpenRouter", "openai_compatible", true, {
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "anthropic/claude-sonnet-4",
      modelOptions: ["anthropic/claude-sonnet-4", "anthropic/claude-opus-4", "openai/gpt-4o", "google/gemini-2.5-pro", "deepseek/deepseek-chat", "meta-llama/llama-3.3-70b-instruct"]
    }),
    providerTemplate("gemini", "Google Gemini", "openai_compatible", true, {
      defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-2.5-flash",
      modelOptions: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
      embedding: true,
      defaultEmbeddingModel: "text-embedding-004",
      embeddingModelOptions: ["text-embedding-004"]
    }),
    providerTemplate("siliconflow", "硅基流动 / SiliconFlow", "openai_compatible", true, {
      defaultBaseUrl: "https://api.siliconflow.cn/v1",
      defaultModel: "deepseek-ai/DeepSeek-V3",
      modelOptions: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct", "moonshotai/Kimi-K2-Instruct"],
      embedding: true,
      defaultEmbeddingModel: "BAAI/bge-m3",
      embeddingModelOptions: ["BAAI/bge-m3", "BAAI/bge-large-zh-v1.5"]
    }),
    providerTemplate("yi", "零一万物 / Yi", "openai_compatible", true, {
      defaultBaseUrl: "https://api.lingyiwanwu.com/v1",
      defaultModel: "yi-lightning",
      modelOptions: ["yi-lightning", "yi-large", "yi-medium"]
    }),
    providerTemplate("grok", "xAI Grok", "openai_compatible", true, {
      defaultBaseUrl: "https://api.x.ai/v1",
      defaultModel: "grok-4",
      modelOptions: ["grok-4", "grok-3", "grok-3-mini"]
    }),
    providerTemplate("groq", "Groq", "openai_compatible", true, {
      defaultBaseUrl: "https://api.groq.com/openai/v1",
      defaultModel: "llama-3.3-70b-versatile",
      modelOptions: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "deepseek-r1-distill-llama-70b"]
    }),
    providerTemplate("openai_compatible", "自定义 OpenAI-Compatible", "openai_compatible", true),
    providerTemplate("anthropic_compatible", "自定义 Anthropic-Compatible", "anthropic_compatible", true),
    providerTemplate("ollama", "Ollama 本地模型", "ollama", false, {
      defaultBaseUrl: "http://127.0.0.1:11434",
      defaultModel: "llama3.1",
      modelOptions: ["llama3.1", "qwen2.5", "deepseek-r1"]
    })
  ];
}

export async function routeChat(request, dataDir) {
  const providerId = request.provider_id || "mock";
  const startedAt = Date.now();
  const provider = providers.get(providerId) || createTemplateProvider(providerId);
  if (!provider) {
    const template = listProviderTemplates().find((item) => item.provider_id === providerId);
    if (template?.requires_key) {
      throw new Error(`${template.display_name} 尚未配置本地 API Key`);
    }
    throw new Error(`未知模型 Provider：${providerId}`);
  }
  try {
    const response = await provider.chat(request, request.config || {});
    await appendModelCallLog(buildLogEntry({ request, response, providerId, startedAt, status: "success" }), dataDir);
    return response;
  } catch (error) {
    await appendModelCallLog(
      buildLogEntry({
        request,
        providerId,
        startedAt,
        status: "failed",
        error: error.message
      }),
      dataDir
    );
    throw error;
  }
}

class MockProviderAdapter {
  providerId = "mock";
  displayName = "Mock 本地演示模型";

  async chat(request) {
    const context = request.context || [];
    const citations = context.slice(0, 3).map((item, index) => normalizeCitation(item, index));
    return {
      provider_id: this.providerId,
      model: "mock-memory-chat",
      answer:
        citations.length === 0
          ? "当前没有检索到足够的本地资料。"
          : `根据本地记忆，找到 ${citations.length} 条相关资料。` +
            citations.map((item) => `\n[${item.index}] ${item.title}`).join(""),
      citations
    };
  }
}

class OpenAICompatibleProviderAdapter {
  constructor(options = {}) {
    this.providerId = options.providerId || "openai_compatible";
    this.displayName = options.displayName || "OpenAI-Compatible";
    this.defaultBaseUrl = options.defaultBaseUrl || null;
    this.defaultModel = options.defaultModel || null;
  }

  async chat(request, config) {
    const baseUrl = config.base_url || this.defaultBaseUrl;
    const model = config.model || this.defaultModel;
    if (!baseUrl || !config.api_key || !model) {
      throw new Error(`${this.displayName} 需要 base_url、api_key 和 model`);
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.api_key}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(request) }
        ]
      })
    });
    if (!res.ok) throw new Error(`模型调用失败：${res.status}`);
    const data = await res.json();
    return {
      provider_id: this.providerId,
      model,
      answer: data.choices?.[0]?.message?.content || "",
      citations: normalizeCitations(request.context || [])
    };
  }
}

// Anthropic 官方/兼容(/v1/messages):system 为顶层字段,鉴权用 x-api-key。
class AnthropicProviderAdapter {
  constructor(options = {}) {
    this.providerId = options.providerId || "anthropic_compatible";
    this.displayName = options.displayName || "Anthropic-Compatible";
    this.defaultBaseUrl = options.defaultBaseUrl || "https://api.anthropic.com";
    this.defaultModel = options.defaultModel || null;
  }

  async chat(request, config) {
    const baseUrl = config.base_url || this.defaultBaseUrl;
    const model = config.model || this.defaultModel;
    if (!baseUrl || !config.api_key || !model) {
      throw new Error(`${this.displayName} 需要 base_url、api_key 和 model`);
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.api_key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPrompt(request) }]
      })
    });
    if (!res.ok) throw new Error(`模型调用失败：${res.status}`);
    const data = await res.json();
    return {
      provider_id: this.providerId,
      model,
      answer: (data.content || []).map((block) => block.text || "").join("") || "",
      citations: normalizeCitations(request.context || [])
    };
  }
}

class OllamaProviderAdapter {
  providerId = "ollama";
  displayName = "Ollama";

  async chat(request, config) {
    const baseUrl = config.base_url || "http://127.0.0.1:11434";
    const model = config.model || "llama3.1";
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: "user", content: buildPrompt(request) }]
      })
    });
    if (!res.ok) throw new Error(`Ollama 调用失败：${res.status}`);
    const data = await res.json();
    return {
      provider_id: this.providerId,
      model,
      answer: data.message?.content || "",
      citations: normalizeCitations(request.context || [])
    };
  }
}

function buildPrompt(request) {
  const context = (request.context || [])
    .map((item, index) => {
      const citation = normalizeCitation(item, index);
      // 父文档召回:有 parent_text(该源全文)就喂全文,否则退回命中片段。
      const body = (item.parent_text && String(item.parent_text).trim()) || citation.snippet;
      return `[${citation.index}] ${citation.title}\n${body}`;
    })
    .join("\n\n");
  const history = (request.history || [])
    .slice(-6)
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${String(message.content || "").slice(0, 800)}`)
    .join("\n");
  return [
    history ? `最近对话：\n${history}` : "",
    `当前问题：${request.question}`,
    `本地上下文：\n${context}`
  ].filter(Boolean).join("\n\n");
}

function normalizeCitations(items) {
  return items.map((item, index) => normalizeCitation(item, index));
}

function createTemplateProvider(providerId) {
  const template = listProviderTemplates().find((item) => item.provider_id === providerId);
  if (!template) return null;
  const common = {
    providerId: template.provider_id,
    displayName: template.display_name,
    defaultBaseUrl: template.default_base_url || null,
    defaultModel: template.default_model || null
  };
  if (template.api_format === "openai_compatible") return new OpenAICompatibleProviderAdapter(common);
  if (template.api_format === "anthropic_compatible") return new AnthropicProviderAdapter(common);
  return null;
}

function buildLogEntry(options) {
  const context = options.request.context || [];
  const answer = options.response?.answer || "";
  return {
    timestamp: new Date().toISOString(),
    provider_id: options.providerId,
    model: options.request.config?.model || options.response?.model || null,
    task: options.request.task || "chat",
    status: options.status,
    duration_ms: Date.now() - options.startedAt,
    question_chars: String(options.request.question || "").length,
    context_count: context.length,
    context_chars: context.reduce((sum, item) => sum + String(item.segment_text || item.extracted_preview || item.title || "").length, 0),
    answer_chars: answer.length,
    error: options.error || null
  };
}

function providerTemplate(providerId, displayName, apiFormat, requiresKey, options = {}) {
  return {
    provider_id: providerId,
    display_name: displayName,
    api_format: apiFormat,
    requires_key: requiresKey,
    default_base_url: options.defaultBaseUrl || "",
    default_model: options.defaultModel || "",
    model_options: options.modelOptions || [],
    supports_embedding: Boolean(options.embedding),
    default_embedding_model: options.defaultEmbeddingModel || options.defaultModel || "",
    embedding_model_options: options.embeddingModelOptions || options.modelOptions || [],
    embedding_dimension: options.embeddingDimension || null
  };
}
