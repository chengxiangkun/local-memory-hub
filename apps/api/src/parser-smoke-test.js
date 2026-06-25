import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleImport } from "./import-pipeline.js";
import { initModelProviders } from "./model-provider.js";
import { parseSource, rebuildGraphIndex } from "./parser-service.js";
import { listSourceFolders } from "./source-folder-store.js";
import { getGraph, getGraphByNodeType, getGraphCommunities, getGraphNeighbors, getSourceById, initSqlite, listMemorySegments, searchGraphSubgraph } from "./sqlite-store.js";
import { rebuildVectorIndex, vectorSearch } from "./vector-service.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-parser-"));

try {
  await main();
  console.log("Parser smoke test passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  initModelProviders();
  await initSqlite(dataDir);

  const markdownFile = path.join(dataDir, "note.md");
  await writeFile(markdownFile, "# 本地解析\n\nMarkdown 文档应该直接抽取为文本。");
  const markdown = await importFile("Markdown 本地解析", markdownFile);
  const markdownResult = await parseSource(markdown.source.source_id, {}, dataDir);
  assertEqual(markdownResult.status, "success", "markdown parse should succeed");
  const markdownSegments = await listMemorySegments(markdown.source.source_id, dataDir);
  assert(markdownSegments.length > 0, "markdown should create memory segments");
  assert(markdownSegments[0].title_path.includes("本地解析"), "segment should preserve markdown heading path");
  assert(markdownSegments[0].content_hash, "segment should include stable content hash");
  assert(markdownSegments[0].end_offset > markdownSegments[0].start_offset, "segment should include source offsets");
  assert(markdownSegments[0].char_count > 0, "segment should include char count");
  assert(markdownSegments[0].token_count > 0, "segment should include token count");
  assertEqual(markdownSegments[0].parser_version, "v2", "segment should record parser version");
  const firstSegmentCount = markdownSegments.length;
  const duplicateParse = await parseSource(markdown.source.source_id, {}, dataDir);
  assertEqual(duplicateParse.status, "already_parsed", "re-parsing indexed source should be idempotent");
  assertEqual((await listMemorySegments(markdown.source.source_id, dataDir)).length, firstSegmentCount, "re-parsing should not duplicate segments");
  const graph = await getGraph(dataDir);
  assert(graph.nodes.some((node) => node.node_type === "keyword"), "parse should create keyword graph nodes from content");

  const uploadedMarkdown = await importUploadedFile("上传 Markdown.md", "# 上传解析\n\n浏览器上传文件应该保存到本地。");
  const uploadedResult = await parseSource(uploadedMarkdown.source.source_id, {}, dataDir);
  assertEqual(uploadedResult.status, "success", "uploaded markdown should parse");
  assert((await listMemorySegments(uploadedMarkdown.source.source_id, dataDir)).length > 0, "uploaded file should enter memory");

  const lowQualityText = await importText("低质量占位文本", "test");
  const lowQualityResult = await parseSource(lowQualityText.source.source_id, {}, dataDir);
  assertEqual(lowQualityResult.status, "quality_rejected", "low quality text should not enter memory");
  assertEqual((await listMemorySegments(lowQualityText.source.source_id, dataDir)).length, 0, "rejected source should not create segments");
  const lowQualitySource = await getSourceById(lowQualityText.source.source_id, dataDir);
  assertEqual(lowQualitySource.memory_status, "memory_rejected", "rejected source should be marked as not indexed");

  const firstText = await importText("跨笔记关键词 A", "飞书同步 可以降低导入成本。知识图谱 可以关联笔记。");
  await parseSource(firstText.source.source_id, {}, dataDir);
  const secondText = await importText("跨笔记关键词 B", "飞书同步 可以连接不同笔记。向量搜索 可以辅助知识图谱。");
  await parseSource(secondText.source.source_id, {}, dataDir);
  const linkedGraph = await getGraph(dataDir);
  const sharedKeywords = linkedGraph.nodes.filter((node) => node.node_type === "keyword" && node.label === "飞书同步");
  assertEqual(sharedKeywords.length, 1, "same keyword should be shared across notes");
  const sharedKeywordId = sharedKeywords[0].node_id;
  const incomingMentions = linkedGraph.edges.filter((edge) => edge.to_node_id === sharedKeywordId && edge.edge_type === "mentions_keyword");
  assert(incomingMentions.length >= 2, "shared keyword should link multiple notes");
  const limitedGraph = await getGraph(dataDir, { limit: 2 });
  assert(limitedGraph.nodes.length <= 2, "graph overview should respect limit");
  const neighborGraph = await getGraphNeighbors(sharedKeywordId, dataDir, { limit: 10 });
  assert(neighborGraph.nodes.some((node) => node.node_id === sharedKeywordId), "neighbor graph should include selected node");
  const searchSubgraph = await searchGraphSubgraph("飞书同步", dataDir);
  assert(searchSubgraph.matched_node_ids.includes(sharedKeywordId), "search subgraph should include matched keyword");
  assert(searchSubgraph.edges.length > 0, "search subgraph should include related edges");
  const communities = await getGraphCommunities(dataDir);
  assert(communities.nodes.some((node) => node.node_id === "community:keyword"), "community overview should include keyword group");
  assert(communities.edges.length > 0, "community overview should include grouped relations");
  const keywordTypeGraph = await getGraphByNodeType("keyword", dataDir, { seedLimit: 10 });
  assert(keywordTypeGraph.nodes.some((node) => node.node_type === "keyword"), "type subgraph should include keyword nodes");
  assert(keywordTypeGraph.edges.length > 0, "type subgraph should include nearby relations");

  const rebuildResult = await rebuildGraphIndex(dataDir);
  assert(rebuildResult.source_count >= 2, "graph rebuild should process parsed notes");
  const rebuiltGraph = await getGraph(dataDir);
  const rebuiltSharedKeywords = rebuiltGraph.nodes.filter((node) => node.node_type === "keyword" && node.label === "飞书同步");
  assertEqual(rebuiltSharedKeywords.length, 1, "rebuilt graph should keep shared keyword nodes");
  const rebuiltMentions = rebuiltGraph.edges.filter((edge) =>
    edge.to_node_id === rebuiltSharedKeywords[0].node_id && edge.edge_type === "mentions_keyword"
  );
  assert(rebuiltMentions.length >= 2, "rebuilt graph should keep cross-note keyword links");

  const vectorRebuild = await rebuildVectorIndex(dataDir);
  assert(vectorRebuild.vector_count >= 2, "vector rebuild should index parsed segments");
  assert(vectorRebuild.embedding_model, "vector rebuild should report embedding model");
  assert(vectorRebuild.embedding_dimension, "vector rebuild should report embedding dimension");
  const vectorResults = await vectorSearch("飞书同步", dataDir);
  assert(vectorResults.some((item) => item.source_id === firstText.source.source_id), "rebuilt vectors should be searchable");

  const longText = await importText(
    "长文本中文分块",
    [
      "# 第一章",
      "春和雅苑".repeat(120),
      "",
      "## 第二节",
      "向量检索需要稳定分块和可追溯位置。".repeat(90)
    ].join("\n")
  );
  await parseSource(longText.source.source_id, {}, dataDir);
  const longSegments = await listMemorySegments(longText.source.source_id, dataDir);
  assert(longSegments.length >= 2, "long Chinese text should split into multiple chunks");
  assert(longSegments.every((segment) => segment.content_hash), "long chunks should include hashes");
  assert(longSegments.every((segment) => segment.title_path), "long chunks should keep title paths");
  assert(longSegments.every((segment) => segment.end_offset > segment.start_offset), "long chunks should keep offsets");

  const douyinUrl = await importUrl("抖音分享链接", "https://v.douyin.com/example/");
  assertEqual(douyinUrl.source.source_platform, "douyin", "douyin url should be classified");
  assertEqual(douyinUrl.source.parse_status, "export_required", "video share url should wait for export or platform parser");
  const feishuUrl = await importUrl("飞书文档链接", "https://example.feishu.cn/docx/example");
  const tencentDocsUrl = await importUrl("腾讯文档链接", "https://docs.qq.com/doc/example");
  const folders = await listSourceFolders(dataDir);
  assertEqual(folders.assignments[feishuUrl.source.source_id], "feishu-space", "feishu url should be assigned to feishu folder");
  assertEqual(tencentDocsUrl.source.source_platform, "tencent_docs", "tencent docs url should be classified");
  assertEqual(tencentDocsUrl.source.parse_status, "export_required", "tencent docs should require export before parser adapter exists");
  assertEqual(folders.assignments[tencentDocsUrl.source.source_id], "tencent-docs-space", "tencent docs url should be assigned to tencent folder");

  const pdfFile = path.join(dataDir, "fake.pdf");
  await writeFile(pdfFile, "%PDF-1.4\nfake pdf");
  const pdf = await importFile("PDF 工具缺失提示", pdfFile);
  const pdfResult = await parseSource(pdf.source.source_id, {}, dataDir);
  assertEqual(pdfResult.status, "failed", "pdf parse without valid tool/input should fail clearly");
  assert(
    pdfResult.error.includes("PDF 本地解析失败") || pdfResult.error.includes("系统缺少 pdftotext"),
    `unexpected pdf error: ${pdfResult.error}`
  );

  // 图片无本地 OCR(tesseract)时:文本模型收不到图,不应"假兜底"把寒暄写进记忆。
  // 应显式失败 + needs_ocr,且不入记忆(修复 #29)。
  const imageFile = path.join(dataDir, "fake.png");
  await writeFile(imageFile, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const image = await importFile("图片 OCR 兜底", imageFile);
  const fallback = await parseSource(image.source.source_id, { llm_fallback: true }, dataDir);
  assertEqual(fallback.status, "failed", "image without OCR should fail clearly, not fake-fallback");
  assert(fallback.needs_ocr === true, "image fallback should flag needs_ocr");

  const imageSource = await getSourceById(image.source.source_id, dataDir);
  assert(imageSource.memory_status !== "memory_indexed", "image without OCR must not enter memory");
  assertEqual(imageSource.parse_status, "parse_failed", "image without OCR should be parse_failed");
}

async function importFile(title, filePath) {
  return handleImport(
    {
      entrypoint: "parser_smoke_test",
      source_hint: "file",
      payload: { title, file_path: filePath }
    },
    dataDir
  );
}

async function importText(title, text) {
  return handleImport(
    {
      entrypoint: "parser_smoke_test",
      source_hint: "text",
      payload: { title, text }
    },
    dataDir
  );
}

async function importUrl(title, url) {
  return handleImport(
    {
      entrypoint: "parser_smoke_test",
      source_hint: "url",
      payload: { title, url }
    },
    dataDir
  );
}

async function importUploadedFile(name, text) {
  return handleImport(
    {
      entrypoint: "parser_smoke_test",
      source_hint: "file_upload",
      payload: {
        name,
        base64: Buffer.from(text).toString("base64")
      }
    },
    dataDir
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}
