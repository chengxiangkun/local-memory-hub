import { access, constants, mkdir, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const COMMAND_CHECKS = [
  {
    id: "sqlite3",
    label: "SQLite CLI（可选）",
    command: "sqlite3",
    args: ["--version"],
    required: false,
    missing_message: "未检测到系统 sqlite3 命令行；已内嵌 better-sqlite3，无需系统 sqlite3，仅影响手动排查。"
  },
  {
    id: "ffmpeg",
    label: "FFmpeg",
    command: "ffmpeg",
    args: ["-version"],
    required: false,
    missing_message: "缺少 ffmpeg，视频和音频抽取能力不可用。"
  },
  {
    id: "ffprobe",
    label: "FFprobe",
    command: "ffprobe",
    args: ["-version"],
    required: false,
    missing_message: "缺少 ffprobe，视频元数据识别能力不可用。"
  },
  {
    id: "pdftotext",
    label: "PDF 文本解析",
    command: "pdftotext",
    args: ["-v"],
    required: false,
    missing_message: "缺少 pdftotext，PDF 会优先进入模型兜底或等待安装本地解析器。"
  },
  {
    id: "tesseract",
    label: "OCR 图片解析",
    command: "tesseract",
    args: ["--version"],
    required: false,
    missing_message: "缺少 tesseract，图片文字识别暂不可用。"
  },
  {
    id: "rustc",
    label: "Rust 编译器",
    command: "rustc",
    args: ["--version"],
    required: false,
    missing_message: "缺少 rustc，桌面端 Tauri 打包暂不可用。"
  },
  {
    id: "cargo",
    label: "Cargo",
    command: "cargo",
    args: ["--version"],
    required: false,
    missing_message: "缺少 cargo，桌面端 Tauri 打包暂不可用。"
  }
];

export async function runSystemDoctor({ dataDir } = {}) {
  const checks = [];
  if (dataDir) {
    checks.push(await checkDataDir(dataDir));
  }
  for (const item of COMMAND_CHECKS) {
    checks.push(await checkCommand(item));
  }
  return {
    generated_at: new Date().toISOString(),
    overall_status: summarizeStatus(checks),
    checks
  };
}

async function checkDataDir(dataDir) {
  const probeFile = path.join(dataDir, "app-meta", `.doctor-${Date.now()}.tmp`);
  try {
    await access(dataDir, constants.R_OK | constants.W_OK);
    await mkdir(path.dirname(probeFile), { recursive: true });
    await writeFile(probeFile, "ok");
    await unlink(probeFile);
    return {
      id: "data_dir",
      label: "本地数据目录",
      status: "ok",
      required: true,
      message: "可读写"
    };
  } catch (error) {
    return {
      id: "data_dir",
      label: "本地数据目录",
      status: "missing",
      required: true,
      message: `不可读写：${error.code || error.message}`
    };
  }
}

async function checkCommand(item) {
  try {
    const result = await execFileAsync(item.command, item.args, { timeout: 5000 });
    return {
      id: item.id,
      label: item.label,
      status: "ok",
      required: item.required,
      message: firstLine(result.stdout || result.stderr) || "已安装"
    };
  } catch {
    return {
      id: item.id,
      label: item.label,
      status: item.required ? "missing" : "warning",
      required: item.required,
      message: item.missing_message
    };
  }
}

function summarizeStatus(checks) {
  if (checks.some((item) => item.required && item.status !== "ok")) return "blocked";
  if (checks.some((item) => item.status === "warning")) return "degraded";
  return "ok";
}

function firstLine(text) {
  return String(text || "").split(/\r?\n/).find(Boolean)?.trim() || "";
}
