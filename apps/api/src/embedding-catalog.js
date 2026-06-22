/**
 * 可拔插 embedding 模型目录。
 *
 * 每个条目描述一个可选的 embedding 后端:本地内置兜底、本地 Transformers.js
 * 模型(开源、免费、离线),或云端 OpenAI 兼容接口(需 API Key)。UI 据此渲染
 * 选择卡片与下载/配置引导;后端据此决定如何生成向量。
 *
 * runtime:
 *   - "builtin"      : 进程内规则向量,无需下载(质量弱,仅兜底)。
 *   - "transformers" : 本地 Transformers.js(@huggingface/transformers)跑 ONNX 模型。
 *   - "openai"       : 云端 OpenAI 兼容 /embeddings 接口。
 *
 * requires: "none" | "download" | "api_key"
 */

export const EMBEDDING_CATALOG = [
  {
    id: "local-e5-small",
    name: "Multilingual E5 Small（推荐默认）",
    runtime: "transformers",
    model_ref: "Xenova/multilingual-e5-small",
    dimension: 384,
    size_mb: 470,
    memory_hint: "约 0.5GB 内存",
    languages: "多语言（中英文混合优秀）",
    quality: "好 · 轻量快速",
    requires: "download",
    recommended: true,
    query_prefix: "query: ",
    passage_prefix: "passage: ",
    description: "已验证可在本机离线运行,中英文跨语言检索表现优秀,体积小、速度快,适合作为默认。"
  },
  {
    id: "local-e5-base",
    name: "Multilingual E5 Base",
    runtime: "transformers",
    model_ref: "Xenova/multilingual-e5-base",
    dimension: 768,
    size_mb: 1100,
    memory_hint: "约 1GB 内存",
    languages: "多语言",
    quality: "更好 · 中等体积",
    requires: "download",
    recommended: false,
    query_prefix: "query: ",
    passage_prefix: "passage: ",
    description: "质量高于 small,体积更大,适合追求更好召回且内存充裕时。"
  },
  {
    id: "local-e5-large",
    name: "Multilingual E5 Large",
    runtime: "transformers",
    model_ref: "Xenova/multilingual-e5-large",
    dimension: 1024,
    size_mb: 2200,
    memory_hint: "约 2GB 内存",
    languages: "多语言",
    quality: "很好 · 体积较大",
    requires: "download",
    recommended: false,
    query_prefix: "query: ",
    passage_prefix: "passage: ",
    description: "MTEB 榜单同名模型,质量最佳的本地可选项之一,16GB 机器可跑但下载与推理更重。"
  },
  {
    id: "local-bge-small-zh",
    name: "BGE Small ZH v1.5（中文向）",
    runtime: "transformers",
    model_ref: "Xenova/bge-small-zh-v1.5",
    dimension: 512,
    size_mb: 200,
    memory_hint: "约 0.3GB 内存",
    languages: "中文为主",
    quality: "好 · 极轻量",
    requires: "download",
    recommended: false,
    query_prefix: "为这个句子生成表示以用于检索相关文章：",
    passage_prefix: "",
    description: "智源 BGE 中文小模型,体积极小,中文检索友好;英文场景一般。"
  },
  {
    id: "cloud-dashscope",
    name: "阿里云 DashScope（通义 text-embedding-v3）",
    runtime: "openai",
    model_ref: "text-embedding-v3",
    dimension: 1024,
    size_mb: 0,
    memory_hint: "云端,无本地占用",
    languages: "多语言",
    quality: "很好 · 生产级",
    requires: "api_key",
    recommended: false,
    default_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    description: "阿里云通义 embedding,有免费额度,质量好、无本地下载;需要注册并配置 API Key。"
  },
  {
    id: "cloud-zhipu",
    name: "智谱 AI（embedding-3）",
    runtime: "openai",
    model_ref: "embedding-3",
    dimension: 1024,
    size_mb: 0,
    memory_hint: "云端,无本地占用",
    languages: "多语言",
    quality: "很好 · 生产级",
    requires: "api_key",
    recommended: false,
    default_base_url: "https://open.bigmodel.cn/api/paas/v4",
    description: "智谱 embedding-3,有免费额度;需要注册并配置 API Key。"
  },
  {
    id: "cloud-openai-compatible",
    name: "自定义 OpenAI 兼容接口",
    runtime: "openai",
    model_ref: "",
    dimension: 0,
    size_mb: 0,
    memory_hint: "取决于服务",
    languages: "取决于模型",
    quality: "取决于服务",
    requires: "api_key",
    recommended: false,
    default_base_url: "",
    description: "任意兼容 OpenAI /embeddings 的服务(本地 Ollama、vLLM 或其他云端),可自定义 base_url、模型名与 Key。"
  },
  {
    id: "local_weak",
    name: "本地弱向量（兜底,无需下载）",
    runtime: "builtin",
    model_ref: "local-weak-bigram-v1",
    dimension: 32,
    size_mb: 0,
    memory_hint: "几乎无占用",
    languages: "有限",
    quality: "弱 · 仅兜底",
    requires: "none",
    recommended: false,
    description: "进程内规则向量,无需任何下载或 Key。质量弱,不适合严肃语义检索,仅作为兜底。"
  }
];

export function getCatalogEntry(id) {
  return EMBEDDING_CATALOG.find((item) => item.id === id) || null;
}

export function recommendedEntry() {
  return EMBEDDING_CATALOG.find((item) => item.recommended) || EMBEDDING_CATALOG[0];
}
