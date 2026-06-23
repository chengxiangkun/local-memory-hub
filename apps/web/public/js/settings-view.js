/**
 * Settings center view.
 *
 * Renders local storage, model providers, parsing strategy, external access,
 * upgrade state, and memory organizer profile from already-loaded state.
 */

import { escapeHtml } from "./utils.js";
import { post } from "./api.js";

// 可输入的主题化下拉(combobox):选项始终全部可见(不像 <datalist> 会按当前值过滤),
// 同时保留自定义输入。name 不变,FormData 行为与原 input 一致。
function comboField(name, value, defaultValue, placeholder, options) {
  const list = (options || [])
    .map((model) => `<button type="button" role="option" data-combo-option="${escapeHtml(model)}">${escapeHtml(model)}</button>`)
    .join("");
  return `
    <div class="combo" data-combo>
      <input class="combo-input" name="${name}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}" data-default-value="${escapeHtml(defaultValue)}" autocomplete="off" />
      <button class="combo-toggle" type="button" tabindex="-1" aria-label="展开${escapeHtml(placeholder)}列表"${list ? "" : " disabled"}><i aria-hidden="true"></i></button>
      <div class="combo-menu" role="listbox">${list || ""}</div>
    </div>`;
}

function wireComboboxes(root) {
  if (!root) return;
  root.querySelectorAll("[data-combo]").forEach((combo) => {
    const input = combo.querySelector(".combo-input");
    const toggle = combo.querySelector(".combo-toggle");
    const closeAll = () => root.querySelectorAll("[data-combo].open").forEach((el) => el.classList.remove("open"));
    toggle?.addEventListener("click", () => {
      const willOpen = !combo.classList.contains("open");
      closeAll();
      if (willOpen) combo.classList.add("open");
    });
    combo.querySelectorAll("[data-combo-option]").forEach((option) => {
      option.addEventListener("click", () => {
        input.value = option.dataset.comboOption;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        combo.classList.remove("open");
      });
    });
  });
  if (!root.dataset.comboOutsideWired) {
    root.dataset.comboOutsideWired = "1";
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-combo]")) {
        root.querySelectorAll("[data-combo].open").forEach((el) => el.classList.remove("open"));
      }
    });
  }
}

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
        ${comboField("model", provider.configured_model || provider.default_model || "", provider.default_model || "", "模型名称", provider.model_options || [])}
        ${provider.supports_embedding
          ? comboField("embedding_model", provider.configured_embedding_model || provider.default_embedding_model || "", provider.default_embedding_model || "", "Embedding 模型", provider.embedding_model_options || [])
          : ""}
        ${provider.requires_key ? `<input name="api_key" type="password" autocomplete="new-password" placeholder="${provider.configured ? "留空则不修改 API Key" : "API Key"}" />` : ""}
        <div class="provider-action-row">
          <button type="submit">保存</button>
          <button class="ghost-button" type="button" data-test-provider="${escapeHtml(provider.provider_id)}">测试</button>
          ${provider.supports_embedding ? `<button class="ghost-button" type="button" data-test-embedding="${escapeHtml(provider.provider_id)}">测试向量</button>` : ""}
        </div>
        <div class="provider-test-status" data-test-status="${escapeHtml(provider.provider_id)}"></div>
      </form>
    </div>
  `).join("");
  wireComboboxes(providerGrid);
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
  const picker = document.querySelector(selector);
  if (!picker) return;
  const selectedId = policies?.find((item) => item.task === task)?.provider_id || providers[0]?.provider_id || "mock";
  const current = providers.find((p) => p.provider_id === selectedId) || providers[0];
  if (!current) return;
  picker.dataset.value = current.provider_id;
  picker.innerHTML = `
    <button class="model-picker-trigger" type="button" aria-haspopup="listbox">
      <span>${escapeHtml(current.display_name)}</span><i aria-hidden="true"></i>
    </button>
    <div class="model-picker-menu" role="listbox">
      ${providers.map((provider) => `
        <button class="${provider.provider_id === current.provider_id ? "active" : ""}" type="button" role="option" data-provider-id="${escapeHtml(provider.provider_id)}">
          <strong>${escapeHtml(provider.display_name)}</strong>
          <span>${escapeHtml(formatProviderStatus(provider))}</span>
        </button>
      `).join("")}
    </div>`;
  const trigger = picker.querySelector(".model-picker-trigger");
  trigger.addEventListener("click", () => {
    document.querySelectorAll(".model-picker.open").forEach((el) => { if (el !== picker) el.classList.remove("open"); });
    picker.classList.toggle("open");
  });
  picker.querySelectorAll("[data-provider-id]").forEach((option) => {
    option.addEventListener("click", async () => {
      const providerId = option.dataset.providerId;
      picker.dataset.value = providerId;
      trigger.querySelector("span").textContent = providers.find((p) => p.provider_id === providerId)?.display_name || providerId;
      picker.querySelectorAll("[data-provider-id]").forEach((item) => item.classList.toggle("active", item.dataset.providerId === providerId));
      picker.classList.remove("open");
      await post("/api/models/policies", {
        task,
        provider_id: providerId,
        mode: task === "embedding" ? "fallback" : "balanced"
      });
      await onSaved?.();
    });
  });
  if (!document.body.dataset.policyPickerOutsideWired) {
    document.body.dataset.policyPickerOutsideWired = "1";
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".policy-picker")) {
        document.querySelectorAll(".policy-picker.open").forEach((el) => el.classList.remove("open"));
      }
    });
  }
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
