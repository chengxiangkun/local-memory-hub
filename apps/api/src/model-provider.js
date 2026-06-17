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
    { provider_id: "mock", display_name: "Mock 本地演示模型", api_format: "mock", requires_key: false },
    { provider_id: "deepseek", display_name: "DeepSeek", api_format: "openai_compatible", requires_key: true },
    { provider_id: "dashscope", display_name: "通义千问 / DashScope", api_format: "openai_compatible", requires_key: true },
    { provider_id: "volcano_ark", display_name: "豆包 / Volcano Ark", api_format: "openai_compatible", requires_key: true },
    { provider_id: "qianfan", display_name: "百度千帆 / 文心", api_format: "custom_or_compatible", requires_key: true },
    { provider_id: "zhipu", display_name: "智谱 GLM", api_format: "openai_compatible", requires_key: true },
    { provider_id: "moonshot", display_name: "Moonshot / Kimi", api_format: "openai_compatible", requires_key: true },
    { provider_id: "minimax", display_name: "MiniMax", api_format: "openai_compatible", requires_key: true },
    { provider_id: "hunyuan", display_name: "腾讯混元", api_format: "openai_compatible", requires_key: true },
    { provider_id: "spark", display_name: "讯飞星火", api_format: "custom_or_compatible", requires_key: true },
    { provider_id: "openai_compatible", display_name: "自定义 OpenAI-Compatible", api_format: "openai_compatible", requires_key: true },
    { provider_id: "anthropic_compatible", display_name: "自定义 Anthropic-Compatible", api_format: "anthropic_compatible", requires_key: true },
    { provider_id: "ollama", display_name: "Ollama 本地模型", api_format: "ollama", requires_key: false }
  ];
}

export async function routeChat(request) {
  const providerId = request.provider_id || "mock";
  const provider = providers.get(providerId) || providers.get("mock");
  return provider.chat(request, request.config || {});
}

class MockProviderAdapter {
  providerId = "mock";
  displayName = "Mock 本地演示模型";

  async chat(request) {
    const context = request.context || [];
    const citations = context.slice(0, 3).map((item, index) => ({
      index: index + 1,
      source_id: item.source_id,
      title: item.title,
      snippet: item.segment_text || item.extracted_preview || item.title
    }));
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
  providerId = "openai_compatible";
  displayName = "OpenAI-Compatible";

  async chat(request, config) {
    if (!config.base_url || !config.api_key || !config.model) {
      throw new Error("OpenAI-Compatible 需要 base_url、api_key 和 model");
    }
    const res = await fetch(`${config.base_url.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.api_key}`
      },
      body: JSON.stringify({
        model: config.model,
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
      model: config.model,
      answer: data.choices?.[0]?.message?.content || "",
      citations: request.context || []
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
      citations: request.context || []
    };
  }
}

function buildPrompt(request) {
  const context = (request.context || [])
    .map((item, index) => `[${index + 1}] ${item.title}\n${item.segment_text || item.extracted_preview || ""}`)
    .join("\n\n");
  return `问题：${request.question}\n\n本地上下文：\n${context}`;
}
