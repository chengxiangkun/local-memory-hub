/**
 * 知识库健康检查(借鉴 Karpathy/Obsidian 法的 health check):
 * 汇总各源的「标题 + 摘要 + 关键词」喂大模型,找出整库层面的问题:
 *   矛盾(不同资料说法冲突)、过时(信息已过期)、缺失(被提到但没有的实体/概念)、孤立(与其他内容无关联)。
 * 报告落盘 <dataDir>/app-meta/health-report.json,并记一条治理事件(scope=health_check)。
 * mock/未配真实模型 → 跳过。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { listSourcesSqlite, appendGovernanceEvents, listGovernanceEvents } from "./sqlite-store.js";
import { getModelPolicy } from "./model-policy-store.js";
import { resolveModelConfig } from "./model-config-resolver.js";
import { routeChat } from "./model-provider.js";

const MAX_SOURCES = 60;
const REPORT_FILE = "health-report.json";

function reportPath(dataDir) {
  return path.join(dataDir, "app-meta", REPORT_FILE);
}

function parseKeywords(json) {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr.join("、") : "";
  } catch {
    return "";
  }
}

function buildDigest(sources) {
  return sources
    .map((s, i) => {
      const summary = s.summary || "(无摘要)";
      const keywords = parseKeywords(s.keywords_json);
      return `${i + 1}. 《${s.title}》 | 摘要:${summary}${keywords ? " | 关键词:" + keywords : ""}`;
    })
    .join("\n");
}

function buildPrompt(digest) {
  return [
    "下面是一个本地知识库里各份资料的「标题 + 摘要 + 关键词」清单。",
    "请站在整库角度做一次健康检查,找出问题。只输出一个 JSON 对象,不要任何多余文字,格式:",
    '{"issues":[{"type":"矛盾|过时|缺失|孤立","detail":"具体说明(指出涉及哪些资料)","sources":["相关资料标题"]}]}',
    "判定标准:矛盾=不同资料对同一事物说法冲突;过时=信息明显已过期;缺失=频繁提到但库里没有的概念/实体;孤立=与其他所有资料都无关联、像异类。",
    "没有发现问题就返回 {\"issues\":[]}。最多列 8 条最重要的。",
    "",
    "资料清单:",
    digest
  ].join("\n");
}

function parseReport(answer) {
  if (!answer) return null;
  const match = String(answer).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    const issues = Array.isArray(obj.issues) ? obj.issues : [];
    return issues
      .map((it) => ({
        type: String(it.type || "其他").trim(),
        detail: String(it.detail || "").trim(),
        sources: Array.isArray(it.sources) ? it.sources.map((x) => String(x)).slice(0, 8) : []
      }))
      .filter((it) => it.detail);
  } catch {
    return null;
  }
}

export async function runMemoryHealthCheck(dataDir, options = {}) {
  const policy = await getModelPolicy("chat", dataDir).catch(() => null);
  const providerId = options.provider_id || policy?.provider_id || "mock";
  if (!providerId || providerId === "mock") {
    return { status: "skipped", reason: "no_real_provider", issues: [] };
  }

  const sources = (await listSourcesSqlite(dataDir))
    .filter(
      (s) =>
        s.entrypoint !== "qa_conversation" &&
        s.import_status !== "deleted" &&
        s.pollution_status !== "quarantined" &&
        s.memory_status === "memory_indexed"
    )
    .slice(0, MAX_SOURCES);

  if (sources.length < 2) {
    return { status: "skipped", reason: "not_enough_sources", checked_count: sources.length, issues: [] };
  }

  let answer = "";
  try {
    const config = await resolveModelConfig({}, dataDir, providerId);
    const result = await routeChat(
      { provider_id: providerId, task: "health_check", question: buildPrompt(buildDigest(sources)), context: [], config },
      dataDir
    );
    answer = result?.answer || "";
  } catch (error) {
    return { status: "failed", reason: error.message, issues: [] };
  }

  const issues = parseReport(answer);
  if (issues === null) {
    return { status: "failed", reason: "parse_failed", issues: [] };
  }

  const report = {
    status: "ready",
    checked_count: sources.length,
    issue_count: issues.length,
    issues,
    generated_at: new Date().toISOString()
  };

  // 落盘 + 记治理事件
  try {
    await mkdir(path.join(dataDir, "app-meta"), { recursive: true });
    await writeFile(reportPath(dataDir), JSON.stringify(report, null, 2));
  } catch {
    /* 落盘失败不影响返回 */
  }
  await appendGovernanceEvents(
    {
      scope: "health_check",
      action: "checked",
      title: `健康检查:${issues.length} 个问题 / ${sources.length} 份资料`,
      reason: issues.length > 0 ? "issues_found" : "clean",
      detail: { checked_count: sources.length, issue_count: issues.length }
    },
    dataDir
  ).catch(() => {});

  return report;
}

// 供测试用。
export const __parseReportForTest = parseReport;

export async function getLastHealthReport(dataDir) {
  try {
    return JSON.parse(await readFile(reportPath(dataDir), "utf8"));
  } catch {
    return { status: "none", issues: [] };
  }
}

const SCHEDULE_FILE = "health-schedule.json";
function schedulePath(dataDir) {
  return path.join(dataDir, "app-meta", SCHEDULE_FILE);
}

// 定时配置:enabled + interval_hours(0=关闭)。桌面端不常驻,采用"启动/定时补跑"模型:
// 距上次检查超过间隔就跑一次。
export async function getHealthSchedule(dataDir) {
  try {
    const cfg = JSON.parse(await readFile(schedulePath(dataDir), "utf8"));
    return { enabled: Boolean(cfg.enabled), interval_hours: Number(cfg.interval_hours) || 24 };
  } catch {
    return { enabled: false, interval_hours: 24 };
  }
}

export async function saveHealthSchedule(input = {}, dataDir) {
  const next = {
    enabled: Boolean(input.enabled),
    interval_hours: Math.max(1, Math.min(Number(input.interval_hours) || 24, 24 * 30))
  };
  await mkdir(path.join(dataDir, "app-meta"), { recursive: true });
  await writeFile(schedulePath(dataDir), JSON.stringify(next, null, 2));
  return next;
}

// 执行记录:取治理事件里 scope=health_check 的历次运行。
export async function listHealthCheckRuns(dataDir, limit = 10) {
  const events = await listGovernanceEvents(dataDir, { scope: "health_check", limit });
  return events.map((event) => ({
    created_at: event.created_at,
    checked_count: event.detail?.checked_count ?? null,
    issue_count: event.detail?.issue_count ?? null,
    reason: event.reason
  }));
}

// 启动/定时补跑:开启且距上次运行超过间隔 → 后台跑一次(best-effort,不阻塞、不抛)。
export async function maybeRunScheduledHealthCheck(dataDir) {
  try {
    const schedule = await getHealthSchedule(dataDir);
    if (!schedule.enabled) return { ran: false, reason: "disabled" };
    const runs = await listHealthCheckRuns(dataDir, 1);
    const lastAt = runs[0]?.created_at ? Date.parse(runs[0].created_at) : 0;
    const elapsedHours = (Date.now() - lastAt) / 3_600_000;
    if (lastAt && elapsedHours < schedule.interval_hours) {
      return { ran: false, reason: "not_due", next_in_hours: Math.ceil(schedule.interval_hours - elapsedHours) };
    }
    const report = await runMemoryHealthCheck(dataDir, { scheduled: true });
    return { ran: true, status: report.status, issue_count: report.issue_count ?? 0 };
  } catch (error) {
    return { ran: false, reason: error.message };
  }
}
