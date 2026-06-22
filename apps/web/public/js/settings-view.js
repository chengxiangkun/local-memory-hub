/**
 * Settings center view.
 *
 * Renders local storage, model providers, parsing strategy, external access,
 * upgrade state, and memory organizer profile from already-loaded state.
 */

import { escapeHtml } from "./utils.js";
import { post } from "./api.js";

export function renderSettings({ providers, health, version, sources, graph, habits, modelPolicies, mcpStatus, systemDoctor, onProviderSaved }) {
  setText("#settingsDataPath", version?.data_dir || health?.data_dir || "");
  setText("#settingsAppVersion", `v${version?.app_version || "0.0.1"}`);
  setText("#settingsSchemaVersion", `${version?.schema_version || "-"} / ${version?.latest_schema_version || "-"}`);
  setText("#settingsSourceCount", sources.length);
  setText("#settingsGraphCount", graph.nodes.length);
  setText("#settingsMigrationStatus", version?.needs_migration ? "需要迁移" : "已是最新数据结构");
  setText("#settingsMigrationDetail", version?.needs_migration ? "存在待执行迁移" : "无需迁移");
  setText("#settingsMcpStatus", formatMcpStatus(mcpStatus));
  renderProviderGrid(document.querySelector("#providerGrid"), providers, onProviderSaved);
  renderPolicySelect("#chatPolicyProvider", "chat", providers, modelPolicies, onProviderSaved);
  renderPolicySelect("#parsePolicyProvider", "parse_fallback", providers, modelPolicies, onProviderSaved);
  renderPolicySelect("#embeddingPolicyProvider", "embedding", providers.filter((provider) => provider.supports_embedding), modelPolicies, onProviderSaved);
  renderHabitProfile(document.querySelector("#habitProfile"), habits);
  renderSystemDoctor(document.querySelector("#systemDoctor"), systemDoctor);
}

function renderProviderGrid(providerGrid, providers, onProviderSaved) {
  if (!providerGrid) return;
  providerGrid.innerHTML = providers.map((provider) => `
    <div class="provider-card">
      <strong>${escapeHtml(provider.display_name)}</strong>
      <span>${escapeHtml(provider.api_format)} · ${formatProviderStatus(provider)}</span>
      <button class="secondary-button" type="button" data-config-provider="${escapeHtml(provider.provider_id)}">配置</button>
      <form class="provider-config-form hidden" data-provider-form="${escapeHtml(provider.provider_id)}">
        <div class="provider-default-row">
          <span>默认：${escapeHtml(provider.default_model || "自定义模型")}</span>
          <button class="ghost-button" type="button" data-apply-provider-default="${escapeHtml(provider.provider_id)}">使用默认</button>
        </div>
        <input name="base_url" placeholder="Base URL" value="${escapeHtml(provider.configured_base_url || provider.default_base_url || "")}" data-default-value="${escapeHtml(provider.default_base_url || "")}" />
        <input name="model" list="models-${escapeHtml(provider.provider_id)}" placeholder="模型名称" value="${escapeHtml(provider.configured_model || provider.default_model || "")}" data-default-value="${escapeHtml(provider.default_model || "")}" />
        <datalist id="models-${escapeHtml(provider.provider_id)}">
          ${(provider.model_options || []).map((model) => `<option value="${escapeHtml(model)}"></option>`).join("")}
        </datalist>
        ${provider.supports_embedding ? `
          <input name="embedding_model" list="embedding-models-${escapeHtml(provider.provider_id)}" placeholder="Embedding 模型" value="${escapeHtml(provider.configured_embedding_model || provider.default_embedding_model || "")}" data-default-value="${escapeHtml(provider.default_embedding_model || "")}" />
          <datalist id="embedding-models-${escapeHtml(provider.provider_id)}">
            ${(provider.embedding_model_options || []).map((model) => `<option value="${escapeHtml(model)}"></option>`).join("")}
          </datalist>
        ` : ""}
        ${provider.requires_key ? `<input name="api_key" type="password" placeholder="${provider.configured ? "留空则不修改 API Key" : "API Key"}" />` : ""}
        <div class="provider-action-row">
          <button type="submit">保存</button>
          <button class="ghost-button" type="button" data-test-provider="${escapeHtml(provider.provider_id)}">测试</button>
          ${provider.supports_embedding ? `<button class="ghost-button" type="button" data-test-embedding="${escapeHtml(provider.provider_id)}">测试向量</button>` : ""}
        </div>
        <div class="provider-test-status" data-test-status="${escapeHtml(provider.provider_id)}"></div>
      </form>
    </div>
  `).join("");
  providerGrid.querySelectorAll("[data-config-provider]").forEach((button) => {
    button.addEventListener("click", () => {
      providerGrid.querySelector(`[data-provider-form="${button.dataset.configProvider}"]`)?.classList.toggle("hidden");
    });
  });
  providerGrid.querySelectorAll("[data-provider-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const body = {
        provider_id: form.dataset.providerForm,
        base_url: formData.get("base_url"),
        model: formData.get("model"),
        embedding_model: formData.get("embedding_model")
      };
      const apiKey = formData.get("api_key");
      if (apiKey) body.api_key = apiKey;
      await post("/api/models/configs", body);
      await onProviderSaved?.();
    });
  });
  providerGrid.querySelectorAll("[data-apply-provider-default]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = providerGrid.querySelector(`[data-provider-form="${button.dataset.applyProviderDefault}"]`);
      form?.querySelectorAll("[data-default-value]").forEach((input) => {
        if (input.dataset.defaultValue) input.value = input.dataset.defaultValue;
      });
    });
  });
  providerGrid.querySelectorAll("[data-test-provider]").forEach((button) => {
    button.addEventListener("click", async () => {
      const providerId = button.dataset.testProvider;
      const form = providerGrid.querySelector(`[data-provider-form="${providerId}"]`);
      const status = providerGrid.querySelector(`[data-test-status="${providerId}"]`);
      const formData = new FormData(form);
      button.disabled = true;
      if (status) status.textContent = "测试中...";
      try {
        const result = await post("/api/ask", {
          provider_id: providerId,
          question: "请只回复 OK",
          persist_memory: false,
          config: {
            base_url: formData.get("base_url"),
            model: formData.get("model"),
            api_key: formData.get("api_key")
          }
        });
        if (status) status.textContent = `可用：${result.model || "已连通"}`;
      } catch (error) {
        if (status) status.textContent = `失败：${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
  });
  providerGrid.querySelectorAll("[data-test-embedding]").forEach((button) => {
    button.addEventListener("click", async () => {
      const providerId = button.dataset.testEmbedding;
      const form = providerGrid.querySelector(`[data-provider-form="${providerId}"]`);
      const status = providerGrid.querySelector(`[data-test-status="${providerId}"]`);
      const formData = new FormData(form);
      button.disabled = true;
      if (status) status.textContent = "向量测试中...";
      try {
        const result = await post("/api/models/embedding/test", {
          provider_id: providerId,
          base_url: formData.get("base_url"),
          model: formData.get("model"),
          embedding_model: formData.get("embedding_model"),
          api_key: formData.get("api_key")
        });
        if (status) status.textContent = `向量可用：${result.embedding_model} · ${result.embedding_dimension} 维`;
      } catch (error) {
        if (status) status.textContent = `向量失败：${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
  });
}

function formatProviderStatus(provider) {
  if (provider.configured) return `已配置${provider.configured_model ? ` · ${provider.configured_model}` : ""}`;
  return provider.requires_key ? "未配置 API Key" : "无需 Key";
}

function renderPolicySelect(selector, task, providers, policies, onSaved) {
  const select = document.querySelector(selector);
  if (!select) return;
  const selected = policies?.find((item) => item.task === task)?.provider_id || providers[0]?.provider_id || "mock";
  select.innerHTML = providers.map((provider) => `
    <option value="${escapeHtml(provider.provider_id)}" ${provider.provider_id === selected ? "selected" : ""}>
      ${escapeHtml(provider.display_name)}
    </option>
  `).join("");
  select.onchange = async () => {
    await post("/api/models/policies", {
      task,
      provider_id: select.value,
      mode: task === "embedding" ? "fallback" : "balanced"
    });
    await onSaved?.();
  };
}

function renderHabitProfile(container, habits) {
  if (!container) return;
  const keywords = habits?.habits?.frequent_keywords || [];
  const preferences = habits?.habits?.likely_preferences || [];
  container.innerHTML = `
    <div class="settings-list">
      <div><span>已分析问答记忆</span><strong>${habits?.evidence?.qa_memory_count || 0}</strong></div>
      <div><span>分析上下文</span><strong>${habits?.evidence?.analyzed_context_count || 0}</strong></div>
      <div><span>运行策略</span><strong>${escapeHtml(habits?.maintenance_policy?.token_saving_mode || "本地统计优先")}</strong></div>
    </div>
    <div class="habit-tags">
      ${keywords.slice(0, 10).map((item) => `<span>${escapeHtml(item.keyword)} · ${item.count}</span>`).join("") || "<span>暂无关键词</span>"}
    </div>
    <div class="habit-preferences">
      ${preferences.map((item) => `<p>${escapeHtml(item)}</p>`).join("") || "<p>暂无明确偏好，系统会随着问答记忆增加继续整理。</p>"}
    </div>
  `;
}

function renderSystemDoctor(container, doctor) {
  if (!container) return;
  const checks = doctor?.checks || [];
  if (checks.length === 0) {
    container.innerHTML = `<div class="doctor-empty">等待本机能力检查</div>`;
    return;
  }
  container.innerHTML = checks.map((check) => `
    <div class="doctor-check ${escapeHtml(check.status)}">
      <span>${escapeHtml(check.label)}</span>
      <strong>${formatDoctorStatus(check)}</strong>
      <button class="info-dot" type="button" aria-label="说明：${escapeHtml(check.message)}">i<span role="tooltip">${escapeHtml(check.message)}</span></button>
    </div>
  `).join("");
}

function formatDoctorStatus(check) {
  if (check.status === "ok") return "可用";
  if (check.required) return "缺失";
  return "可选缺失";
}

function formatMcpStatus(status) {
  if (!status) return "读取中";
  if (status.status === "running") return "运行中";
  if (status.status === "stopped") return "未启动";
  return status.status || "未知";
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}
