import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import {
  clearGraph,
  getSourceById,
  getGraphNodeByTypeAndLabel,
  insertGraphEdges,
  insertGraphNodes,
  insertExtractedText,
  insertMemorySegments,
  insertParserImprovement,
  insertParseJob,
  listMemorySegments,
  listSourcesSqlite,
  updateParseJob,
  updateSourceStatuses
} from "./sqlite-store.js";
import { getDataDir, writeExtractedText } from "./data-store.js";
import { routeChat } from "./model-provider.js";
import { getProviderConfig } from "./model-config-store.js";
import { getModelPolicy } from "./model-policy-store.js";
import { indexSegments } from "./vector-service.js";
import { enrichSourceMetadata } from "./metadata-enricher.js";
import { extractMultilingualTokens } from "./text-tokenizer.js";
import { assessSourceTextQuality, formatSourceQualityReasons } from "./source-quality-service.js";
import {
  feishuBlocksToText,
  fetchFeishuDocxBlocks,
  getFeishuTenantAccessToken,
  resolveFeishuDocumentId
} from "./feishu-client.js";
import { exportTencentDocText } from "./tencent-client.js";

const execFileAsync = promisify(execFile);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"]);
const MEDIA_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".mp3", ".m4a", ".wav", ".aac", ".flac"]);
const PARSER_NAME = "MinimalTextParser";
const PARSER_VERSION = "v2";
const TARGET_CHUNK_CHARS = 800;
const MAX_CHUNK_CHARS = 1100;
const MIN_CHUNK_CHARS = 220;
const OVERLAP_CHARS = 100;

export async function parseSource(sourceId, options = {}, dataDir = getDataDir()) {
  const source = await getSourceById(sourceId, dataDir);
  if (!source) {
    throw new Error(`源资料不存在：${sourceId}`);
  }
  if (source.memory_status === "memory_indexed" && ["parse_success", "llm_fallback_success"].includes(source.parse_status)) {
    const segments = await listMemorySegments(sourceId, dataDir);
    return {
      status: "already_parsed",
      source_id: sourceId,
      segment_count: segments.length,
      graph_node_count: 0,
      preview: segments[0]?.text?.slice(0, 120) || ""
    };
  }

  const now = new Date().toISOString();
  const job = await insertParseJob(
    {
      job_id: randomUUID(),
      source_id: sourceId,
      status: "running",
      parser_name: PARSER_NAME,
      error_message: null,
      created_at: now,
      updated_at: now
    },
    dataDir
  );

  await updateSourceStatuses(sourceId, { parse_status: "parsing" }, dataDir);

  try {
    const text = await extractText(source, dataDir);
    const textPath = await writeExtractedText(sourceId, text, dataDir);
    const segments = createSegments(source, text);
    const quality = assessSourceTextQuality({
      title: source.title,
      text,
      sourceType: source.source_type
    });
    if (!quality.should_index || segments.length === 0) {
      await insertExtractedText(
        {
          extracted_id: randomUUID(),
          source_id: sourceId,
          text_path: textPath,
          text_preview: buildQualityPreview(text, quality),
          created_at: new Date().toISOString()
        },
        dataDir
      );
      const reason = segments.length === 0 ? "未生成有效文本片段" : formatSourceQualityReasons(quality.reasons);
      await updateParseJob(job.job_id, { status: "quality_rejected", error_message: reason }, dataDir);
      await updateSourceStatuses(
        sourceId,
        {
          parse_status: "quality_rejected",
          memory_status: "memory_rejected"
        },
        dataDir
      );
      return {
        status: "quality_rejected",
        source_id: sourceId,
        text_path: textPath,
        segment_count: 0,
        graph_node_count: 0,
        quality,
        error: reason,
        preview: text.slice(0, 120)
      };
    }
    const graph = await createGraphForSource(source, segments, dataDir);
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

    // 元数据增强(摘要/关键词/能回答的问题):best-effort,失败不影响解析成功;
    // 未配真实问答模型(mock)时内部直接跳过,不拖慢解析。
    try {
      await enrichSourceMetadata(sourceId, dataDir);
    } catch {
      /* 忽略,可后续手动 /api/sources/enrich-metadata 重跑 */
    }

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

function buildQualityPreview(text, quality) {
  const reason = formatSourceQualityReasons(quality.reasons);
  const preview = String(text || "").slice(0, 420);
  return `质检未入记忆：${reason}。${preview}`;
}

export async function rebuildGraphIndex(dataDir = getDataDir()) {
  await clearGraph(dataDir);
  const sources = (await listSourcesSqlite(dataDir)).filter((source) =>
    source.pollution_status !== "quarantined" && source.import_status !== "deleted"
  );
  let sourceCount = 0;
  let nodeCount = 0;
  let edgeCount = 0;

  for (const source of sources) {
    const segments = await listMemorySegments(source.source_id, dataDir);
    if (segments.length === 0) continue;

    const graph = await createGraphForSource(source, segments, dataDir);
    await insertGraphNodes(graph.nodes, dataDir);
    await insertGraphEdges(graph.edges, dataDir);
    sourceCount += 1;
    nodeCount += graph.nodes.length;
    edgeCount += graph.edges.length;
  }

  return {
    status: "success",
    source_count: sourceCount,
    node_count: nodeCount,
    edge_count: edgeCount
  };
}

async function parseWithLlmFallback(source, jobId, localError, dataDir) {
  await updateSourceStatuses(source.source_id, { parse_status: "llm_fallback_pending" }, dataDir);
  const policy = await getModelPolicy("parse_fallback", dataDir);
  const providerId = policy?.provider_id || "mock";
  const config = await getProviderConfig(providerId, dataDir);
  const fallback = await routeChat(
    {
      provider_id: providerId,
      task: "parse_fallback",
      question: `请兜底解析这个源资料：${source.title}。本地错误：${localError.message}`,
      context: [
        {
          source_id: source.source_id,
          title: source.title,
          extracted_preview: `本地解析失败，已使用大模型兜底。来源类型：${source.source_type}。错误：${localError.message}`
        }
      ],
      config: config ? { base_url: config.base_url, api_key: config.api_key, model: config.model } : {}
    },
    dataDir
  );
  const text = fallback.answer;
  const textPath = await writeExtractedText(source.source_id, text, dataDir);
  const segments = createSegments(source, text);
  const graph = await createGraphForSource(source, segments, dataDir);

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

async function extractText(source, dataDir) {
  if (!source.local_file_path) {
    throw new Error("源资料没有本地文件路径");
  }

  if (source.source_type === "url" && source.source_platform === "feishu") {
    return extractFeishuText(source.original_url || source.canonical_url);
  }

  if (source.source_type === "url" && source.source_platform === "tencent_docs") {
    if (!source.remote_node_token) {
      throw new Error("腾讯文档缺少文件 ID,请通过连接器同步导入(同步会写入可导出的 fileID)");
    }
    return exportTencentDocText(source.remote_node_token);
  }

  if (source.source_type === "text" || source.source_type === "url") {
    return readFile(source.local_file_path, "utf8");
  }

  const ext = path.extname(source.local_file_path).toLowerCase();

  if (source.source_type === "file" && isPlainTextFile(source.local_file_path)) {
    return readFile(source.local_file_path, "utf8");
  }

  if (source.source_type === "file" && ext === ".pdf") {
    return extractPdfText(source.local_file_path);
  }

  if (source.source_type === "file" && IMAGE_EXTENSIONS.has(ext)) {
    return extractImageText(source.local_file_path);
  }

  if (source.source_type === "file" && MEDIA_EXTENSIONS.has(ext)) {
    return extractMediaText(source, dataDir);
  }

  throw new Error(`暂不支持该类型的本地解析：${source.source_type}`);
}

async function extractFeishuText(url) {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const tenantAccessToken = await getFeishuTenantAccessToken({ appId, appSecret });
  const documentId = await resolveFeishuDocumentId({ tenantAccessToken, url });
  const blocks = await fetchFeishuDocxBlocks({ tenantAccessToken, documentId });
  const text = feishuBlocksToText(blocks);
  if (!text) throw new Error("飞书文档已读取，但未提取到文本");
  return text;
}

async function extractPdfText(filePath) {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", "-nopgbrk", filePath, "-"]);
    const text = stdout.trim();
    if (!text) throw new Error("PDF 未抽取到文本");
    return text;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("系统缺少 pdftotext，无法本地解析 PDF。可安装 Poppler，或开启大模型兜底解析。");
    }
    throw new Error(`PDF 本地解析失败：${error.message}`);
  }
}

async function extractImageText(filePath) {
  try {
    const { stdout } = await execFileAsync("tesseract", [filePath, "-", "-l", "chi_sim+eng"]);
    const text = stdout.trim();
    if (!text) throw new Error("图片未识别到文本");
    return text;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("系统缺少 tesseract，无法本地 OCR 图片。可安装 Tesseract，或开启大模型兜底解析。");
    }
    throw new Error(`图片 OCR 失败：${error.message}`);
  }
}

async function extractMediaText(source, dataDir) {
  const metadata = await readMediaMetadata(source.local_file_path);
  const audioPath = await extractAudioTrack(source, dataDir);
  throw new Error(
    `媒体文件已完成本地探测，但缺少本地语音转写器。` +
      `标题：${source.title}。时长：${metadata.duration || "未知"} 秒。音频已提取：${audioPath}。` +
      "可安装本地转写模型，或开启大模型兜底解析。"
  );
}

async function readMediaMetadata(filePath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size,format_name",
      "-of",
      "json",
      filePath
    ]);
    const data = JSON.parse(stdout || "{}");
    return {
      duration: data.format?.duration ? Number(data.format.duration).toFixed(2) : null,
      size: data.format?.size || null,
      format_name: data.format?.format_name || null
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("系统缺少 ffprobe，无法读取媒体信息。可安装 FFmpeg，或开启大模型兜底解析。");
    }
    throw new Error(`媒体信息读取失败：${error.message}`);
  }
}

async function extractAudioTrack(source, dataDir) {
  const audioPath = path.join(dataDir, "extracted", "audio", `${source.source_id}.wav`);
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      source.local_file_path,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      audioPath
    ]);
    return audioPath;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("系统缺少 ffmpeg，无法从媒体文件提取音频。可安装 FFmpeg，或开启大模型兜底解析。");
    }
    throw new Error(`媒体音频提取失败：${error.message}`);
  }
}

function isPlainTextFile(filePath) {
  return [".txt", ".md", ".js", ".ts", ".json", ".csv", ".log"].some((ext) =>
    filePath.toLowerCase().endsWith(ext)
  );
}

function createSegments(source, text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks = parseTextBlocks(normalized);
  const chunks = buildChunks(blocks);
  const now = new Date().toISOString();

  return chunks.map((chunk, index) => ({
    segment_id: stableSegmentId(source.source_id, `${chunk.contentHash}:${chunk.startOffset}:${chunk.endOffset}`),
    source_id: source.source_id,
    segment_index: index,
    title_path: chunk.titlePath || source.title,
    text: chunk.text,
    trace_position: formatTracePosition(index, chunk),
    start_offset: chunk.startOffset,
    end_offset: chunk.endOffset,
    char_count: chunk.text.length,
    token_count: estimateTokenCount(chunk.text),
    content_hash: chunk.contentHash,
    parser_name: PARSER_NAME,
    parser_version: PARSER_VERSION,
    pollution_status: "clean",
    created_at: now,
    updated_at: now
  }));
}

function parseTextBlocks(text) {
  const blocks = [];
  let currentTitlePath = [];
  const pattern = /[^\n]+(?:\n+|$)/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const startOffset = match.index + raw.indexOf(trimmed);
    const endOffset = startOffset + trimmed.length;
    const heading = parseHeading(trimmed);
    if (heading) {
      currentTitlePath = [...currentTitlePath.slice(0, heading.level - 1), heading.title];
      blocks.push({
        text: trimmed,
        titlePath: currentTitlePath.join(" / "),
        startOffset,
        endOffset,
        isHeading: true
      });
      continue;
    }

    blocks.push({
      text: trimmed,
      titlePath: currentTitlePath.join(" / "),
      startOffset,
      endOffset,
      isHeading: false
    });
  }

  return blocks.length > 0 ? blocks : [{ text, titlePath: "", startOffset: 0, endOffset: text.length, isHeading: false }];
}

function buildChunks(blocks) {
  const chunks = [];
  let buffer = [];

  for (const block of blocks) {
    const bufferLength = chunkText(buffer).length;
    const wouldOverflow = bufferLength > 0 && bufferLength + block.text.length + 2 > MAX_CHUNK_CHARS;
    const startsNewSection = block.isHeading && bufferLength >= MIN_CHUNK_CHARS;

    if (wouldOverflow || startsNewSection) {
      flushChunk(chunks, buffer);
      buffer = [];
    }

    if (block.text.length > MAX_CHUNK_CHARS) {
      if (buffer.length > 0) {
        flushChunk(chunks, buffer);
        buffer = [];
      }
      chunks.push(...splitLongBlock(block));
      continue;
    }

    buffer.push(block);
    if (chunkText(buffer).length >= TARGET_CHUNK_CHARS) {
      flushChunk(chunks, buffer);
      buffer = withOverlap(buffer);
    }
  }

  flushChunk(chunks, buffer);
  return chunks;
}

function splitLongBlock(block) {
  const chunks = [];
  let cursor = 0;
  while (cursor < block.text.length) {
    const end = Math.min(cursor + MAX_CHUNK_CHARS, block.text.length);
    const text = block.text.slice(cursor, end);
    const startOffset = block.startOffset + cursor;
    const endOffset = startOffset + text.length;
    chunks.push(buildChunk([{ ...block, text, startOffset, endOffset }]));
    if (end >= block.text.length) break;
    cursor = Math.max(cursor + 1, end - OVERLAP_CHARS);
  }
  return chunks;
}

function flushChunk(chunks, buffer) {
  if (buffer.length === 0) return;
  chunks.push(buildChunk(buffer));
}

function buildChunk(blocks) {
  const text = chunkText(blocks).slice(0, MAX_CHUNK_CHARS);
  const titlePath = [...blocks].reverse().find((block) => block.titlePath)?.titlePath || "";
  const startOffset = Math.min(...blocks.map((block) => block.startOffset));
  const endOffset = Math.max(...blocks.map((block) => block.endOffset));
  return {
    text,
    titlePath,
    startOffset,
    endOffset,
    contentHash: createHash("sha256").update(`${titlePath}\n${text}`).digest("hex")
  };
}

function withOverlap(buffer) {
  const text = chunkText(buffer);
  if (text.length <= OVERLAP_CHARS) return [];
  const overlapText = text.slice(-OVERLAP_CHARS);
  const lastBlock = buffer[buffer.length - 1];
  return [{
    ...lastBlock,
    text: overlapText,
    startOffset: Math.max(lastBlock.startOffset, lastBlock.endOffset - overlapText.length),
    isHeading: false
  }];
}

function chunkText(blocks) {
  return blocks.map((block) => block.text).filter(Boolean).join("\n\n");
}

function parseHeading(text) {
  const markdown = text.match(/^(#{1,6})\s+(.+)$/);
  if (markdown) return { level: markdown[1].length, title: markdown[2].trim() };

  const numbered = text.match(/^([一二三四五六七八九十]+、|\d+[.、])\s*(.{2,48})$/);
  if (numbered) return { level: 2, title: numbered[2].trim() };

  if (text.length <= 32 && /[:：]$/.test(text)) return { level: 2, title: text.replace(/[:：]$/, "").trim() };
  return null;
}

function stableSegmentId(sourceId, contentHash) {
  return `seg_${createHash("sha256").update(`${sourceId}:${contentHash}`).digest("hex").slice(0, 32)}`;
}

function formatTracePosition(index, chunk) {
  const title = chunk.titlePath ? `${chunk.titlePath} · ` : "";
  return `${title}文本片段 ${index + 1}（${chunk.startOffset}-${chunk.endOffset}）`;
}

function estimateTokenCount(text) {
  const tokens = extractMultilingualTokens(text);
  return Math.max(1, tokens.length || Math.ceil(String(text || "").length / 2));
}

async function createGraphForSource(source, segments, dataDir) {
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
  const topicEdge = {
    edge_id: randomUUID(),
    from_node_id: sourceNode.node_id,
    to_node_id: topicNode.node_id,
    edge_type: "contains_topic",
    reason: "根据源资料标题和首个文本片段生成",
    created_at: now
  };
  const keywordNodes = [];
  const newKeywordNodes = [];
  for (const label of extractKeywordLabels(source, segments)) {
    const existing = await getGraphNodeByTypeAndLabel("keyword", label, dataDir);
    if (existing) {
      keywordNodes.push(existing);
      continue;
    }
    const node = {
      node_id: randomUUID(),
      source_id: null,
      node_type: "keyword",
      label,
      pollution_status: "clean",
      created_at: now
    };
    keywordNodes.push(node);
    newKeywordNodes.push(node);
  }
  const keywordEdges = keywordNodes.flatMap((node) => ([
    {
      edge_id: randomUUID(),
      from_node_id: sourceNode.node_id,
      to_node_id: node.node_id,
      edge_type: "mentions_keyword",
      reason: "根据文本片段分词生成",
      created_at: now
    },
    {
      edge_id: randomUUID(),
      from_node_id: node.node_id,
      to_node_id: topicNode.node_id,
      edge_type: "relates_topic",
      reason: "关键词归入当前主题",
      created_at: now
    }
  ]));

  return {
    nodes: [sourceNode, topicNode, ...newKeywordNodes],
    edges: [topicEdge, ...keywordEdges]
  };
}

function extractKeywordLabels(source, segments) {
  const titleTokens = new Set(extractMultilingualTokens(source.title));
  const counts = new Map();
  const text = segments.map((segment) => segment.text).join("\n");
  for (const token of [...extractChinesePhrases(text), ...extractMultilingualTokens(text)]) {
    if (titleTokens.has(token) || token.length < 2) continue;
    if (GRAPH_KEYWORD_STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0], "zh-CN"))
    .slice(0, 12)
    .map(([token]) => token);
}

function extractChinesePhrases(text) {
  return String(text)
    .split(/[，。！？；：、,.!?;:\s]+/u)
    .flatMap((part) => part.split(/(?:需要|应该|不是|只有|以及|还有|可以|进行|展示|进入|而是|并且|或者|和|与)/u))
    .map((item) => item.trim())
    .filter((item) => /^[\p{Script=Han}A-Za-z0-9-]{2,12}$/u.test(item));
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

const GRAPH_KEYWORD_STOP_WORDS = new Set([
  "不是", "只有", "标题", "主题", "节点", "应该", "需要", "可以", "进行", "展示", "进入", "而是"
]);
