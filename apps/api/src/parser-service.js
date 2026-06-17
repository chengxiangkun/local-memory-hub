import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  getSourceById,
  insertGraphEdges,
  insertGraphNodes,
  insertExtractedText,
  insertMemorySegments,
  insertParserImprovement,
  insertParseJob,
  updateParseJob,
  updateSourceStatuses
} from "./sqlite-store.js";
import { getDataDir, writeExtractedText } from "./data-store.js";
import { routeChat } from "./model-provider.js";
import { indexSegments } from "./vector-service.js";

export async function parseSource(sourceId, options = {}, dataDir = getDataDir()) {
  const source = await getSourceById(sourceId, dataDir);
  if (!source) {
    throw new Error(`源资料不存在：${sourceId}`);
  }

  const now = new Date().toISOString();
  const job = await insertParseJob(
    {
      job_id: randomUUID(),
      source_id: sourceId,
      status: "running",
      parser_name: "MinimalTextParser",
      error_message: null,
      created_at: now,
      updated_at: now
    },
    dataDir
  );

  await updateSourceStatuses(sourceId, { parse_status: "parsing" }, dataDir);

  try {
    const text = await extractText(source);
    const textPath = await writeExtractedText(sourceId, text, dataDir);
    const segments = createSegments(sourceId, text);
    const graph = createGraphForSource(source, segments);
    await insertExtractedText(
      {
        extracted_id: randomUUID(),
        source_id: sourceId,
        text_path: textPath,
        text_preview: text.slice(0, 500),
        created_at: new Date().toISOString()
      },
      dataDir
    );
    await insertMemorySegments(segments, dataDir);
    await indexSegments(segments, dataDir);
    await insertGraphNodes(graph.nodes, dataDir);
    await insertGraphEdges(graph.edges, dataDir);
    await updateParseJob(job.job_id, { status: "success", error_message: null }, dataDir);
    await updateSourceStatuses(
      sourceId,
      {
        parse_status: "parse_success",
        memory_status: "memory_indexed"
      },
      dataDir
    );

    return {
      status: "success",
      source_id: sourceId,
      text_path: textPath,
      segment_count: segments.length,
      graph_node_count: graph.nodes.length,
      preview: text.slice(0, 120)
    };
  } catch (error) {
    if (options.llm_fallback) {
      return parseWithLlmFallback(source, job.job_id, error, dataDir);
    }
    await updateParseJob(job.job_id, { status: "failed", error_message: error.message }, dataDir);
    await updateSourceStatuses(sourceId, { parse_status: "parse_failed" }, dataDir);
    return {
      status: "failed",
      source_id: sourceId,
      error: error.message
    };
  }
}

async function parseWithLlmFallback(source, jobId, localError, dataDir) {
  await updateSourceStatuses(source.source_id, { parse_status: "llm_fallback_pending" }, dataDir);
  const fallback = await routeChat({
    provider_id: "mock",
    question: `请兜底解析这个源资料：${source.title}。本地错误：${localError.message}`,
    context: [
      {
        source_id: source.source_id,
        title: source.title,
        extracted_preview: `本地解析失败，已使用大模型兜底。来源类型：${source.source_type}。错误：${localError.message}`
      }
    ]
  });
  const text = fallback.answer;
  const textPath = await writeExtractedText(source.source_id, text, dataDir);
  const segments = createSegments(source.source_id, text);
  const graph = createGraphForSource(source, segments);

  await insertExtractedText(
    {
      extracted_id: randomUUID(),
      source_id: source.source_id,
      text_path: textPath,
      text_preview: text.slice(0, 500),
      created_at: new Date().toISOString()
    },
    dataDir
  );
  await insertMemorySegments(segments, dataDir);
  await indexSegments(segments, dataDir);
  await insertGraphNodes(graph.nodes, dataDir);
  await insertGraphEdges(graph.edges, dataDir);
  await insertParserImprovement(
    {
      improvement_id: randomUUID(),
      source_id: source.source_id,
      failure_pattern: `unsupported:${source.source_type}`,
      local_error: localError.message,
      llm_corrected_output: text,
      generated_rule: "遇到同类不支持类型时，先保留源资料并生成兜底摘要，等待专用解析器补充。",
      confidence: 50,
      created_at: new Date().toISOString()
    },
    dataDir
  );
  await updateParseJob(jobId, { status: "llm_fallback_success", error_message: null }, dataDir);
  await updateSourceStatuses(
    source.source_id,
    {
      parse_status: "llm_fallback_success",
      memory_status: "memory_indexed"
    },
    dataDir
  );

  return {
    status: "llm_fallback_success",
    source_id: source.source_id,
    text_path: textPath,
    segment_count: segments.length,
    graph_node_count: graph.nodes.length,
    improvement_saved: true,
    preview: text.slice(0, 120)
  };
}

async function extractText(source) {
  if (!source.local_file_path) {
    throw new Error("源资料没有本地文件路径");
  }

  if (source.source_type === "text" || source.source_type === "url") {
    return readFile(source.local_file_path, "utf8");
  }

  if (source.source_type === "file" && isPlainTextFile(source.local_file_path)) {
    return readFile(source.local_file_path, "utf8");
  }

  throw new Error(`暂不支持该类型的本地解析：${source.source_type}`);
}

function isPlainTextFile(filePath) {
  return [".txt", ".md", ".js", ".ts", ".json", ".csv", ".log"].some((ext) =>
    filePath.toLowerCase().endsWith(ext)
  );
}

function createSegments(sourceId, text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks = paragraphs.length > 0 ? paragraphs : [normalized];
  const now = new Date().toISOString();

  return chunks.map((chunk, index) => ({
    segment_id: randomUUID(),
    source_id: sourceId,
    segment_index: index,
    text: chunk.slice(0, 1200),
    trace_position: `文本片段 ${index + 1}`,
    pollution_status: "clean",
    created_at: now
  }));
}

function createGraphForSource(source, segments) {
  const now = new Date().toISOString();
  const sourceNode = {
    node_id: randomUUID(),
    source_id: source.source_id,
    node_type: "source",
    label: source.title,
    pollution_status: "clean",
    created_at: now
  };
  const topicNode = {
    node_id: randomUUID(),
    source_id: source.source_id,
    node_type: "topic",
    label: guessTopic(source, segments),
    pollution_status: "clean",
    created_at: now
  };
  const edge = {
    edge_id: randomUUID(),
    from_node_id: sourceNode.node_id,
    to_node_id: topicNode.node_id,
    edge_type: "contains_topic",
    reason: "根据源资料标题和首个文本片段生成",
    created_at: now
  };

  return {
    nodes: [sourceNode, topicNode],
    edges: [edge]
  };
}

function guessTopic(source, segments) {
  const firstSegment = segments[0]?.text || "";
  const text = `${source.title} ${firstSegment}`;
  if (text.includes("图谱")) return "图谱";
  if (text.includes("记忆")) return "记忆";
  if (text.includes("导入")) return "导入";
  if (text.includes("模型")) return "模型";
  return "未分类主题";
}
