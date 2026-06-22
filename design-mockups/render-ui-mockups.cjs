const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const outDir = __dirname;
const chrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const themes = {
  light: {
    suffix: "light",
    desktop: "#E6E6E4",
    window: "#F8F5EF",
    titlebar: "#F8F5EF",
    sidebar: "#F2EEE6",
    content: "#F8F5EF",
    panel: "#FFFFFF",
    surface: "#FBFAF7",
    active: "#E8EFE9",
    border: "#DED8CD",
    borderStrong: "#D6CFC3",
    text: "#25221D",
    muted: "#7B746A",
    accent: "#3F705F",
    accentSoft: "#DCEAE3",
    graph: "#8FAEA2",
    node: "#89948D",
    success: "#4F8B62",
    warning: "#9B7359",
    danger: "#B8655A",
    buttonText: "#FFFFFF",
    shadow: "0.18",
  },
  dark: {
    suffix: "dark",
    desktop: "#050505",
    window: "#080808",
    titlebar: "#080808",
    sidebar: "#0D0D0D",
    content: "#080808",
    panel: "#121212",
    surface: "#0A0A0A",
    active: "#221F17",
    border: "#2A2A2A",
    borderStrong: "#343434",
    text: "#E9E6DD",
    muted: "#99958D",
    accent: "#B69A5B",
    accentSoft: "#2B261A",
    graph: "#B69A5B",
    node: "#7C7A72",
    success: "#6F876E",
    warning: "#B69A5B",
    danger: "#D18B7F",
    buttonText: "#0A0A0A",
    shadow: "0.5",
  },
};

function svgRoot(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1440" height="900" viewBox="0 0 1440 900" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="0" y="0" width="1440" height="900" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="24" stdDeviation="32" flood-color="#000000" flood-opacity="0.26"/>
    </filter>
    <style>
      .cn { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Noto Sans SC', 'PingFang SC', sans-serif; }
      .mono { font-family: 'SF Mono', ui-monospace, Menlo, monospace; }
    </style>
  </defs>
  ${body}
</svg>`;
}

function rect(x, y, w, h, r, fill, stroke = "", extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ""} ${extra}/>`;
}

function text(x, y, value, size, fill, weight = 500, extra = "") {
  return `<text x="${x}" y="${y}" class="cn" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${value}</text>`;
}

function circle(cx, cy, r, fill, opacity = 1) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
}

function icon(name, x, y, color) {
  const s = color;
  const common = `stroke="${s}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  if (name === "graph") {
    return `<g>${circle(x + 7, y + 10, 3, s)}${circle(x + 22, y + 7, 3, s)}${circle(x + 18, y + 24, 3, s)}<path d="M${x + 10} ${y + 10} L${x + 19} ${y + 8} M${x + 9} ${y + 12} L${x + 16} ${y + 22} M${x + 21} ${y + 10} L${x + 19} ${y + 21}" ${common}/></g>`;
  }
  if (name === "import") {
    return `<g><path d="M${x + 15} ${y + 5} V${y + 21}" ${common}/><path d="M${x + 9} ${y + 15} L${x + 15} ${y + 21} L${x + 21} ${y + 15}" ${common}/><path d="M${x + 6} ${y + 25} H${x + 24}" ${common}/></g>`;
  }
  if (name === "files") {
    return `<g><path d="M${x + 8} ${y + 6} H${x + 18} L${x + 24} ${y + 12} V${y + 26} H${x + 8} Z" ${common}/><path d="M${x + 18} ${y + 6} V${y + 12} H${x + 24}" ${common}/></g>`;
  }
  if (name === "qa") {
    return `<g><path d="M${x + 6} ${y + 8} H${x + 24} V${y + 21} H${x + 14} L${x + 9} ${y + 26} V${y + 21} H${x + 6} Z" ${common}/><path d="M${x + 11} ${y + 13} H${x + 20} M${x + 11} ${y + 17} H${x + 17}" ${common}/></g>`;
  }
  if (name === "clean") {
    return `<g><path d="M${x + 15} ${y + 5} L${x + 25} ${y + 15} L${x + 15} ${y + 25} L${x + 5} ${y + 15} Z" ${common}/><path d="M${x + 15} ${y + 10} V${y + 20} M${x + 10} ${y + 15} H${x + 20}" ${common}/></g>`;
  }
  return `<g><circle cx="${x + 15}" cy="${y + 15}" r="9" ${common} fill="none"/><path d="M${x + 15} ${y + 10} V${y + 15} L${x + 19} ${y + 18}" ${common}/></g>`;
}

function brandLogo(x, y) {
  return `
    <g transform="translate(${x},${y})">
      <path d="M2 6.2 C2 4.6 3.7 3.6 5.1 4.4 L13.2 9.1 V22.8 L4.5 18.3 C3 17.6 2 16.1 2 14.4 V6.2Z" fill="#63D995"/>
      <path d="M26 6.2 C26 4.6 24.3 3.6 22.9 4.4 L14.8 9.1 V22.8 L23.5 18.3 C25 17.6 26 16.1 26 14.4 V6.2Z" fill="#4FC383"/>
      <path d="M5.2 4.5 L14 9.5 L22.8 4.5 L14 1.8 L5.2 4.5Z" fill="#8AF0B5"/>
      <path d="M13.2 9.1 L14 9.5 L14.8 9.1 V22.8 L14 23.2 L13.2 22.8 V9.1Z" fill="#2F8C63" opacity="0.78"/>
    </g>`;
}

function navItem(label, iconName, y, active, theme) {
  const bg = active ? theme.active : theme.sidebar;
  const c = active ? theme.accent : theme.muted;
  return `
    ${rect(58, y, 192, 38, 10, bg)}
    ${icon(iconName, 72, y + 4, c)}
    ${text(112, y + 24, label, 13, active ? theme.text : theme.muted, 700)}`;
}

function shell(theme, title, subtitle, active, main, right = "", bottom = "") {
  const navs = [
    ["图谱", "graph", "graph"],
    ["快捷导入", "import", "import"],
    ["源资料", "files", "sources"],
    ["问答搜索", "qa", "qa"],
    ["污染治理", "clean", "govern"],
    ["模型配置", "model", "model"],
  ];
  return svgRoot(`
    ${rect(0, 0, 1440, 900, 24, theme.desktop)}
    ${rect(42, 36, 1356, 828, 18, theme.window, theme.border, `filter="url(#shadow)"`)}
    ${rect(42, 36, 1356, 62, 18, theme.titlebar)}
    <line x1="42" y1="98" x2="1398" y2="98" stroke="${theme.border}"/>
    ${circle(68, 66, 6, "#FF5F57")}${circle(88, 66, 6, "#FEBC2E")}${circle(108, 66, 6, "#28C840")}
    ${brandLogo(132, 52)}
    ${text(170, 71, "Local Memory Hub", 14, theme.text, 700)}
    ${rect(542, 50, 356, 34, 17, theme.surface, theme.borderStrong)}
    ${circle(562, 67, 5, theme.muted)}
    ${text(580, 72, "搜索，或向本地记忆提问", 13, theme.muted)}
    ${rect(1152, 50, 138, 34, 17, theme.surface, theme.borderStrong)}
    ${circle(1172, 67, 5, theme.success)}
    ${text(1190, 72, "模型已连接", 12, theme.text, 700)}
    ${rect(1304, 50, 72, 34, 17, theme.surface, theme.borderStrong)}
    ${text(1322, 72, "队列 3", 12, theme.muted, 700)}
    ${rect(42, 98, 224, 766, 0, theme.sidebar)}
    <line x1="266" y1="98" x2="266" y2="864" stroke="${theme.border}"/>
    ${text(68, 148, "记忆库", 22, theme.text, 800)}
    ${text(68, 170, "本地数据可升级保留", 12, theme.muted)}
    ${navs.map((n, i) => navItem(n[0], n[1], 206 + i * 44, active === n[2], theme)).join("")}
    ${rect(60, 774, 188, 42, 13, theme.accent)}
    ${text(124, 800, "快捷导入", 14, theme.buttonText, 800)}
    <text x="66" y="844" class="mono" font-size="11" fill="${theme.muted}">~/Library/LocalMemory</text>
    ${rect(266, 98, 1132, 766, 0, theme.content)}
    ${text(294, 154, title, 26, theme.text, 800)}
    ${text(294, 178, subtitle, 13, theme.muted)}
    ${main}
    ${right}
    ${bottom}
  `);
}

function homepage(theme) {
  const edges = [
    [676,448,546,370,1],[676,448,814,352,1],[676,448,884,474,1],[676,448,704,582,1],[676,448,512,520,1],
    [546,370,414,328,0],[546,370,560,454,0],[512,520,380,620,0],[704,582,594,544,0],[814,352,966,286,0],
    [884,474,1016,558,0],[966,412,1052,324,0],[380,514,486,514,0],[414,328,618,250,0],[780,282,814,352,0],
  ];
  const nodes = [
    [676,448,16,"AI记忆系统",1],[546,370,8,"飞书"],[814,352,8,"视频摘录"],[884,474,9,"源文件"],[704,582,7,"清洗脚本"],
    [512,520,7,"产品想法"],[966,412,6,"模型配置"],[956,604,6,"污染数据"],[380,514,4,""],[410,620,4,""],
    [594,544,4,""],[780,282,3,""],[1040,664,3,""],[650,276,3,""],[560,250,3,""],[388,346,3,""],
  ];
  const graph = `
    ${rect(294, 202, 774, 500, 18, theme.panel, theme.border)}
    ${text(316, 240, "图谱探索", 15, theme.text, 700)}
    ${["全部", "文档", "视频", "源文件", "污染隔离"].map((v, i) => rect(398 + i * 76, 216, i === 4 ? 88 : 58, 32, 16, i === 0 ? theme.active : theme.surface, theme.borderStrong) + text(416 + i * 76, 237, v, 12, i === 0 ? theme.text : theme.muted, 700)).join("")}
    ${edges.map(e => `<line x1="${e[0]}" y1="${e[1]}" x2="${e[2]}" y2="${e[3]}" stroke="${e[4] ? theme.graph : theme.borderStrong}" stroke-opacity="${e[4] ? .38 : .48}"/>`).join("")}
    ${nodes.map(n => `${n[4] ? circle(n[0], n[1], 24, theme.accent, .13) : ""}${circle(n[0], n[1], n[2] / 2, n[4] ? theme.accent : theme.node)}${n[3] ? text(n[0] + 13, n[1] + 5, n[3], 12, n[4] ? theme.text : theme.muted, n[4] ? 800 : 600) : ""}`).join("")}
    ${rect(316, 644, 180, 36, 18, theme.surface, theme.borderStrong)}
    ${text(338, 667, "− + 适配 筛选 局部", 12, theme.muted, 700)}
  `;
  const right = `
    ${rect(1090, 202, 280, 500, 18, theme.panel, theme.border)}
    ${text(1112, 240, "问答入口", 15, theme.text, 700)}
    ${text(1112, 270, "优先用本地索引和原文片段，", 12, theme.muted)}
    ${text(1112, 288, "必要时请求外部模型。", 12, theme.muted)}
    ${rect(1112, 296, 236, 36, 18, theme.active, theme.borderStrong)}
    ${text(1204, 319, "问这个记忆库", 12, theme.text, 800, `text-anchor="middle"`)}
    <line x1="1112" y1="356" x2="1348" y2="356" stroke="${theme.border}"/>
    ${text(1112, 398, "节点详情", 15, theme.text, 700)}
    ${text(1112, 438, "AI记忆系统", 24, theme.text, 800)}
    ${text(1112, 466, "5 个源文件，42 个片段，12 条关系。", 12, theme.muted)}
    ${[[1112,"5","源文件"],[1194,"42","片段"],[1276,"12","关系"]].map(m => rect(m[0],494,70,62,14,theme.content,theme.border) + text(m[0]+35,526,m[1],20,theme.text,800,`text-anchor="middle"`) + text(m[0]+35,546,m[2],12,theme.muted,500,`text-anchor="middle"`)).join("")}
    ${text(1112, 596, "相关记忆", 13, theme.text, 700)}
    ${rect(1112, 614, 236, 32, 12, theme.content, theme.border)}${text(1126, 635, "飞书字段映射", 12, theme.muted)}
    ${rect(1112, 656, 236, 32, 12, theme.content, theme.border)}${text(1126, 677, "视频摘要进入索引", 12, theme.muted)}
  `;
  const bottom = `
    ${rect(294, 724, 774, 104, 18, theme.panel, theme.border)}
    ${text(316, 762, "最近导入流", 14, theme.text, 700)}
    ${sourceMini(316, "产品想法.md", "飞书 · 解析成功 · 已入记忆", theme, true)}
    ${sourceMini(560, "AI记忆系统.mp4", "视频链接 · 本地解析中", theme)}
    ${sourceMini(804, "草稿.txt", "本地文件 · 等待模型兜底", theme)}
    ${rect(1090, 724, 280, 104, 18, theme.panel, theme.border)}
    ${text(1112, 762, "系统状态", 14, theme.text, 700)}
    ${statusRows(theme)}
  `;
  return shell(theme, "记忆工作台", "让资料进入、被理解、可追溯，并以图谱方式探索。", "graph", graph, right, bottom);
}

function sourceMini(x, title, sub, theme, active = false) {
  return `${rect(x, 770, 224, 44, 14, theme.surface, theme.borderStrong)}
    ${circle(x + 16, 792, 5, active ? theme.accent : theme.node)}
    ${text(x + 32, 789, title, 12, theme.text, 800)}
    ${text(x + 32, 807, sub, 11, theme.muted)}`;
}

function statusRows(theme) {
  return `${text(1112, 790, "可信进入", 12, theme.muted)}${text(1314, 790, "92%", 12, theme.text, 800)}
    ${text(1112, 812, "向量索引", 12, theme.muted)}${text(1314, 812, "正常", 12, theme.text, 800)}
    ${text(1112, 834, "污染隔离", 12, theme.muted)}${text(1314, 834, "2 条", 12, theme.danger, 800)}`;
}

function importPage(theme) {
  const cards = [
    ["飞书文档", "粘贴分享链接或授权导入空间文档", "支持文档/表格/知识库"],
    ["有道云笔记", "导入笔记本、单篇文档或公开链接", "保留源链接和更新时间"],
    ["视频链接", "B站、抖音、小红书等分享链接一键录入", "本地解析失败后模型兜底"],
    ["本地文件", "拖入 PDF、Markdown、文本、图片或视频", "源文件原样保存"],
  ];
  const main = `
    ${rect(294, 202, 774, 626, 18, theme.panel, theme.border)}
    ${text(316, 242, "选择导入方式", 18, theme.text, 800)}
    ${text(316, 270, "第一版优先保证资料可信进入系统，并保留源文件追溯。", 13, theme.muted)}
    ${cards.map((c, i) => {
      const x = 316 + (i % 2) * 364;
      const y = 316 + Math.floor(i / 2) * 150;
      return `${rect(x, y, 330, 118, 16, theme.surface, theme.borderStrong)}
        ${icon(i === 0 ? "files" : i === 1 ? "qa" : i === 2 ? "graph" : "import", x + 24, y + 24, theme.accent)}
        ${text(x + 74, y + 46, c[0], 16, theme.text, 800)}
        ${text(x + 74, y + 72, c[1], 12, theme.muted)}
        ${text(x + 74, y + 94, c[2], 11, theme.muted)}`;
    }).join("")}
    ${rect(316, 640, 730, 142, 18, theme.content, theme.border)}
    ${text(342, 680, "解析循环", 16, theme.text, 800)}
    ${text(342, 708, "本地脚本优先解析。失败时调用模型 API，整理出新规则后沉淀为下一次本地解析能力。", 13, theme.muted)}
    ${["本地解析", "模型兜底", "规则沉淀", "下次复用"].map((s, i) => `${circle(362 + i * 166, 748, 7, i === 0 ? theme.accent : theme.node)}${text(382 + i * 166, 753, s, 13, theme.text, 700)}${i < 3 ? `<line x1="${430 + i * 166}" y1="748" x2="${510 + i * 166}" y2="748" stroke="${theme.borderStrong}"/>` : ""}`).join("")}
  `;
  const right = `
    ${rect(1090, 202, 280, 626, 18, theme.panel, theme.border)}
    ${text(1112, 242, "快捷录入", 18, theme.text, 800)}
    ${text(1112, 274, "支持从聊天软件发送文本、截图、文件和视频到本地解析。", 12, theme.muted)}
    ${["微信文件助手", "飞书机器人", "系统分享菜单", "剪贴板监听"].map((s, i) => `${rect(1112, 326 + i * 54, 236, 38, 12, theme.surface, theme.borderStrong)}${text(1130, 350 + i * 54, s, 13, theme.text, 700)}`).join("")}
    <line x1="1112" y1="570" x2="1348" y2="570" stroke="${theme.border}"/>
    ${text(1112, 612, "导入后状态", 15, theme.text, 700)}
    ${text(1112, 642, "源文件保存", 12, theme.muted)}${text(1290, 642, "必须", 12, theme.text, 800)}
    ${text(1112, 670, "自动分类", 12, theme.muted)}${text(1290, 670, "建议", 12, theme.text, 800)}
    ${text(1112, 698, "入记忆", 12, theme.muted)}${text(1290, 698, "可控", 12, theme.text, 800)}
  `;
  return shell(theme, "快捷导入", "一键把外部资料、本地文件、视频链接送进本地记忆系统。", "import", main, right);
}

function sourcesPage(theme) {
  const rows = [
    ["产品想法.md", "飞书", "文档", "解析成功", "已入记忆", "今天 22:10"],
    ["AI记忆系统.mp4", "视频链接", "视频", "本地解析中", "待入", "今天 21:48"],
    ["草稿.txt", "本地文件", "文本", "需模型兜底", "未入", "昨天 18:31"],
    ["会议纪要.pdf", "有道云", "PDF", "解析成功", "已入记忆", "周一 09:12"],
  ];
  const main = `
    ${rect(294, 202, 1076, 626, 18, theme.panel, theme.border)}
    ${text(316, 242, "源资料库", 18, theme.text, 800)}
    ${text(316, 270, "按文件夹、日期、类型、来源、处理状态和入记忆状态检索源文件。", 13, theme.muted)}
    ${rect(316, 310, 520, 40, 20, theme.surface, theme.borderStrong)}${text(342, 335, "搜索源文件、文件夹、来源或标签", 13, theme.muted)}
    ${["全部", "文档", "视频", "图片", "解析失败", "未入记忆"].map((v,i)=>`${rect(316 + i * 88, 374, i > 3 ? 78 : 68, 32, 16, i===0?theme.active:theme.surface, theme.borderStrong)}${text(338 + i * 88, 395, v, 12, i===0?theme.text:theme.muted, 700)}`).join("")}
    ${rect(316, 430, 1010, 1, 0, theme.border)}
    ${["文件", "来源", "类型", "处理状态", "入记忆", "日期"].map((h,i)=>text([316,566,700,820,982,1120][i], 462, h, 12, theme.muted, 700)).join("")}
    ${rows.map((r, idx) => {
      const y = 500 + idx * 66;
      return `${rect(316, y - 30, 1010, 52, 12, idx % 2 ? theme.panel : theme.content, theme.border)}
        ${text(336, y, r[0], 13, theme.text, 800)}
        ${text(566, y, r[1], 12, theme.muted)}
        ${text(700, y, r[2], 12, theme.muted)}
        ${text(820, y, r[3], 12, r[3].includes("成功") ? theme.success : r[3].includes("兜底") ? theme.warning : theme.muted, 800)}
        ${text(982, y, r[4], 12, r[4].includes("已") ? theme.success : theme.muted, 800)}
        ${text(1120, y, r[5], 12, theme.muted)}`;
    }).join("")}
    ${rect(316, 764, 180, 38, 13, theme.accent)}${text(368, 789, "打开源文件夹", 13, theme.buttonText, 800)}
    ${rect(512, 764, 180, 38, 13, theme.surface, theme.borderStrong)}${text(562, 789, "重新解析选中", 13, theme.text, 800)}
  `;
  return shell(theme, "源资料", "源文件必须能被检索、排序和追溯，且清楚显示是否进入记忆系统。", "sources", main);
}

function governancePage(theme) {
  const main = `
    ${rect(294, 202, 774, 626, 18, theme.panel, theme.border)}
    ${text(316, 242, "污染治理", 18, theme.text, 800)}
    ${text(316, 270, "删除或隔离污染数据时，必须能追溯源文件、向量片段和图谱关系。", 13, theme.muted)}
    ${rect(316, 318, 730, 120, 16, theme.surface, theme.borderStrong)}
    ${text(342, 356, "疑似污染源", 15, theme.text, 800)}
    ${text(342, 384, "AI记忆系统.mp4 / 自动摘要片段 #18", 13, theme.muted)}
    ${text(342, 412, "原因：低置信度摘要进入图谱，影响 3 个节点、9 条向量片段。", 12, theme.danger, 800)}
    ${["仅隔离记忆", "删除向量", "删除图谱关系", "同步删除源文件"].map((s,i)=>`${rect(316, 480+i*58, 730, 42, 12, theme.content, theme.border)}${circle(340,501+i*58,6,i<3?theme.accent:theme.danger)}${text(360,506+i*58,s,13,theme.text,800)}${text(900,506+i*58,i<3?"可恢复":"危险操作",12,i<3?theme.muted:theme.danger,800)}`).join("")}
  `;
  const right = `
    ${rect(1090, 202, 280, 626, 18, theme.panel, theme.border)}
    ${text(1112, 242, "影响范围", 18, theme.text, 800)}
    ${[["源文件", "1"], ["向量片段", "9"], ["图谱关系", "3"], ["问答缓存", "2"]].map((r,i)=>`${rect(1112, 292+i*70, 236, 52, 12, theme.surface, theme.borderStrong)}${text(1130, 323+i*70,r[0],13,theme.muted,600)}${text(1318,323+i*70,r[1],16,theme.text,800,`text-anchor="middle"` )}`).join("")}
    ${rect(1112, 620, 236, 42, 13, theme.danger)}${text(1192, 647, "确认删除污染", 13, theme.buttonText, 800)}
    ${rect(1112, 678, 236, 42, 13, theme.surface, theme.borderStrong)}${text(1200, 705, "只隔离", 13, theme.text, 800)}
  `;
  return shell(theme, "污染治理", "治理污染记忆，明确删除范围，避免错误记忆长期影响问答。", "govern", main, right);
}

function qaPage(theme) {
  const main = `
    ${rect(294, 202, 774, 626, 18, theme.panel, theme.border)}
    ${text(316, 242, "问答搜索", 18, theme.text, 800)}
    ${rect(316, 282, 730, 52, 18, theme.surface, theme.borderStrong)}
    ${text(342, 314, "这套本地记忆系统应该先做哪些功能？", 15, theme.text, 700)}
    ${rect(316, 374, 730, 162, 16, theme.content, theme.border)}
    ${text(342, 414, "回答", 15, theme.text, 800)}
    ${text(342, 444, "第一阶段应该优先保证资料可信进入系统，其次是解析循环和搜索问答。图谱可以作为首页探索入口，但治理能力必须和源文件追溯绑定。", 13, theme.muted)}
    ${rect(342, 484, 110, 32, 16, theme.active, theme.borderStrong)}${text(366, 505, "来自 5 个源", 12, theme.text, 800)}
    ${text(316, 586, "引用片段", 15, theme.text, 800)}
    ${["PRD / 先让资料可信进入系统", "导入设计 / 本地解析失败后模型兜底", "治理设计 / 删除源文件时选择是否删除向量和图谱"].map((s,i)=>`${rect(316, 616+i*56, 730, 40, 12, theme.surface, theme.borderStrong)}${text(338, 641+i*56,s,13,theme.text,700)}`).join("")}
  `;
  const right = `
    ${rect(1090, 202, 280, 626, 18, theme.panel, theme.border)}
    ${text(1112, 242, "搜索模式", 18, theme.text, 800)}
    ${["仅本地", "本地 + 外部模型", "仅源文件检索"].map((s,i)=>`${rect(1112, 292+i*54, 236, 38, 12, i===1?theme.active:theme.surface, theme.borderStrong)}${text(1132,316+i*54,s,13,i===1?theme.text:theme.muted,800)}`).join("")}
    <line x1="1112" y1="480" x2="1348" y2="480" stroke="${theme.border}"/>
    ${text(1112, 522, "模型 Provider", 15, theme.text, 800)}
    ${["DeepSeek", "通义千问", "OpenAI", "Claude"].map((s,i)=>`${rect(1112, 552+i*44, 236, 32, 12, theme.surface, theme.borderStrong)}${text(1130,573+i*44,s,12,theme.text,700)}${circle(1326,568+i*44,5,i<2?theme.success:theme.node)}`).join("")}
  `;
  return shell(theme, "问答搜索", "结合源文件检索、向量搜索和模型请求，给出可追溯回答。", "qa", main, right);
}

const pages = [
  ["homepage", homepage],
  ["quick-import", importPage],
  ["source-library", sourcesPage],
  ["governance", governancePage],
  ["qa-search", qaPage],
];

for (const [page, render] of pages) {
  for (const theme of Object.values(themes)) {
    const svg = render(theme);
    const svgPath = path.join(outDir, `${page}-${theme.suffix}-v1.svg`);
    const pngPath = path.join(outDir, `${page}-${theme.suffix}-v1.png`);
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lmh-chrome-"));
    fs.writeFileSync(svgPath, svg);
    try {
      const result = spawnSync(chrome, [
        "--headless=new",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--no-first-run",
        "--no-default-browser-check",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=1000",
        "--hide-scrollbars",
        "--window-size=1440,900",
        `--user-data-dir=${userDataDir}`,
        `--screenshot=${pngPath}`,
        `file://${svgPath}`,
      ], { timeout: 15000 });
      if (result.error && !fs.existsSync(pngPath)) {
        throw result.error;
      }
      if (result.status && result.status !== 0 && !fs.existsSync(pngPath)) {
        throw new Error(result.stderr?.toString() || `Chrome exited with ${result.status}`);
      }
      console.log(pngPath);
    } finally {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
}
