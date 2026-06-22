/**
 * 可拔插 embedding 设置视图。
 *
 * 自管:拉取模型目录、渲染选择卡片、下载引导(含进度轮询)、名称/路径/Key 配置、
 * 切换激活项后引导重建向量索引。所有写操作走 API,完成后回调 onChanged 让主协调器刷新。
 */

import { get, post } from "./api.js";
import { escapeHtml } from "./utils.js";

let pollTimer = null;

export async function renderEmbeddingSettings(container, { onChanged } = {}) {
  if (!container) return;
  let data;
  try {
    data = await get("/api/embedding/catalog");
  } catch (error) {
    container.innerHTML = `<div class="embedding-empty">读取模型目录失败：${escapeHtml(error.message)}</div>`;
    return;
  }
  const { catalog = [], active_id = "", model_path = "" } = data;
  const anyDownloading = catalog.some((item) => item.download?.state === "downloading");

  container.innerHTML = `
    <div class="embedding-pathline">
      <label>本地模型存放路径</label>
      <div class="embedding-path-row">
        <input id="embeddingModelPath" value="${escapeHtml(model_path)}" spellcheck="false" />
        <button class="ghost-button" type="button" id="saveEmbeddingPath">保存路径</button>
      </div>
    </div>
    <div class="embedding-cards">
      ${catalog.map((entry) => renderCard(entry)).join("")}
    </div>
    <div class="embedding-rebuild-row">
      <button class="secondary-button" type="button" id="rebuildVectorsBtn">切换模型后重建向量索引</button>
      <span class="embedding-rebuild-hint">切换 embedding 后,旧向量维度不匹配,需重建才能检索到。</span>
      <span id="rebuildVectorStatus" class="embedding-rebuild-status"></span>
    </div>
  `;

  container.querySelector("#saveEmbeddingPath")?.addEventListener("click", async () => {
    const value = container.querySelector("#embeddingModelPath")?.value?.trim();
    if (!value) return;
    await post("/api/embedding/config", { model_path: value });
    await renderEmbeddingSettings(container, { onChanged });
  });

  container.querySelectorAll("[data-embedding-use]").forEach((button) => {
    button.addEventListener("click", async () => {
      await post("/api/embedding/config", { active_id: button.dataset.embeddingUse });
      await renderEmbeddingSettings(container, { onChanged });
      await onChanged?.();
    });
  });

  container.querySelectorAll("[data-embedding-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      await post("/api/embedding/download", { id: button.dataset.embeddingDownload });
      await renderEmbeddingSettings(container, { onChanged });
    });
  });

  container.querySelectorAll("[data-embedding-save-cloud]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = form.dataset.embeddingSaveCloud;
      const fd = new FormData(form);
      const override = { id, base_url: fd.get("base_url"), model: fd.get("model") };
      const apiKey = fd.get("api_key");
      if (apiKey) override.api_key = apiKey;
      await post("/api/embedding/config", { override });
      await renderEmbeddingSettings(container, { onChanged });
    });
  });

  container.querySelectorAll("[data-embedding-save-name]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = form.dataset.embeddingSaveName;
      const fd = new FormData(form);
      await post("/api/embedding/config", { override: { id, model_ref: fd.get("model_ref") } });
      await renderEmbeddingSettings(container, { onChanged });
    });
  });

  container.querySelector("#rebuildVectorsBtn")?.addEventListener("click", async () => {
    const status = container.querySelector("#rebuildVectorStatus");
    const button = container.querySelector("#rebuildVectorsBtn");
    button.disabled = true;
    if (status) status.textContent = "重建中…(正在用当前模型重新嵌入所有片段)";
    try {
      const result = await post("/api/vector/rebuild", {});
      if (status) status.textContent = `完成:${result.vector_count ?? 0} 个向量 · ${result.embedding_dimension ?? "-"} 维`;
      await onChanged?.();
    } catch (error) {
      if (status) status.textContent = `失败:${error.message}`;
    } finally {
      button.disabled = false;
    }
  });

  // 有下载进行中则轮询刷新。
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  if (anyDownloading) {
    pollTimer = setTimeout(() => renderEmbeddingSettings(container, { onChanged }), 2500);
  }
}

function renderCard(entry) {
  const statusBadge = cardStatusBadge(entry);
  return `
    <div class="embedding-card ${entry.active ? "active" : ""}">
      <div class="embedding-card-head">
        <strong>${escapeHtml(entry.name)}</strong>
        ${statusBadge}
      </div>
      <div class="embedding-card-meta">
        <span>${escapeHtml(entry.languages || "")}</span>
        <span>${escapeHtml(entry.quality || "")}</span>
        <span>${entry.dimension ? `${entry.dimension} 维` : ""}</span>
        ${entry.size_mb ? `<span>${entry.size_mb}MB</span>` : ""}
        <span>${escapeHtml(entry.memory_hint || "")}</span>
      </div>
      <p class="embedding-card-desc">${escapeHtml(entry.description || "")}</p>
      ${renderCardActions(entry)}
    </div>
  `;
}

function cardStatusBadge(entry) {
  if (entry.active) return `<span class="status-badge ok">使用中</span>`;
  if (entry.recommended) return `<span class="status-badge">推荐</span>`;
  if (entry.runtime === "transformers") {
    if (entry.download?.state === "downloading") return `<span class="status-badge warn">下载中…</span>`;
    if (entry.download?.state === "error") return `<span class="status-badge bad">下载失败</span>`;
    return entry.downloaded ? `<span class="status-badge ok">已下载</span>` : `<span class="status-badge">未下载</span>`;
  }
  if (entry.runtime === "openai") return entry.configured ? `<span class="status-badge ok">已配置</span>` : `<span class="status-badge">需 Key</span>`;
  return "";
}

function renderCardActions(entry) {
  if (entry.runtime === "transformers") {
    const useBtn = entry.downloaded && !entry.active ? `<button class="secondary-button" type="button" data-embedding-use="${escapeHtml(entry.id)}">使用</button>` : "";
    const dlBtn = !entry.downloaded && entry.download?.state !== "downloading"
      ? `<button class="ghost-button" type="button" data-embedding-download="${escapeHtml(entry.id)}">下载（约 ${entry.size_mb}MB）</button>`
      : "";
    const dlState = entry.download?.state === "downloading" ? `<span class="embedding-dl-hint">下载中,首次较慢,完成后自动可用…</span>` : "";
    const dlErr = entry.download?.state === "error" ? `<span class="embedding-dl-hint bad">${escapeHtml(entry.download.error || "下载失败")}</span>` : "";
    return `
      <div class="embedding-card-actions">${useBtn}${dlBtn}${dlState}${dlErr}</div>
      <form class="embedding-name-form" data-embedding-save-name="${escapeHtml(entry.id)}">
        <input name="model_ref" value="${escapeHtml(entry.model_ref)}" placeholder="模型名称(HuggingFace id)" spellcheck="false" />
        <button class="ghost-button" type="submit">保存名称</button>
      </form>
    `;
  }
  if (entry.runtime === "openai") {
    const useBtn = entry.configured && !entry.active ? `<button class="secondary-button" type="button" data-embedding-use="${escapeHtml(entry.id)}">使用</button>` : "";
    return `
      <form class="embedding-cloud-form" data-embedding-save-cloud="${escapeHtml(entry.id)}">
        <input name="base_url" value="${escapeHtml(entry.base_url || "")}" placeholder="Base URL" spellcheck="false" />
        <input name="model" value="${escapeHtml(entry.model || "")}" placeholder="Embedding 模型名" spellcheck="false" />
        <input name="api_key" type="password" placeholder="${entry.has_api_key ? "留空则不修改 API Key" : "API Key"}" />
        <div class="embedding-card-actions">
          <button type="submit">保存配置</button>
          ${useBtn}
        </div>
      </form>
    `;
  }
  // builtin
  return `<div class="embedding-card-actions">${entry.active ? "" : `<button class="secondary-button" type="button" data-embedding-use="${escapeHtml(entry.id)}">使用</button>`}</div>`;
}
