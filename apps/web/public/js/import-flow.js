/**
 * Import flow.
 *
 * Owns the browser-side orchestration for text imports: save source, parse it,
 * and then ask the caller to refresh app state. Backend importer and parser
 * rules remain in the API service.
 */

import { post } from "./api.js";

export async function importExampleText(deps) {
  await importText(
    {
      title: `示例记忆 ${new Date().toLocaleTimeString()}`,
      text: "这是 Local Memory Hub 的第一条记忆。它会进入源资料库，解析成文本片段、向量索引和图谱节点。后续问答会引用源资料，污染治理也能追溯到这条源文件。"
    },
    deps
  );
}

export async function importText({ title, text }, { setStatus, refreshAll, setView }) {
  if (!text.trim()) {
    setStatus("导入失败：内容不能为空");
    return;
  }

  try {
    setStatus("保存源资料");
    const imported = await post("/api/import", {
      entrypoint: "web",
      source_hint: "text",
      payload: { title: title.trim() || "未命名文本", text }
    });
    if (imported.error) throw new Error(imported.message || imported.error);

    setStatus("本地解析并写入记忆");
    const parsed = await post("/api/parse", {
      source_id: imported.source.source_id,
      llm_fallback: true
    });
    if (!["success", "llm_fallback_success", "already_parsed"].includes(parsed.status)) {
      throw new Error(parsed.error || "解析失败");
    }

    await refreshAll();
    setView("graph");
    setStatus(`导入成功：${parsed.segment_count} 个文本片段，${parsed.graph_node_count} 个图谱节点`);
  } catch (error) {
    setStatus(`导入失败：${error.message}`);
  }
}

export async function importFile({ file }, { setStatus, refreshAll, setView }) {
  if (!file) {
    setStatus("导入失败：请选择文件");
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    setStatus("导入失败：当前最多支持 50MB 文件");
    return;
  }

  try {
    setStatus("保存文件源资料");
    const imported = await post("/api/import", {
      entrypoint: "web",
      source_hint: "file_upload",
      payload: {
        name: file.name,
        title: file.name,
        base64: await readFileAsBase64(file)
      }
    });
    if (imported.error) throw new Error(imported.message || imported.error);

    setStatus("本地解析文件");
    const parsed = await post("/api/parse", {
      source_id: imported.source.source_id,
      llm_fallback: true
    });

    await refreshAll();
    setView(["success", "llm_fallback_success", "already_parsed"].includes(parsed.status) ? "graph" : "sources");
    setStatus(["success", "llm_fallback_success", "already_parsed"].includes(parsed.status)
      ? `文件导入成功：${parsed.segment_count || 0} 个文本片段`
      : `文件已保存，解析失败：${parsed.error || parsed.status}`);
  } catch (error) {
    setStatus(`文件导入失败：${error.message}`);
  }
}

export async function importUrl({ url }, { setStatus, refreshAll, setView }) {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    setStatus("导入失败：链接不能为空");
    return;
  }

  try {
    setStatus("保存链接源资料");
    const imported = await post("/api/import", {
      entrypoint: "web",
      source_hint: "url",
      payload: { url: cleanUrl, title: cleanUrl }
    });
    if (imported.error) throw new Error(imported.message || imported.error);

    await refreshAll();
    setView("sources");
    setStatus("链接已保存，等待后续解析或导出");
  } catch (error) {
    setStatus(`链接导入失败：${error.message}`);
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}
