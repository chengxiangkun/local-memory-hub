/**
 * 首启向导:新用户第一次打开时显示一张欢迎卡,介绍产品与核心闭环,
 * 并提供「导入示例,马上体验」。只在首次显示(localStorage 标记)。
 */

const FLAG = "lmh-onboarded";

export function showOnboardingIfFirstRun({ onImportSample } = {}) {
  if (window.localStorage.getItem(FLAG)) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay onboarding-overlay";
  overlay.innerHTML = `
    <div class="modal-card onboarding-card" role="dialog" aria-modal="true">
      <p class="onboarding-eyebrow">LOCAL MEMORY HUB</p>
      <h3 class="modal-title">欢迎使用本地记忆中心</h3>
      <p class="modal-message">本地优先的个人 AI 记忆层:把资料导入 → 解析成可搜索、可追溯的「记忆」→ 用图谱、问答,以及外部 AI(MCP)调用。<strong>数据全程留在本机。</strong></p>
      <ul class="onboarding-steps">
        <li><span>1</span> 导入资料(文本 / 文件 / 链接 / 飞书 · 腾讯文档)</li>
        <li><span>2</span> 自动进入记忆(文本片段 + 向量索引 + 图谱节点)</li>
        <li><span>3</span> 带引用问答、图谱探索、污染治理</li>
      </ul>
      <div class="modal-actions">
        <button class="ghost-button" data-act="skip">先逛逛</button>
        <button class="primary-button" data-act="sample">导入示例,马上体验</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const done = () => {
    window.localStorage.setItem(FLAG, "1");
    overlay.remove();
  };
  overlay.querySelector('[data-act="skip"]').addEventListener("click", done);
  overlay.querySelector('[data-act="sample"]').addEventListener("click", async () => {
    done();
    try {
      await onImportSample?.();
    } catch {
      /* 导入失败不阻断 */
    }
  });
}
