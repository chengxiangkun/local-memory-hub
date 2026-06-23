/**
 * 应用内帮助文档:使用说明 + 截图,覆盖核心闭环与各功能入口。
 * 以全屏可滚动面板展示(主题化)。
 */

const SECTIONS = [
  {
    h: "快速上手(3 步)",
    body: `<ol class="help-ol">
      <li><strong>导入资料</strong>:点右上「快速导入」,粘贴文本 / 上传文件 / 贴链接 / 接入飞书·腾讯文档。</li>
      <li><strong>自动进入记忆</strong>:系统解析成文本片段 + 向量索引 + 图谱节点。</li>
      <li><strong>使用</strong>:在「搜索与问答」提问(带可点击引用),在「图谱」探索关系。</li>
    </ol>`
  },
  {
    h: "图谱",
    body: `关系 / 社区 / 向量 / 时间四种视图。滚轮或底部滑条缩放,拖拽平移,点节点看详情与一跳关系,「导出快照」存为图片。`,
    img: "graph.png"
  },
  {
    h: "搜索与问答",
    body: `多会话连续追问;答案基于本地资料并带 <code>[n]</code> 引用,点引用可回溯到源文件;回答支持 Markdown。回车发送,Shift+Enter 换行。问答模型默认选已配置的模型并记住上次选择。`,
    img: "qa.png"
  },
  {
    h: "模型配置",
    body: `设置中心 →「模型 Provider」内置约 20 家(DeepSeek、Claude 官方、OpenAI、通义千问、智谱、Kimi、OpenRouter、Gemini 等)。填 Base URL / 模型 / API Key 即可;模型名是可输入下拉。API Key 仅加密保存在本地。`,
    img: "settings.png"
  },
  {
    h: "外部文档接入(飞书 / 腾讯文档)",
    body: `「导入中心 → 外部文档」连接。App 凭证可在卡片「凭证配置」里<strong>加密填写</strong>,保存即生效、无需重启。支持增量 / 修改 / 删除轮询同步。`
  },
  {
    h: "污染治理",
    body: `对错误 / 过期 / 不想被 AI 使用的资料:标记污染 → 隔离(退出检索与问答)→ 可恢复或彻底删除。所有操作有治理审计记录。`
  },
  {
    h: "外部 AI 调用(MCP)",
    body: `通过标准 stdio MCP 让 Claude Desktop / Cursor / Codex 调用本地记忆(memory.search / get_context / ask / graph.search)。可逐工具开关,每次调用有审计;隔离 / 删除内容不外泄。设置页有可复制的接入示例。`
  },
  {
    h: "数据与隐私",
    body: `数据全部存在本机数据目录,升级保留。API Key 与连接器凭证 AES-256-GCM 加密落盘,绝不进 Git。右上 🌙/☀️ 可切换深 / 亮主题。`
  }
];

export function openHelp() {
  if (document.querySelector(".help-overlay")) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay help-overlay";
  overlay.innerHTML = `
    <div class="help-panel" role="dialog" aria-modal="true" aria-label="使用帮助">
      <div class="help-head">
        <h2>使用帮助</h2>
        <button class="icon-button" data-help-close aria-label="关闭">✕</button>
      </div>
      <div class="help-body">
        ${SECTIONS.map((s) => `
          <section class="help-section">
            <h3>${s.h}</h3>
            <div class="help-text">${s.body}</div>
            ${s.img ? `<img class="help-shot" src="/help/${s.img}" alt="${s.h}截图" loading="lazy" />` : ""}
          </section>
        `).join("")}
        <p class="help-foot">更多文档见仓库 <code>docs/</code> 与 README。</p>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-help-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { document.removeEventListener("keydown", esc); close(); }
  });
}
