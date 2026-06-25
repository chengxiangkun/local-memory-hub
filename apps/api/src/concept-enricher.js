/**
 * AI 概念卡(借鉴 Karpathy/Obsidian 法的「概念页 + 交叉引用」):
 * 给图谱里的概念节点用大模型写一张「概念卡」——这个概念是什么、在库里的作用、与哪些相关概念如何关联。
 * 交叉引用直接复用图谱已有的边(邻居),概念描述存到 graph_nodes.description。
 * mock/未配真实模型 → 跳过。
 */

import { getGraphNeighbors, getSourceById, updateGraphNodeDescription } from "./sqlite-store.js";
import { getModelPolicy } from "./model-policy-store.js";
import { resolveModelConfig } from "./model-config-resolver.js";
import { routeChat } from "./model-provider.js";

function buildPrompt(node, neighborLabels, source) {
  const related = neighborLabels.length ? neighborLabels.join("、") : "(暂无)";
  const summary = source?.summary ? `所在资料《${source.title}》摘要:${source.summary}` : (source?.title ? `所在资料:《${source.title}》` : "");
  return [
    `请为知识库里的概念「${node.label}」写一张「概念卡」。`,
    summary,
    `它在图谱里与这些概念相关联:${related}。`,
    "用 2-4 句中文说明:这个概念是什么、在本知识库里的作用、以及和上面相关概念是怎么联系的。",
    "只输出概念描述纯文本,不要 JSON、不要标题、不要前后缀。"
  ].filter(Boolean).join("\n");
}

export async function enrichConceptNode(nodeId, dataDir, options = {}) {
  if (!nodeId) return { status: "skipped", reason: "no_node" };

  const policy = await getModelPolicy("chat", dataDir).catch(() => null);
  const providerId = options.provider_id || policy?.provider_id || "mock";
  if (!providerId || providerId === "mock") {
    await updateGraphNodeDescription(nodeId, "", "skipped", dataDir);
    return { status: "skipped", reason: "no_real_provider" };
  }

  const neighborhood = await getGraphNeighbors(nodeId, dataDir, { limit: 30 });
  const node = (neighborhood.nodes || []).find((n) => n.node_id === nodeId);
  if (!node) return { status: "skipped", reason: "node_not_found" };

  const neighborLabels = (neighborhood.nodes || [])
    .filter((n) => n.node_id !== nodeId)
    .map((n) => n.label)
    .filter(Boolean)
    .slice(0, 12);
  const source = node.source_id ? await getSourceById(node.source_id, dataDir).catch(() => null) : null;

  let answer = "";
  try {
    const config = await resolveModelConfig({}, dataDir, providerId);
    const result = await routeChat(
      { provider_id: providerId, task: "concept_card", question: buildPrompt(node, neighborLabels, source), context: [], config },
      dataDir
    );
    answer = (result?.answer || "").trim();
  } catch (error) {
    await updateGraphNodeDescription(nodeId, "", "failed", dataDir);
    return { status: "failed", reason: error.message };
  }

  if (!answer) {
    await updateGraphNodeDescription(nodeId, "", "failed", dataDir);
    return { status: "failed", reason: "empty_answer" };
  }

  await updateGraphNodeDescription(nodeId, answer, "ready", dataDir);
  return { status: "ready", node_id: nodeId, label: node.label, description: answer, related: neighborLabels };
}
