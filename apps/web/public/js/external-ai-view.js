/**
 * 外部 AI(MCP)访问设置视图。
 *
 * 自管:拉取工具权限与调用审计,渲染逐工具开关、调用记录、客户端接入示例。
 */

import { get, post } from "./api.js";
import { escapeHtml } from "./utils.js";

const TOOL_LABELS = {
  "memory.search": "搜索本地记忆",
  "memory.get_context": "获取上下文",
  "memory.ask": "基于记忆问答",
  "graph.search": "搜索图谱节点"
};

// 写工具:允许外部 AI 改本地数据,默认关闭,需谨慎开启。
const WRITE_TOOL_LABELS = {
  "memory.import": "导入单条资料(写)",
  "memory.import_batch": "批量导入资料(写)",
  "memory.parse": "触发解析(写)"
};

export async function renderExternalAi(container) {
  if (!container) return;
  let permissions = { tools: {} };
  let calls = [];
  try {
    [permissions, { calls = [] }] = await Promise.all([
      get("/api/external/permissions"),
      get("/api/external/calls?limit=30")
    ]);
  } catch (error) {
    container.innerHTML = `<div class="external-empty">读取失败：${escapeHtml(error.message)}</div>`;
    return;
  }

  const tools = permissions.tools || {};
  container.innerHTML = `
    <div class="external-tools">
      <h4>工具开关</h4>
      ${Object.keys(TOOL_LABELS).map((name) => `
        <label class="external-tool-row">
          <input type="checkbox" data-tool="${escapeHtml(name)}" ${tools[name] !== false ? "checked" : ""} />
          <span><strong>${escapeHtml(name)}</strong> · ${escapeHtml(TOOL_LABELS[name])}</span>
        </label>
      `).join("")}
    </div>

    <div class="external-tools external-write-tools">
      <h4>写入工具 <span class="write-warn">⚠ 允许外部 AI 改本地数据,默认关闭,请谨慎开启</span></h4>
      ${Object.keys(WRITE_TOOL_LABELS).map((name) => `
        <label class="external-tool-row">
          <input type="checkbox" data-tool="${escapeHtml(name)}" ${tools[name] ? "checked" : ""} />
          <span><strong>${escapeHtml(name)}</strong> · ${escapeHtml(WRITE_TOOL_LABELS[name])}</span>
        </label>
      `).join("")}
    </div>

    <div class="external-config">
      <h4>接入示例(Claude Desktop / Cursor)</h4>
      <pre class="external-config-code">${escapeHtml(configExample())}</pre>
    </div>

    <div class="external-audit">
      <h4>调用审计(最近 ${calls.length} 条)</h4>
      <div class="external-audit-list">
        ${calls.length === 0 ? `<div class="external-empty">暂无外部调用记录。</div>` : calls.map((call) => `
          <div class="external-audit-row">
            <span class="audit-action audit-${call.status === "success" ? "restored" : "deleted"}">${call.status === "success" ? "成功" : "失败"}</span>
            <span class="audit-title">${escapeHtml(call.tool || "")}</span>
            <span class="audit-reason">${Number(call.duration_ms || 0)}ms${call.error ? " · " + escapeHtml(String(call.error).slice(0, 40)) : ""}</span>
            <span class="audit-time">${escapeHtml(formatTime(call.timestamp))}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  container.querySelectorAll("[data-tool]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      await post("/api/external/permissions", { tool: checkbox.dataset.tool, enabled: checkbox.checked });
      await renderExternalAi(container);
    });
  });
}

function configExample() {
  const repo = "<本仓库路径>/apps/mcp/src/mcp-stdio.js";
  return JSON.stringify(
    {
      mcpServers: {
        "local-memory-hub": {
          command: "node",
          args: [repo],
          env: { LMH_DATA_DIR: "<数据目录>", LMH_API_BASE: "http://127.0.0.1:4317" }
        }
      }
    },
    null,
    2
  );
}

function formatTime(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  } catch {
    return String(value);
  }
}
