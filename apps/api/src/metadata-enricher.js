/**
 * 元数据增强:用大模型为每个源资料生成「一句话摘要 + 关键词 + 能回答的问题」,
 * 写入 sources 表,用于提升问答召回(用户措辞与原文不一致时也能命中)。
 *
 * - 仅在配置了真实问答模型时运行;mock/未配 → 跳过(metadata_status="skipped")。
 * - 失败不抛出(best-effort),标记 metadata_status="failed",不影响解析主流程。
 */

import { getSourceById, listMemorySegments, updateSourceMetadata } from "./sqlite-store.js";
import { getModelPolicy } from "./model-policy-store.js";
import { resolveModelConfig } from "./model-config-resolver.js";
import { routeChat } from "./model-provider.js";

const MAX_INPUT_CHARS = 4000;

function buildPrompt(title, body) {
  return [
    "请阅读下面这份资料,生成「检索用元数据」。",
    "只输出一个 JSON 对象,不要任何解释、前后缀或多余文字。格式严格如下:",
    '{"summary":"一句话摘要(50字内)","keywords":["关键词",...5到8个],"questions":["这份资料能回答的具体问题",...3到5个]}',
    "questions 要尽量贴近用户真实会怎么提问(口语化、含同义说法)。",
    "",
    `标题:${title || "(无标题)"}`,
    "",
    "正文:",
    body
  ].join("\n");
}

// 从模型输出里抽出第一个 JSON 对象并解析;失败返回 null。
function parseMetadata(answer) {
  if (!answer) return null;
  const match = String(answer).match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const keywords = Array.isArray(obj.keywords)
    ? obj.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 8)
    : [];
  const questions = Array.isArray(obj.questions)
    ? obj.questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 5)
    : [];
  if (!summary && keywords.length === 0 && questions.length === 0) return null;
  return { summary, keywords, questions };
}

export async function enrichSourceMetadata(sourceId, dataDir, options = {}) {
  const source = await getSourceById(sourceId, dataDir);
  if (!source) return { status: "skipped", reason: "source_not_found" };

  // 解析问答模型;mock/未配 → 跳过,避免无意义调用。
  const policy = await getModelPolicy("chat", dataDir).catch(() => null);
  const providerId = options.provider_id || policy?.provider_id || "mock";
  if (!providerId || providerId === "mock") {
    await updateSourceMetadata(sourceId, { status: "skipped" }, dataDir);
    return { status: "skipped", reason: "no_real_provider" };
  }

  const segments = await listMemorySegments(sourceId, dataDir);
  const body = segments.map((s) => s.text || "").join("\n").slice(0, MAX_INPUT_CHARS);
  if (!body.trim()) {
    await updateSourceMetadata(sourceId, { status: "skipped" }, dataDir);
    return { status: "skipped", reason: "no_text" };
  }

  let answer = "";
  try {
    const config = await resolveModelConfig({}, dataDir, providerId);
    const result = await routeChat(
      { provider_id: providerId, task: "metadata_enrich", question: buildPrompt(source.title, body), context: [], config },
      dataDir
    );
    answer = result?.answer || "";
  } catch (error) {
    await updateSourceMetadata(sourceId, { status: "failed" }, dataDir);
    return { status: "failed", reason: error.message };
  }

  const parsed = parseMetadata(answer);
  if (!parsed) {
    await updateSourceMetadata(sourceId, { status: "failed" }, dataDir);
    return { status: "failed", reason: "parse_failed" };
  }
  await updateSourceMetadata(sourceId, { ...parsed, status: "ready" }, dataDir);
  return { status: "ready", ...parsed };
}

// 供测试用:导出解析器。
export const __parseMetadataForTest = parseMetadata;
