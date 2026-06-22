const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const outDir = __dirname;
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const t = {
  bg: "#070B0F",
  window: "#0A1015",
  top: "#0B1116",
  side: "#0B1218",
  main: "#0D151B",
  panel: "#111A21",
  panel2: "#141F27",
  panel3: "#0F171D",
  line: "#26343D",
  line2: "#33444E",
  text: "#E7EEF3",
  muted: "#91A0AA",
  dim: "#65737D",
  accent: "#31D49B",
  accent2: "#22BFA9",
  accentSoft: "#103D35",
  blue: "#5FA8FF",
  warn: "#D9A52C",
  danger: "#F25F5C",
  redSoft: "#3A1A1D",
  greenSoft: "#12372D",
  purple: "#B98CFF",
};

function root(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1440" height="900" viewBox="0 0 1440 900" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="appGlow" x1="0" y1="0" x2="1440" y2="900">
    <stop offset="0" stop-color="#17262F"/>
    <stop offset="0.38" stop-color="#0A1015"/>
    <stop offset="1" stop-color="#0B1116"/>
  </linearGradient>
  <linearGradient id="activeNav" x1="0" y1="0" x2="230" y2="0">
    <stop offset="0" stop-color="#164B41"/>
    <stop offset="1" stop-color="#17232A"/>
  </linearGradient>
  <linearGradient id="cardGlow" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#18252E"/>
    <stop offset="1" stop-color="#0F171D"/>
  </linearGradient>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
    <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#000000" flood-opacity="0.28"/>
  </filter>
  <style>
    .cn { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', 'Noto Sans SC', sans-serif; }
    .mono { font-family: 'SF Mono', ui-monospace, Menlo, monospace; }
  </style>
</defs>
${body}
</svg>`;
}

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const rect = (x, y, w, h, r, fill, stroke = "", extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ""} ${extra}/>`;
const text = (x, y, v, size = 13, fill = t.text, weight = 500, extra = "") => `<text x="${x}" y="${y}" class="cn" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${esc(v)}</text>`;
const mono = (x, y, v, size = 12, fill = t.muted, weight = 500, extra = "") => `<text x="${x}" y="${y}" class="mono" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${esc(v)}</text>`;
const circle = (x, y, r, fill, opacity = 1, stroke = "") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${opacity}"${stroke ? ` stroke="${stroke}"` : ""}/>`;
const line = (x1, y1, x2, y2, color = t.line, opacity = 1, width = 1) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${width}"/>`;

function logo(x, y) {
  return `<g transform="translate(${x},${y})">
    <path d="M14 2 L26 8.5 V21.5 L14 28 L2 21.5 V8.5 L14 2Z" fill="#23D391"/>
    <path d="M14 2 L26 8.5 L14 15 L2 8.5 L14 2Z" fill="#70F0B7"/>
    <path d="M2 8.5 L14 15 V28 L2 21.5 V8.5Z" fill="#1AA779"/>
    <path d="M26 8.5 L14 15 V28 L26 21.5 V8.5Z" fill="#22C98E"/>
    <path d="M14 15 L14 28" stroke="#0B6A53" stroke-width="1.4"/>
  </g>`;
}

function icon(name, x, y, color = t.muted) {
  const c = `stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`;
  if (name === "home") return `<g><path d="M${x+3} ${y+14} L${x+14} ${y+5} L${x+25} ${y+14}" ${c}/><path d="M${x+7} ${y+13} V${y+25} H${x+21} V${y+13}" ${c}/></g>`;
  if (name === "graph") return `<g>${circle(x+7,y+8,2.6,color)}${circle(x+22,y+7,2.6,color)}${circle(x+18,y+22,2.6,color)}<path d="M${x+9} ${y+9} L${x+20} ${y+7} M${x+8} ${y+10} L${x+16} ${y+20} M${x+21} ${y+10} L${x+19} ${y+20}" ${c}/></g>`;
  if (name === "files") return `<g><path d="M${x+7} ${y+6} H${x+17} L${x+23} ${y+12} V${y+25} H${x+7} Z" ${c}/><path d="M${x+17} ${y+6} V${y+12} H${x+23}" ${c}/></g>`;
  if (name === "qa") return `<g><path d="M${x+6} ${y+8} H${x+24} V${y+20} H${x+14} L${x+9} ${y+25} V${y+20} H${x+6} Z" ${c}/><path d="M${x+11} ${y+13} H${x+20} M${x+11} ${y+17} H${x+17}" ${c}/></g>`;
  if (name === "import") return `<g><path d="M${x+15} ${y+5} V${y+20}" ${c}/><path d="M${x+9} ${y+14} L${x+15} ${y+20} L${x+21} ${y+14}" ${c}/><path d="M${x+6} ${y+25} H${x+24}" ${c}/></g>`;
  if (name === "tag") return `<g><path d="M${x+7} ${y+7} H${x+18} L${x+24} ${y+13} L${x+14} ${y+24} L${x+4} ${y+14} Z" ${c}/>${circle(x+15,y+11,1.8,color)}</g>`;
  if (name === "shield") return `<g><path d="M${x+15} ${y+5} L${x+24} ${y+9} V${y+16} C${x+24} ${y+22} ${x+20} ${y+25} ${x+15} ${y+27} C${x+10} ${y+25} ${x+6} ${y+22} ${x+6} ${y+16} V${y+9} Z" ${c}/><path d="M${x+11} ${y+16} L${x+14} ${y+19} L${x+20} ${y+12}" ${c}/></g>`;
  if (name === "db") return `<g><ellipse cx="${x+15}" cy="${y+8}" rx="9" ry="4" ${c}/><path d="M${x+6} ${y+8} V${y+22} C${x+6} ${y+27} ${x+24} ${y+27} ${x+24} ${y+22} V${y+8} M${x+6} ${y+15} C${x+6} ${y+20} ${x+24} ${y+20} ${x+24} ${y+15}" ${c}/></g>`;
  return `<g><circle cx="${x+15}" cy="${y+15}" r="9" ${c}/><path d="M${x+15} ${y+10} V${y+15} L${x+19} ${y+18}" ${c}/></g>`;
}

function navItem(label, name, y, active) {
  return `${active ? rect(12, y - 12, 206, 44, 8, "url(#activeNav)") : ""}
    ${active ? rect(12, y - 12, 3, 44, 2, t.accent) : ""}
    ${icon(name, 26, y - 4, active ? t.accent : "#B5C0C8")}
    ${text(66, y + 17, label, 14, active ? "#BFFFE7" : "#BCC7CF", active ? 800 : 600)}`;
}

function shell(active, title, subtitle, main, right = "", section = "数据管理") {
  const nav = [
    ["概览", "home", "home"],
    ["图谱", "graph", "graph"],
    ["源资料库", "files", "sources"],
    ["搜索与问答", "qa", "qa"],
    ["导入中心", "import", "import"],
    ["污染治理", "shield", "govern"],
    ["向量索引", "db", "vector"],
    ["标签管理", "tag", "tag"],
  ];
  return root(`
    ${rect(0,0,1440,900,10,t.bg)}
    ${rect(2,2,1436,896,10,"url(#appGlow)",t.line2)}
    ${rect(2,2,1436,42,10,t.top)}
    ${circle(20,24,6,"#FF5F57")}${circle(40,24,6,"#FFBD2E")}${circle(60,24,6,"#28C840")}
    ${logo(82,11)}${text(122,30,"Local Memory Hub",14,t.text,800)}
    ${rect(580,10,300,34,16,"#0B1116",t.line2)}
    ${circle(600,27,6,"none",1,t.muted)}${line(604,31,610,37,t.muted,1,1.5)}
    ${text(626,31,"搜索记忆、节点、标签…",13,t.muted,500)}${mono(836,31,"⌘K",11,t.muted,700)}
    ${text(1328,29,"—",18,t.muted)}${rect(1364,18,10,10,1,"none",t.muted)}${line(1407,18,1398,28,t.muted,1,1.3)}${line(1398,18,1407,28,t.muted,1,1.3)}
    ${rect(2,44,226,854,0,t.side)}${line(228,44,228,898,t.line2)}
    ${text(28,92,"工作区",12,t.dim,500)}
    ${nav.slice(0,5).map((n,i)=>navItem(n[0],n[1],112+i*48,active===n[2])).join("")}
    ${line(28,366,208,366,t.line)}
    ${text(28,406,section,12,t.dim,500)}
    ${nav.slice(5).map((n,i)=>navItem(n[0],n[1],426+i*48,active===n[2])).join("")}
    ${line(28,704,208,704,t.line)}
    ${text(28,740,"本地存储",12,t.muted,600)}
    ${rect(28,758,180,7,4,"#1D2B33")}${rect(28,758,64,7,4,t.accent)}
    ${text(28,786,"482.6 GB / 1.0 TB",12,t.muted,500)}
    ${circle(36,842,16,"#375B4E")}${text(31,847,"L",13,"#E8FFF4",800)}${text(66,840,"Local User",13,t.text,700)}${text(66,860,"本地模式",11,t.accent,700)}
    ${rect(228,44,1210,854,0,t.main)}
    ${text(254,92,title,24,t.text,900)}
    ${text(254,118,subtitle,13,t.muted,500)}
    ${main}
    ${right}
  `);
}

function statusPill(x, y, label, kind = "ok") {
  const fill = kind === "bad" ? t.redSoft : kind === "warn" ? "#35280B" : t.greenSoft;
  const color = kind === "bad" ? "#FF7773" : kind === "warn" ? "#E7B64A" : "#6AF2B7";
  return `${rect(x,y,64,22,5,fill)}${text(x+32,y+15,label,11,color,800,'text-anchor="middle"')}`;
}

function graphPage() {
  const edges = [
    [616,430,500,350],[616,430,740,334],[616,430,850,454],[616,430,632,575],[616,430,470,530],[500,350,395,305],[500,350,450,430],[740,334,870,272],[850,454,1020,530],[632,575,540,686],[632,575,770,716],[470,530,350,610],[740,334,706,210],[616,430,1012,380],
  ];
  const nodes = [
    [616,430,35,"《人工智能：一种现代的方法》.pdf",t.blue,1],[500,350,18,"机器学习基础",t.blue],[740,334,18,"搜索算法",t.blue],[850,454,16,"SVM",t.blue],[632,575,17,"自然语言处理",t.blue],[470,530,16,"反向传播算法",t.accent],[395,305,17,"深度学习 第6章",t.accent],[350,610,15,"AlphaGo论文",t.accent],[540,686,16,"Attention机制",t.accent],[770,716,18,"Transformer结构原理",t.blue],[1020,530,18,"聚类算法 K-Means",t.blue],[1012,380,15,"统计学习方法",t.accent],[706,210,16,"神经网络基础",t.blue],
  ];
  const main = `
    ${rect(254,144,804,44,8,"#0E171D",t.line2)}
    ${rect(270,154,34,26,6,t.accentSoft,t.line2)}${icon("graph",273,152,t.accent)}
    ${rect(312,154,34,26,6,t.panel3,t.line2)}${icon("home",315,152,t.muted)}
    ${rect(354,154,34,26,6,t.panel3,t.line2)}${icon("tag",357,152,t.muted)}
    ${rect(742,154,150,28,6,t.panel3,t.line2)}${text(766,173,"布局：力导向",12,t.muted,700)}
    ${rect(904,154,130,28,6,t.panel3,t.line2)}${text(928,173,"关系筛选",12,t.muted,700)}
    ${rect(254,200,804,646,12,"#0A1116",t.line2)}
    ${edges.map(e=>line(e[0],e[1],e[2],e[3],"#71808A",0.46,1.2)).join("")}
    ${nodes.map(n=>`${circle(n[0],n[1],n[2],n[4],0.18,n[4])}${circle(n[0],n[1],Math.max(5,n[2]/3),n[4],0.95)}${text(n[0],n[1]+n[2]+20,n[3],12,n[5]? "#55D6FF" : "#C8D2D8",700,'text-anchor="middle"')}`).join("")}
    ${rect(274,732,132,128,8,"#0C151B",t.line2)}
    ${edges.slice(0,9).map(e=>line(340+(e[0]-616)*.12,795+(e[1]-430)*.12,340+(e[2]-616)*.12,795+(e[3]-430)*.12,"#65757F",0.35,1)).join("")}
    ${nodes.slice(0,9).map(n=>circle(340+(n[0]-616)*.12,795+(n[1]-430)*.12,3,n[4],0.8)).join("")}
    ${rect(292,782,62,34,3,"none","#19BFE0")}
  `;
  const right = `
    ${line(1078,44,1078,898,t.line2)}
    ${text(1100,92,"节点详情",18,t.text,900)}${text(1354,92,"×",28,t.muted,300)}
    ${circle(1138,190,38,"#172638",1,"#557899")}${icon("files",1124,176,"#8DC2FF")}
    ${text(1192,166,"《人工智能：一种现代的方法》.pdf",18,t.text,900)}
    ${statusPill(1192,182,"源资料","ok")}${text(1192,224,"本地文件 · PDF · 87.4 MB",13,t.muted)}
    ${text(1192,250,"添加时间：2024-05-12 14:32",12,t.muted)}
    ${line(1100,304,1408,304,t.line2)}
    ${text(1100,342,"源资料",14,t.accent,800)}${text(1222,342,"文本片段",14,t.muted,600)}${text(1340,342,"向量索引",14,t.muted,600)}
    ${rect(1100,356,74,2,1,t.accent)}
    ${text(1100,400,"文件路径",13,t.text,800)}${text(1100,428,"D:\\Memory\\Books\\人工智能方法.pdf",12,t.muted)}
    ${text(1100,468,"处理状态",13,t.text,800)}
    ${circle(1112,506,10,"none",1,t.accent)}${text(1134,512,"解析成功",14,t.text,700)}${text(1342,512,"14:33",12,t.muted)}
    ${circle(1112,548,10,"none",1,t.accent)}${text(1134,554,"已入记忆",14,t.text,700)}${text(1342,554,"14:34",12,t.muted)}
    ${circle(1112,590,10,"none",1,t.warn)}${text(1134,596,"可隔离源资料",14,t.warn,800)}${rect(1330,574,58,30,6,"none",t.warn)}${text(1359,594,"隔离",12,t.warn,800,'text-anchor="middle"')}
    ${line(1100,638,1408,638,t.line2)}
    ${text(1100,678,"相关统计",14,t.text,800)}
    ${[["文本片段","1,842"],["向量数量","1,842"],["关联节点","23"]].map((m,i)=>`${text(1158+i*104,720,m[0],12,t.muted,500,'text-anchor="middle"')}${text(1158+i*104,750,m[1],16,t.text,800,'text-anchor="middle"')}${i<2?line(1210+i*104,698,1210+i*104,760,t.line2):""}`).join("")}
  `;
  return shell("graph", "知识图谱", "图谱是首页：用于探索记忆关系，同时可追溯源文件、向量和文本片段。", main, right);
}

function sourcesPage() {
  const rows = [
    ["产品资料","2025-05-22 10:15","文件夹","本地导入","已完成","已入记忆","全部成功","可追溯","folder"],
    ["用户手册_v2.1.pdf","2025-05-21 14:33","PDF","本地导入","已完成","已入记忆","成功","可追溯","pdf"],
    ["竞品分析报告.docx","2025-05-20 16:08","DOCX","本地导入","已完成","已入记忆","成功","可追溯","doc"],
    ["供应商报价单_2025Q2.pdf","2025-05-18 10:22","PDF","邮件导入","已完成","已入记忆","解析失败","部分不可追溯","pdf"],
    ["会议纪要_0515.txt","2025-05-15 17:21","TXT","本地导入","已完成","已入记忆","成功","可追溯","txt"],
    ["技术方案_v3.txt","2025-05-08 11:02","TXT","本地导入","处理中","未入记忆","—","—","txt"],
    ["客户案例集.pdf","2025-05-04 09:33","PDF","本地导入","已隔离","未入记忆","解析失败","不可追溯","pdf"],
  ];
  const main = `
    ${rect(254,134,940,44,0,"none")}
    ${text(260,164,"源文件检索",14,t.accent,900)}${rect(256,176,84,2,1,t.accent)}
    ${text(372,164,"文件夹",14,t.muted,700)}
    ${line(254,188,1168,188,t.line2)}
    ${["日期：全部","类型：全部","来源：全部","处理状态：全部","是否入记忆：全部"].map((s,i)=>`${rect(254+i*120,210,i===4?132:110,30,5,t.panel3,t.line2)}${text(266+i*120,230,s,12,t.muted,700)}`).join("")}
    ${rect(862,210,236,30,5,t.panel3,t.line2)}${circle(884,225,7,"none",1,t.muted)}${line(889,230,896,237,t.muted)}${text(910,230,"搜索文件名、内容或来源",12,t.dim,500)}
    ${rect(1108,210,40,30,5,t.panel2,t.line2)}${text(1128,230,"筛选",12,t.text,700,'text-anchor="middle"')}
    ${rect(254,262,914,38,0,"#19232A")}
    ${["文件名","日期","类型","来源","处理状态","是否入记忆","解析是否成功","可追溯状态"].map((h,i)=>text([298,462,610,690,780,878,982,1100][i],286,h,12,t.text,800)).join("")}
    ${rows.map((r,i)=>{const y=326+i*42; const selected=i===3; return `
      ${rect(254,y-25,914,40,0,selected?"#0F4039":(i%2?"#0D151B":"#111A21"),selected?t.accent:t.line)}
      ${rect(266,y-10,12,12,2,selected?t.accent:"none",selected?t.accent:t.line2)}${selected?text(269,y,"✓",10,"#05241E",900):""}
      ${text(298,y,r[0],12,selected?"#EFFFF8":t.text,700)}
      ${text(462,y,r[1],12,t.muted)}
      ${text(610,y,r[2],12,t.muted)}
      ${text(690,y,r[3],12,t.muted)}
      ${statusPill(780,y-16,r[4],r[4]==="已隔离"?"bad":r[4]==="处理中"?"warn":"ok")}
      ${statusPill(878,y-16,r[5],r[5]==="未入记忆"?"warn":"ok")}
      ${statusPill(982,y-16,r[6],r[6].includes("失败")?"bad":r[6]==="—"?"warn":"ok")}
      ${statusPill(1100,y-16,r[7],r[7].includes("不可")?"bad":r[7].includes("部分")?"warn":"ok")}
    `}).join("")}
    ${text(254,844,"共 1,248 条",12,t.muted)}${rect(768,820,28,28,5,t.accent)}${text(782,840,"1",13,"#05241E",900,'text-anchor="middle"')}${text(824,840,"2",12,t.muted)}${text(862,840,"3",12,t.muted)}${text(1096,840,"20 条/页",12,t.muted)}
  `;
  const right = `
    ${line(1180,44,1180,898,t.line2)}
    ${text(1202,92,"影响范围",20,t.text,900)}${text(1390,92,"×",24,t.muted)}
    ${rect(1202,132,196,64,5,"#30270F",t.warn)}${text(1224,158,"该源文件解析失败，删除或隔离",12,"#FFD76A",700)}${text(1224,178,"将影响下游关联数据。",12,"#FFD76A",700)}
    ${[["文本片段","312","files",t.danger],["向量索引","312","db",t.blue],["图谱节点","86","graph",t.purple]].map((m,i)=>`${rect(1202,218+i*122,196,94,6,t.panel2,t.line2)}${text(1220,248+i*122,m[0],15,t.text,900)}${text(1220,272+i*122,"由该文件生成或关联",11,t.muted)}${text(1220,302+i*122,m[1],24,"#FF7B76",900)}${icon(m[2],1348,240+i*122,m[3])}`).join("")}
    ${text(1202,614,"处理方式",14,t.text,900)}
    ${rect(1202,634,196,116,6,t.panel3,t.line2)}
    ${circle(1218,658,7,"none",1,t.danger)}${circle(1218,658,3,t.danger)}
    ${text(1236,662,"删除源文件",13,t.text,800)}
    ${rect(1236,690,12,12,2,t.danger)}${text(1254,701,"同时删除向量",12,t.muted)}
    ${rect(1236,720,12,12,2,t.danger)}${text(1254,731,"同时删除图谱",12,t.muted)}
    ${rect(1202,768,196,46,6,t.panel3,t.line2)}${circle(1218,792,8,"none",1,t.muted)}${text(1236,796,"仅隔离",13,t.muted,800)}
    ${rect(1202,844,88,36,5,t.panel2,t.line2)}${text(1246,867,"恢复",13,t.text,800,'text-anchor="middle"')}
    ${rect(1310,844,88,36,5,t.danger)}${text(1354,867,"删除",13,"#fff",900,'text-anchor="middle"')}
  `;
  return shell("sources", "源资料库", "源数据保存、分类、日期排序、源文件检索、入记忆状态和解析状态必须一屏可见。", main, right);
}

function qaPage() {
  const main = `
    ${text(276,170,"本地检索",14,t.accent,900)}${line(262,186,388,186,t.accent,1,2)}
    ${text(500,170,"向量搜索",14,t.text,700)}${line(390,170,478,170,t.muted,.45,1.5)}
    ${text(700,170,"回谱扩展",14,t.text,700)}${line(610,170,680,170,t.muted,.45,1.5)}
    ${text(920,170,"请求大模型",14,t.text,700)}${line(806,170,900,170,t.muted,.45,1.5)}
    ${text(1088,170,"无模型兜底",14,t.warn,900)}
    ${rect(254,214,674,82,8,t.panel2,t.line2)}${text(276,250,"2024 年中国新能源汽车市场的主要趋势是什么？有哪些关键数据和政策影响？",14,t.text,600)}
    ${rect(862,236,42,40,8,t.accent)}${text(883,262,"↗",20,"#06251F",900,'text-anchor="middle"')}
    ${rect(254,318,674,314,8,t.panel3,t.line2)}
    ${text(276,352,"回答（基于本地知识库）",14,t.text,900)}${circle(420,348,6,t.accent)}
    ${text(276,394,"2024 年中国新能源汽车市场呈现出高增长、结构优化和政策持续驱动的特点。",13,t.text)}
    ${text(276,432,"1. 市场规模持续增长：预计销量达到 1,280 万辆，同比约增长 35%。",13,t.text)}
    ${text(276,470,"2. 结构优化：纯电与插混双线提升，中高端车型销量占比扩大。",13,t.text)}
    ${text(276,508,"3. 政策影响：以旧换新补贴、地方购车优惠和充电设施建设推动需求释放。",13,t.text)}
    ${text(276,546,"4. 技术与产业链：电池效率、智能配置与供应链协同继续强化。",13,t.text)}
    ${text(276,608,"引用来源",13,t.text,900)}
    ${["中汽协_2024新能源销量.pdf","乘联会_市场分析报告.pdf","国务院_产业发展规划.pdf"].map((s,i)=>`${rect(276+i*202,638,188,38,6,t.panel2,t.line2)}${text(288+i*202,662,`[${i+1}] ${s}`,11,t.muted,700)}${rect(424+i*202,648,28,18,4,"#713C3B")}${text(438+i*202,661,"PDF",9,"#FFD6D4",800,'text-anchor="middle"')}`).join("")}
    ${rect(254,746,674,48,7,"#3B2B0B",t.warn)}${text(276,776,"未检测到可用大模型服务，已启用本地规则引擎兜底，回答基于检索内容生成。",12,"#FFD76A",800)}${rect(808,758,86,26,5,"none",t.warn)}${text(851,776,"去配置模型",12,"#FFD76A",800,'text-anchor="middle"')}
    ${rect(254,812,674,52,8,t.panel2,t.line2)}${text(276,844,"继续追问（Enter 发送，Shift+Enter 换行）",13,t.dim)}
  `;
  const right = `
    ${line(952,44,952,898,t.line2)}
    ${rect(972,46,434,852,12,"#111A21",t.line2)}
    ${text(994,92,"选择模型",18,t.text,900)}${text(1372,92,"×",24,t.muted)}
    ${text(994,144,"国内模型服务",12,t.muted,700)}
    ${[["DeepSeek","可用","#F6F8FF"],["通义千问","可用","#775CFF"],["豆包","可用","#D6F1FF"],["智谱 GLM","可用","#FFFFFF"],["Kimi","可用","#0A0A0A"]].map((m,i)=>`${rect(994,166+i*70,376,56,7,t.panel2,t.line2)}${circle(1028,194+i*70,20,m[2])}${text(1064,200+i*70,m[0],14,t.text,800)}${circle(1066,214+i*70,3,t.accent)}${text(1076,218+i*70,m[1],11,t.accent,700)}${text(1342,201+i*70,"⚙",16,t.muted)}`).join("")}
    ${text(994,548,"通用与本地模型服务",12,t.muted,700)}
    ${[["OpenAI-Compatible","可用"],["Ollama","可用"]].map((m,i)=>`${rect(994,570+i*70,376,56,7,t.panel2,t.line2)}${circle(1028,598+i*70,20,"#F4F4F2")}${text(1064,604+i*70,m[0],14,t.text,800)}${circle(1066,618+i*70,3,t.accent)}${text(1076,622+i*70,m[1],11,t.accent,700)}${text(1342,605+i*70,"⚙",16,t.muted)}`).join("")}
    ${rect(994,728,376,72,7,t.panel3,t.line2)}${text(1018,760,"本地保存 API Key",13,t.text,800)}${rect(1320,750,32,18,9,t.accent)}${circle(1342,759,7,"#FFFFFF")}
    ${text(1018,786,"API Key 仅保存在本地，不会上传或同步。",12,t.muted)}
    ${rect(994,820,376,40,6,t.panel2,t.line2)}${text(1182,845,"模型设置",13,t.text,800,'text-anchor="middle"')}
  `;
  return shell("qa", "搜索与问答", "先用本地检索和源资料引用回答；必要时请求外部模型，没有模型时提供本地兜底。", main, right);
}

function importPage() {
  const queue = [
    ["人工智能发展报告2024.pdf","24.6 MB · PDF","解析中 62%",t.blue],
    ["产品需求文档_v2.1.docx","2.1 MB · DOCX","解析中 28%",t.blue],
    ["https://mp.weixin.qq.com/s/abc123…","网页 · 1.2 MB","等待中",t.warn],
    ["设计系统使用指南.pdf","8.7 MB · PDF","等待重试",t.warn],
    ["会议纪要_2024-05-18.txt","56 KB · TXT","解析失败",t.danger],
  ];
  const main = `
    ${text(262,164,"快速导入",14,t.accent,900)}${rect(258,176,74,2,1,t.accent)}
    ${text(372,164,"导入历史",14,t.muted,700)}${text(486,164,"连接器管理",14,t.muted,700)}${text(620,164,"导入规则",14,t.muted,700)}
    ${line(254,188,930,188,t.line2)}
    ${[["文本","粘贴或输入文本内容","快速导入","T",t.accent],["文件","支持多种格式文档","批量导入","▣",t.blue],["分享链接","输入网页或分享链接","自动抓取内容","↗",t.muted]].map((m,i)=>`${rect(254+i*236,208,220,108,9,t.panel2,t.line2)}${rect(272+i*236,232,46,46,10,i===0?"#126249":i===1?"#1B4D89":"#29343C")}${text(295+i*236,264,m[3],28,m[4],900,'text-anchor="middle"')}${text(336+i*236,246,m[0],17,t.text,900)}${text(336+i*236,272,m[1],12,t.muted)}${text(336+i*236,294,m[2],12,t.muted)}`).join("")}
    ${rect(254,334,692,88,10,"#0D151B",t.line2,'stroke-dasharray="6 4"')}${text(600,374,"拖入文件或点击选择",16,t.text,900,'text-anchor="middle"')}${text(600,402,"支持 PDF、DOCX、TXT、MD、HTML、EPUB、图片等（单文件最大 200MB）",12,t.muted,500,'text-anchor="middle"')}${rect(842,362,84,34,6,"none",t.accent)}${text(884,384,"选择文件",13,t.accent,900,'text-anchor="middle"')}
    ${text(254,464,"外部文档",16,t.text,900)}
    ${[["飞书文档","导入飞书文档到本地","连接"],["有道云笔记","导入有道云笔记内容","连接"],["微信文件","导入本地微信接收的文件","打开目录"]].map((m,i)=>`${rect(254+i*236,482,220,118,9,t.panel2,t.line2)}${logo(274+i*236,506)}${text(336+i*236,522,m[0],15,t.text,900)}${text(336+i*236,550,m[1],12,t.muted)}${rect(274+i*236,560,180,32,5,t.panel3,t.line2)}${text(364+i*236,581,m[2],13,t.text,800,'text-anchor="middle"')}`).join("")}
    ${rect(254,622,692,228,10,t.panel3,t.line2)}
    ${text(276,654,"最近导入",15,t.text,900)}${text(880,654,"查看全部",12,"#9CCBFF",700)}
    ${["人工智能发展报告2024.pdf","产品需求文档_v2.1.docx","https://mp.weixin.qq.com/s/abc123…","《暗时间》读书笔记.pdf","会议记录_2024-05-20.txt"].map((s,i)=>`${line(254,672+i*36,946,672+i*36,t.line)}${text(276,700+i*36,s,12,t.text,700)}${text(540,700+i*36,i===2?"分享链接":i===3?"有道云笔记":"文件导入",12,t.muted)}${text(680,700+i*36,i===2?"1.2 MB":i===4?"89 KB":i===1?"2.1 MB":"24.6 MB",12,t.muted)}${text(820,700+i*36,i===4?"解析失败":"已入记忆",12,i===4?t.danger:t.accent,800)}`).join("")}
  `;
  const right = `
    ${line(974,44,974,898,t.line2)}
    ${text(1000,92,"处理队列",18,t.text,900)}${circle(1092,86,10,t.panel2,1,t.line2)}${text(1092,91,"5",12,t.text,900,'text-anchor="middle"')}${text(1340,92,"全部暂停",13,t.text,700)}
    ${rect(1000,118,386,210,8,t.panel3,t.line2)}
    ${queue.map((q,i)=>`${i>0?line(1000,118+i*42,1386,118+i*42,t.line):""}${rect(1014,132+i*42,22,22,4,i===4?"#28413A":"#223543",t.line2)}${text(1048,148+i*42,q[0],13,t.text,700)}${text(1048,168+i*42,q[1],11,t.muted)}${text(1310,148+i*42,q[2],12,q[3],800)}${i<2?rect(1048,176+i*42,230,4,2,"#22303A")+rect(1048,176+i*42,i===0?145:66,4,2,q[3]):""}`).join("")}
    ${text(1000,372,"解析流水线",16,t.text,900)}
    ${["保存源文件","本地解析","LLM 兜底","生成文本片段","写入向量索引","生成图谱节点","已入记忆"].map((s,i)=>`${circle(1014,414+i*52,12,i<2||i===6?t.accentSoft:i===2?"#12335A":"#222B31",1,i<2||i===6?t.accent:i===2?t.blue:t.line2)}${i<6?line(1014,426+i*52,1014,454+i*52,i<2?t.accent:t.line2,1,2):""}${rect(1046,396+i*52,292,42,7,t.panel2,t.line2)}${text(1062,420+i*52,s,13,i<3||i===6?t.text:t.muted,800)}${text(1298,420+i*52,i<2?"已完成":i===2?"进行中":"等待中",12,i<2?t.accent:i===2?t.blue:t.muted,800)}`).join("")}
    ${text(1000,872,"所有处理均在本地完成，数据安全可控。",12,t.muted)}
  `;
  return shell("import", "导入中心", "资料入口必须低摩擦：文件、外部文档、链接、聊天软件接收内容都能进入本地解析循环。", main, right, "数据与集成");
}

const pages = [
  ["graph-dashboard-dark-v2", graphPage],
  ["source-library-dark-v2", sourcesPage],
  ["qa-search-dark-v2", qaPage],
  ["import-center-dark-v2", importPage],
];

for (const [name, render] of pages) {
  const svgPath = path.join(outDir, `${name}.svg`);
  const pngPath = path.join(outDir, `${name}.png`);
  fs.writeFileSync(svgPath, render());
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lmh-v2-chrome-"));
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
    if (result.error && !fs.existsSync(pngPath)) throw result.error;
    if (result.status && result.status !== 0 && !fs.existsSync(pngPath)) {
      throw new Error(result.stderr?.toString() || `Chrome exited with ${result.status}`);
    }
    console.log(pngPath);
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}
