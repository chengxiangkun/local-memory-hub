import { appendModelCallLog } from "./model-call-log.js";
import { normalizeCitation } from "./retrieval-service.js";

const providers = new Map();

export function initModelProviders() {
  registerProvider(new MockProviderAdapter());
  registerProvider(new OpenAICompatibleProviderAdapter());
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
    providerTemplate("deepseek", "DeepSeek", "openai_compatible", true, {
      defaultBaseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-chat",
      modelOptions: ["deepseek-chat", "deepseek-reasoner"]
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
          { role: "system", content: "你是 Local Memory Hub 的问答模型。回答必须基于提供的上下文。" },
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
      return `[${citation.index}] ${citation.title}\n${citation.snippet}`;
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
  if (template?.api_format !== "openai_compatible") return null;
  return new OpenAICompatibleProviderAdapter({
    providerId: template.provider_id,
    displayName: template.display_name,
    defaultBaseUrl: template.default_base_url || null,
    defaultModel: template.default_model || null
  });
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
