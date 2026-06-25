/**
 * Search and Q&A view.
 *
 * Handles local fallback Q&A rendering and task-level model selection.
 */

import { get, post } from "./api.js";
import { escapeHtml } from "./utils.js";

const conversation = [];
const SESSION_STORAGE_KEY = "local-memory-hub.qa-session-id";
const QA_MODEL_STORAGE_KEY = "local-memory-hub.qa-model";
let currentSessionId = window.localStorage.getItem(SESSION_STORAGE_KEY) || "";

// 当前问答视图右侧引用面板的容器，供答案中可点击 [n] 引用回填使用。
let activeContextList = null;

// 引用追溯所需的宿主回调，由 main.js 在初始化时注入一次。
// onOpenSource(sourceId)：在源资料库定位并打开该资料。
// resolveSourceMeta(sourceId)：返回 { status, label, exists }，用于展示引用的实时源状态。
// onQuarantine(sourceId)：标记该源资料为污染。
const citationContext = {
  onOpenSource: null,
  resolveSourceMeta: null,
  onQuarantine: null
};

export function configureQaCitations(handlers = {}) {
  Object.assign(citationContext, handlers);
}

export async function loadQaSession({ answerBox, contextList } = {}) {
  if (contextList) activeContextList = contextList;
  const data = await get(`/api/qa/session${currentSessionId ? `?session_id=${encodeURIComponent(currentSessionId)}` : ""}`);
  currentSessionId = data.session?.session_id || currentSessionId;
  if (currentSessionId) window.localStorage.setItem(SESSION_STORAGE_KEY, currentSessionId);
  conversation.splice(0, conversation.length, ...(data.messages || []).map(toChatMessage));
  if (answerBox) renderConversation(answerBox);
  renderLatestCitations(contextList);
  return data.session;
}

export function getCurrentSessionId() {
  return currentSessionId;
}

export async function loadQaSessions() {
  const data = await get("/api/qa/sessions");
  return data.sessions || [];
}

export async function switchQaSession(sessionId, { answerBox, contextList } = {}) {
  currentSessionId = sessionId || "";
  if (currentSessionId) window.localStorage.setItem(SESSION_STORAGE_KEY, currentSessionId);
  return loadQaSession({ answerBox, contextList });
}

export async function createQaSession({ answerBox, contextList } = {}) {
  const data = await post("/api/qa/session/new", {});
  currentSessionId = data.session?.session_id || "";
  if (currentSessionId) window.localStorage.setItem(SESSION_STORAGE_KEY, currentSessionId);
  conversation.splice(0, conversation.length);
  if (answerBox) renderConversation(answerBox);
  if (contextList) contextList.innerHTML = "";
  return data.session;
}

export async function renameQaSession(sessionId, title) {
  const data = await post("/api/qa/session/rename", { session_id: sessionId, title });
  return data.session;
}

export async function deleteQaSession(sessionId) {
  await post("/api/qa/session/delete", { session_id: sessionId });
  if (sessionId === currentSessionId) {
    currentSessionId = "";
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    conversation.splice(0, conversation.length);
  }
}

export function renderQaModelOptions(providerPicker, providers) {
  if (!providerPicker) return;
  // 选择优先级:上次手动选择(持久化)→ 已配置的真实模型 → mock → 第一个。
  // 注意:不用 dataset.value 作为来源——HTML 初值写死 "mock" 会盖掉持久化与"默认选已配置"。
  const stored = window.localStorage.getItem(QA_MODEL_STORAGE_KEY) || "";
  const firstConfigured =
    providers.find((provider) => provider.provider_id !== "mock" && provider.requires_key && provider.configured) ||
    providers.find((provider) => provider.provider_id !== "mock" && provider.configured);
  const selectedProvider =
    providers.find((provider) => provider.provider_id === stored) ||
    firstConfigured ||
    providers.find((provider) => provider.provider_id === "mock") ||
    providers[0];
  if (!selectedProvider) return;

  providerPicker.dataset.value = selectedProvider.provider_id;
  providerPicker.innerHTML = `
    <button class="model-picker-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span>${formatProviderLabel(selectedProvider)}</span>
      <i aria-hidden="true"></i>
    </button>
    <div class="model-picker-menu" role="listbox">
      ${providers.map((provider) => `
        <button
          class="${provider.provider_id === selectedProvider.provider_id ? "active" : ""}"
          type="button"
          role="option"
          aria-selected="${provider.provider_id === selectedProvider.provider_id}"
          data-provider-id="${escapeHtml(provider.provider_id)}"
        >
          <strong>${escapeHtml(provider.display_name)}</strong>
          <span>${formatProviderStatus(provider)}</span>
        </button>
      `).join("")}
    </div>
  `;

  const trigger = providerPicker.querySelector(".model-picker-trigger");
  const menu = providerPicker.querySelector(".model-picker-menu");
  trigger.addEventListener("click", () => {
    const isOpen = providerPicker.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(isOpen));
  });
  menu.querySelectorAll("[data-provider-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const provider = providers.find((item) => item.provider_id === button.dataset.providerId);
      if (!provider) return;
      providerPicker.dataset.value = provider.provider_id;
      // 记住用户手动选择,下次默认沿用。
      window.localStorage.setItem(QA_MODEL_STORAGE_KEY, provider.provider_id);
      trigger.querySelector("span").textContent = formatProviderLabel(provider);
      menu.querySelectorAll("[data-provider-id]").forEach((item) => {
        const isActive = item.dataset.providerId === provider.provider_id;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });
      providerPicker.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    });
  });
}

export async function askQuestion({ questionInput, answerBox, contextList, providerSelect, persistMemoryInput, onQuarantineCitation }) {
  const question = questionInput.value.trim();
  if (!question) return;

  if (contextList) activeContextList = contextList;
  if (onQuarantineCitation) citationContext.onQuarantine = onQuarantineCitation;

  const providerId = providerSelect?.dataset.value || "mock";
  const userMessage = {
    role: "user",
    content: question,
    created_at: new Date().toISOString()
  };
  const pendingMessage = {
    role: "assistant",
    model: "检索中",
    content: "正在搜索本地资料并生成回答。",
    pending: true,
    created_at: new Date().toISOString()
  };
  conversation.push(userMessage, pendingMessage);
  renderConversation(answerBox);
  questionInput.value = "";
  questionInput.focus();

  try {
    const data = await post("/api/ask", {
      session_id: currentSessionId,
      question,
      provider_id: providerId,
      persist_memory: persistMemoryInput?.checked !== false
    });
    currentSessionId = data.session?.session_id || currentSessionId;
    if (currentSessionId) window.localStorage.setItem(SESSION_STORAGE_KEY, currentSessionId);
    const memoryStatus = data.conversation_memory?.status === "persisted"
      ? `本次对话已入记忆，源资料 ID：${data.conversation_memory.source_id}`
      : formatConversationMemoryStatus(data.conversation_memory);
    Object.assign(pendingMessage, {
      model: data.model || "本地兜底模式",
      content: data.answer || "没有生成回答。",
      memory_status: memoryStatus,
      citation_count: (data.citations || []).length,
      citations: data.citations || [],
      message_id: data.message_id || "",
      question,
      pending: false
    });
    renderConversation(answerBox);
    renderCitations(contextList, data.citations || []);
  } catch (error) {
    Object.assign(pendingMessage, {
      model: "问答失败",
      content: error.message,
      error: true,
      pending: false
    });
    renderConversation(answerBox);
  }
}

askQuestion.clear = async function clearConversation({ answerBox, contextList, questionInput }) {
  if (currentSessionId) await post("/api/qa/session/clear", { session_id: currentSessionId });
  conversation.splice(0, conversation.length);
  if (answerBox) {
    answerBox.innerHTML = `
      <div class="chat-empty">
        <strong>开始一次资料对话</strong>
        <p>输入问题后，系统会先检索本地资料，再生成带引用的回答。</p>
      </div>
    `;
  }
  if (contextList) contextList.innerHTML = "";
  if (questionInput) questionInput.value = "";
};

function toChatMessage(message) {
  const citations = message.citations || [];
  return {
    role: message.role,
    model: message.role === "user" ? "" : message.model || "AI",
    content: message.content || "",
    memory_status: message.memory_status || "",
    citation_count: citations.length,
    citations,
    created_at: message.created_at
  };
}

function renderLatestCitations(contextList) {
  if (!contextList) return;
  const latestAssistant = [...conversation].reverse().find((message) => message.role === "assistant" && message.citations?.length);
  renderCitations(contextList, latestAssistant?.citations || []);
}

function renderConversation(answerBox) {
  if (conversation.length === 0) {
    answerBox.innerHTML = `
      <div class="chat-empty">
        <strong>开始一次资料对话</strong>
        <p>输入问题后，系统会先检索本地资料，再生成带引用的回答。</p>
      </div>
    `;
    return;
  }
  answerBox.innerHTML = conversation.map((message, messageIndex) => `
    <article class="chat-message ${message.role} ${message.pending ? "pending" : ""} ${message.error ? "error" : ""}">
      <div class="chat-message-meta">
        <strong>${escapeHtml(message.role === "user" ? "你" : message.model || "AI")}</strong>
        ${message.citation_count !== undefined ? `<span>${message.citation_count} 条引用</span>` : ""}
      </div>
      <div class="chat-body">${renderMessageContent(message, messageIndex)}</div>
      ${message.memory_status ? `<span class="status-badge ok">${escapeHtml(message.memory_status)}</span>` : ""}
      ${message.role === "assistant" && message.message_id && !message.pending && !message.error ? renderFeedbackBar(message, messageIndex) : ""}
    </article>
  `).join("");

  // 点击答案中的 [n] 引用：把该轮自己的引用回填到右侧面板并高亮对应项。
  answerBox.querySelectorAll(".citation-ref").forEach((button) => {
    button.addEventListener("click", () => {
      const message = conversation[Number(button.dataset.msg)];
      if (!message) return;
      renderCitations(activeContextList, message.citations || []);
      highlightCitation(Number(button.dataset.cite));
    });
  });

  // 反馈闭环:👍/👎 + 点踩理由 → POST /api/qa/feedback(积累 Bad Case)。
  answerBox.querySelectorAll(".qa-feedback").forEach((bar) => {
    const message = conversation[Number(bar.dataset.fbMsg)];
    if (!message) return;
    const reasonBox = bar.querySelector("[data-fb-reason]");
    const submitFeedback = async (rating, reasonText) => {
      try {
        await post("/api/qa/feedback", {
          message_id: message.message_id,
          session_id: currentSessionId,
          rating,
          reason_text: reasonText || "",
          question: message.question || "",
          answer: message.content || ""
        });
        message.feedback = rating === "up" ? "thumbs_up" : "thumbs_down";
        renderConversation(answerBox);
      } catch {
        /* 反馈失败静默,不打断对话 */
      }
    };
    bar.querySelector('[data-fb="up"]')?.addEventListener("click", () => submitFeedback("up", ""));
    bar.querySelector('[data-fb="down"]')?.addEventListener("click", () => reasonBox?.classList.remove("hidden"));
    bar.querySelector("[data-fb-submit]")?.addEventListener("click", () => {
      const value = bar.querySelector("[data-fb-reason-input]")?.value || "";
      submitFeedback("down", value);
    });
  });

  answerBox.scrollTop = answerBox.scrollHeight;
}

function renderFeedbackBar(message, messageIndex) {
  const rated = message.feedback;
  if (rated) {
    return `<div class="qa-feedback"><span class="qa-fb-done">${rated === "thumbs_down" ? "已反馈 👎 谢谢,会用于改进" : "已反馈 👍"}</span></div>`;
  }
  return `
    <div class="qa-feedback" data-fb-msg="${messageIndex}">
      <span class="qa-fb-label">这条有用吗?</span>
      <button class="qa-fb-btn" type="button" data-fb="up">👍</button>
      <button class="qa-fb-btn" type="button" data-fb="down">👎</button>
      <span class="qa-fb-reason hidden" data-fb-reason>
        <input type="text" class="qa-fb-input" placeholder="哪里不对?(可选)" data-fb-reason-input />
        <button class="ghost-button" type="button" data-fb-submit>提交</button>
      </span>
    </div>`;
}

function renderMessageContent(message, messageIndex) {
  // 用户消息保持纯文本;助手回答按 markdown 渲染(加粗/斜体/列表/标题/代码),并保留可点 [n] 引用。
  if (message.role !== "assistant") {
    return escapeHtml(message.content || "").replaceAll("\n", "<br />");
  }
  let html = renderMarkdown(message.content || "");
  const citations = message.citations || [];
  if (citations.length > 0) {
    const validIndexes = new Set(
      citations.map((item, index) => (Number.isFinite(Number(item.index)) ? Number(item.index) : index + 1))
    );
    html = html.replace(/\[(\d+)\]/g, (match, num) => {
      const citationIndex = Number(num);
      if (!validIndexes.has(citationIndex)) return match;
      return `<button class="citation-ref" type="button" data-msg="${messageIndex}" data-cite="${citationIndex}">[${citationIndex}]</button>`;
    });
  }
  return html;
}

// 轻量 markdown -> HTML(先转义防注入,再套自有标签)。够覆盖聊天回答常见语法。
export function renderMarkdown(raw) {
  const lines = escapeHtml(raw || "").split("\n");
  const out = [];
  let listType = null;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const ulItem = line.match(/^\s*[-*]\s+(.*)$/);
    const olItem = line.match(/^\s*\d+\.\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length <= 2 ? 4 : 5;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (ulItem) {
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${renderInline(ulItem[1])}</li>`);
    } else if (olItem) {
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${renderInline(olItem[1])}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${renderInline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

function renderInline(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
}

function highlightCitation(citationIndex) {
  if (!activeContextList) return;
  const target = activeContextList.querySelector(`[data-citation-index="${citationIndex}"]`);
  if (!target) return;
  activeContextList.querySelectorAll(".context-item.highlight").forEach((item) => item.classList.remove("highlight"));
  target.classList.add("highlight");
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderCitations(contextList, citations) {
  if (!contextList) return;
  contextList.innerHTML = (citations || []).map((item, index) => {
    const citationIndex = Number.isFinite(Number(item.index)) ? Number(item.index) : index + 1;
    const title = item.title || item.source_id || "未命名来源";
    const snippet = item.snippet || item.segment_text || item.extracted_preview || "该来源没有可展示的文本片段。";
    const preview = compactSnippet(snippet);
    const hitReason = item.hit_reason ? `<span class="status-badge">${escapeHtml(formatHitReason(item.hit_reason))}</span>` : "";
    const sourceMeta = item.source_id ? citationContext.resolveSourceMeta?.(item.source_id) : null;
    const statusBadge = renderSourceStatusBadge(sourceMeta);
    const canOpen = item.source_id && sourceMeta?.exists !== false;
    return `
      <div class="context-item" data-citation-index="${citationIndex}">
        <strong>[${citationIndex}] ${escapeHtml(title)}</strong>
        <p>${escapeHtml(preview)}</p>
        <div class="context-actions">
          ${hitReason}
          ${statusBadge}
          ${canOpen ? `<button class="secondary-button" type="button" data-open-source="${escapeHtml(item.source_id)}">打开源资料</button>` : ""}
          ${item.source_id ? `<button class="secondary-button" type="button" data-quarantine-citation="${escapeHtml(item.source_id)}">标记污染</button>` : ""}
        </div>
      </div>
    `;
  }).join("") || `<div class="context-item"><strong>暂无引用</strong><p>没有命中本地上下文。</p></div>`;
  contextList.querySelectorAll("[data-open-source]").forEach((button) => {
    button.addEventListener("click", () => citationContext.onOpenSource?.(button.dataset.openSource));
  });
  contextList.querySelectorAll("[data-quarantine-citation]").forEach((button) => {
    button.addEventListener("click", () => citationContext.onQuarantine?.(button.dataset.quarantineCitation));
  });
}

// 引用来源的实时状态徽标。sourceMeta 由宿主按 source_id 在当前源列表里查得，
// 因此即使历史引用对应的源资料后来被隔离或删除，也能如实反映当前状态。
function renderSourceStatusBadge(sourceMeta) {
  if (!sourceMeta) return "";
  if (sourceMeta.exists === false) return `<span class="status-badge bad">源已删除</span>`;
  const label = sourceMeta.label || "";
  if (!label || sourceMeta.status === "normal") return "";
  const tone = sourceMeta.status === "deleted" ? "bad" : "warn";
  return `<span class="status-badge ${tone}">${escapeHtml(label)}</span>`;
}

function formatProviderLabel(provider) {
  if (provider.requires_key && !provider.configured) return `${provider.display_name}（需 Key）`;
  if (provider.configured) return `${provider.display_name}（已配置）`;
  return provider.display_name;
}

function formatProviderStatus(provider) {
  if (provider.configured) return "已配置";
  return provider.requires_key ? "需要本地 API Key" : "可直接使用";
}

function formatHitReason(value) {
  const labels = {
    keyword: "关键词命中",
    vector: "向量召回",
    vector_keyword: "向量+关键词",
    recent_memory: "最近记忆",
    retrieval: "本地召回"
  };
  return labels[value] || value;
}

function compactSnippet(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= 320) return normalized;
  return `${normalized.slice(0, 320)}...`;
}

function formatConversationMemoryStatus(memory) {
  if (!memory || memory.status === "skipped") {
    if (memory?.reason === "auto_governance_low_signal") return "自动治理：本轮未进入长期记忆";
    if (memory?.reason === "disabled_by_request") return "本轮未写入长期记忆";
  }
  return "本轮未写入长期记忆";
}
