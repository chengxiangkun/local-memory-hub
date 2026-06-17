import {
  copyRawFile,
  createSourceRecord,
  getFileInfo,
  getDataDir,
  hashFile,
  hashContent,
  writeRawLink,
  writeRawText
} from "./data-store.js";
import { insertSourceSqlite } from "./sqlite-store.js";

export class ImporterRegistry {
  constructor(importers) {
    this.importers = importers;
  }

  select(request) {
    const candidates = this.importers
      .map((importer) => ({
        importer,
        result: importer.canHandle(request)
      }))
      .filter((item) => item.result.supported)
      .sort((a, b) => b.result.confidence - a.result.confidence);

    if (candidates.length === 0) {
      throw new Error(`没有可用导入器：${request.entrypoint}`);
    }

    return candidates[0].importer;
  }
}

export class TextImporter {
  name = "TextImporter";

  canHandle(request) {
    return {
      supported: request.source_hint === "text" && Boolean(request.payload?.text),
      confidence: 100
    };
  }

  async import(request, context) {
    const text = request.payload.text;
    const contentHash = hashContent(text);
    const record = createSourceRecord({
      title: request.payload.title || text.slice(0, 32) || "文本资料",
      source_type: "text",
      source_platform: "local",
      entrypoint: request.entrypoint,
      content_hash: contentHash
    });
    record.local_file_path = await writeRawText(record.source_id, text, context.dataDir);
    return insertSourceSqlite(record, context.dataDir);
  }
}

export class FileImporter {
  name = "FileImporter";

  canHandle(request) {
    return {
      supported: request.source_hint === "file" && Boolean(request.payload?.file_path),
      confidence: 100
    };
  }

  async import(request, context) {
    const filePath = request.payload.file_path;
    const fileInfo = await getFileInfo(filePath);
    const contentHash = await hashFile(filePath);
    const record = createSourceRecord({
      title: request.payload.title || fileInfo.name,
      source_type: "file",
      source_platform: "local",
      entrypoint: request.entrypoint,
      content_hash: contentHash
    });
    record.local_file_path = await copyRawFile(record.source_id, filePath, context.dataDir);
    return insertSourceSqlite(record, context.dataDir);
  }
}

export class UrlImporter {
  name = "UrlImporter";

  canHandle(request) {
    return {
      supported: request.source_hint === "url" && Boolean(request.payload?.url),
      confidence: 90
    };
  }

  async import(request, context) {
    const url = request.payload.url;
    const contentHash = hashContent(url);
    const record = createSourceRecord({
      title: request.payload.title || url,
      source_type: "url",
      source_platform: detectPlatform(url),
      entrypoint: request.entrypoint,
      original_url: url,
      canonical_url: normalizeUrl(url),
      content_hash: contentHash
    });
    record.local_file_path = await writeRawLink(record.source_id, url, context.dataDir);
    return insertSourceSqlite(record, context.dataDir);
  }
}

export async function handleImport(request, dataDir = getDataDir()) {
  const registry = new ImporterRegistry([new FileImporter(), new TextImporter(), new UrlImporter()]);
  const importer = registry.select(request);
  const result = await importer.import(request, { dataDir });

  return {
    status: result.duplicate ? "duplicate" : "success",
    importer: importer.name,
    source: result.source,
    next_action: "parse_queued"
  };
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes("feishu")) return "feishu";
    if (host.includes("youdao")) return "youdao";
    if (host.includes("bilibili")) return "bilibili";
    if (host.includes("youtube") || host.includes("youtu.be")) return "youtube";
    return "web";
  } catch {
    return "web";
  }
}
