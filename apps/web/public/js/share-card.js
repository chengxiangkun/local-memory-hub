/**
 * 记忆报告卡(社交分享 P0-①)。
 * 把本地记忆的统计聚合成一张可分享图片(canvas 渲染 → 走 /api/graph/export 落盘)。
 * 不含任何原始资料,仅统计数字 + 热门关键词 + 品牌水印,隐私安全、自带引流。
 */

import { get, post } from "./api.js";

const W = 1200;
const H = 630;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function gatherStats() {
  const [sources, graph, habits] = await Promise.all([
    get("/api/sources").catch(() => ({ sources: [] })),
    get("/api/graph").catch(() => ({ nodes: [] })),
    get("/api/memory/habits").catch(() => ({}))
  ]);
  const sourceList = sources.sources || sources || [];
  return {
    sourceCount: sourceList.length,
    nodeCount: (graph.nodes || []).length,
    qaCount: habits?.evidence?.qa_memory_count || 0,
    keywords: (habits?.habits?.frequent_keywords || []).slice(0, 6).map((k) => k.keyword || k)
  };
}

function drawCard(ctx, stats, dateText) {
  // 背景:深色 + 顶部柔光
  ctx.fillStyle = "#0e1116";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, -60, 80, W * 0.5, 200, 700);
  glow.addColorStop(0, "rgba(52, 211, 153, 0.18)");
  glow.addColorStop(1, "rgba(52, 211, 153, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 边框
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, 24, 24, W - 48, H - 48, 28);
  ctx.stroke();

  // 标题
  ctx.fillStyle = "#34d399";
  ctx.font = "600 26px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.fillText("LOCAL MEMORY HUB", 72, 96);
  ctx.fillStyle = "#f1f5f2";
  ctx.font = "800 60px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.fillText("我的本地记忆", 72, 168);
  ctx.fillStyle = "#9aa8b7";
  ctx.font = "400 24px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(dateText, 72, 210);

  // 三大数字
  const stats3 = [
    { n: stats.sourceCount, label: "源资料" },
    { n: stats.nodeCount, label: "记忆节点" },
    { n: stats.qaCount, label: "问答记忆" }
  ];
  const colW = (W - 144) / 3;
  stats3.forEach((s, i) => {
    const x = 72 + i * colW;
    ctx.fillStyle = "#f1f5f2";
    ctx.font = "800 76px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(String(s.n), x, 350);
    ctx.fillStyle = "#9aa8b7";
    ctx.font = "400 26px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(s.label, x, 392);
  });

  // 关键词 chips
  ctx.fillStyle = "#9aa8b7";
  ctx.font = "500 22px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("我最关注", 72, 462);
  let cx = 72;
  const cy = 486;
  ctx.font = "500 24px ui-sans-serif, system-ui, sans-serif";
  (stats.keywords.length ? stats.keywords : ["本地记忆"]).forEach((kw) => {
    const text = `#${kw}`;
    const tw = ctx.measureText(text).width;
    const pad = 18;
    if (cx + tw + pad * 2 > W - 72) return;
    ctx.fillStyle = "rgba(52, 211, 153, 0.14)";
    roundRect(ctx, cx, cy, tw + pad * 2, 44, 22);
    ctx.fill();
    ctx.fillStyle = "#7ddf9b";
    ctx.fillText(text, cx + pad, cy + 30);
    cx += tw + pad * 2 + 12;
  });

  // 水印
  ctx.fillStyle = "#637084";
  ctx.font = "400 22px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("本地优先的个人 AI 记忆 · github.com/chengxiangkun/local-memory-hub", 72, H - 56);
}

// 生成并导出记忆卡片。dateText 由调用方传入(避免在模块内用 Date)。
export async function generateMemoryCard(dateText, { setStatus } = {}) {
  setStatus?.("正在生成记忆卡片…");
  const stats = await gatherStats();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  drawCard(ctx, stats, dateText);
  const dataUrl = canvas.toDataURL("image/png");
  const result = await post("/api/graph/export", { data: dataUrl, name: `memory-card-${dateText.replace(/[^\d]/g, "")}.png` });
  setStatus?.(`已生成记忆卡片:${result.path}`);
  return result;
}
