/**
 * Search and Q&A view.
 *
 * Handles local fallback Q&A rendering and task-level model selection.
 */

import { get, post } from "./api.js";
import { escapeHtml } from "./utils.js";

const conversation = [];
const SESSION_STORAGE_KEY = "local-memory-hub.qa-session-id";
let currentSessionId = window.localStorage.getItem(SESSION_STORAGE_KEY) || "";

export async function loadQaSession({ answerBox, contextList } = {}) {
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
  const previousValue = providerPicker.dataset.value || "mock";
  const selectedProvider = providers.find((provider) => provider.provider_id === previousValue) || providers.find((provider) => provider.provider_id === "mock") || providers[0];
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
      pending: false
    });
    renderConversation(answerBox);
    renderCitations(contextList, data.citations || [], onQuarantineCitation);
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
  answerBox.innerHTML = conversation.map((message) => `
    <article class="chat-message ${message.role} ${message.pending ? "pending" : ""} ${message.error ? "error" : ""}">
      <div class="chat-message-meta">
        <strong>${escapeHtml(message.role === "user" ? "你" : message.model || "AI")}</strong>
        ${message.citation_count !== undefined ? `<span>${message.citation_count} 条引用</span>` : ""}
      </div>
      <p>${escapeHtml(message.content || "").replaceAll("\n", "<br />")}</p>
      ${message.memory_status ? `<span class="status-badge ok">${escapeHtml(message.memory_status)}</span>` : ""}
    </article>
  `).join("");
  answerBox.scrollTop = answerBox.scrollHeight;
}

function renderCitations(contextList, citations, onQuarantineCitation) {
  if (!contextList) return;
  contextList.innerHTML = (citations || []).map((item, index) => {
    const citationIndex = Number.isFinite(Number(item.index)) ? Number(item.index) : index + 1;
    const title = item.title || item.source_id || "未命名来源";
    const snippet = item.snippet || item.segment_text || item.extracted_preview || "该来源没有可展示的文本片段。";
    const preview = compactSnippet(snippet);
    const hitReason = item.hit_reason ? `<span class="status-badge">${escapeHtml(formatHitReason(item.hit_reason))}</span>` : "";
    return `
      <div class="context-item">
        <strong>[${citationIndex}] ${escapeHtml(title)}</strong>
        <p>${escapeHtml(preview)}</p>
        <div class="context-actions">
          ${hitReason}
          ${item.source_id ? `<button class="secondary-button" type="button" data-quarantine-citation="${escapeHtml(item.source_id)}">标记污染</button>` : ""}
        </div>
      </div>
    `;
  }).join("") || `<div class="context-item"><strong>暂无引用</strong><p>没有命中本地上下文。</p></div>`;
  contextList.querySelectorAll("[data-quarantine-citation]").forEach((button) => {
    button.addEventListener("click", () => onQuarantineCitation?.(button.dataset.quarantineCitation));
  });
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
