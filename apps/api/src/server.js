import http from "node:http";
import { initDataDir } from "./data-store.js";
import { handleImport } from "./import-pipeline.js";
import { getVersionInfo, migrateIfNeeded } from "./migration-service.js";
import { initModelProviders, listProviderTemplates, routeChat } from "./model-provider.js";
import { parseSource } from "./parser-service.js";
import { vectorSearch } from "./vector-service.js";
import {
  getGraph,
  getImpactScope,
  initSqlite,
  listMemorySegments,
  listSourcesSqlite,
  quarantineSourceCascade,
  restoreSourceCascade,
  searchAllSqlite,
  searchGraph
} from "./sqlite-store.js";

const port = Number(process.env.LMH_PORT || 4317);
const dataInfo = await initDataDir();
await initSqlite(dataInfo.data_dir);
initModelProviders();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return json(res, 204, null);
    }

    if (req.method === "GET" && req.url === "/health") {
      const version = await getVersionInfo();
      return json(res, 200, {
        ok: true,
        service: "local-memory-hub-api",
        data_dir: version.data_dir,
        schema_version: version.schema_version,
        latest_schema_version: version.latest_schema_version
      });
    }

    if (req.method === "GET" && req.url === "/api/system/version") {
      return json(res, 200, await getVersionInfo());
    }

    if (req.method === "POST" && req.url === "/api/system/migrate") {
      return json(res, 200, await migrateIfNeeded());
    }

    if (req.method === "GET" && req.url === "/api/sources") {
      return json(res, 200, {
        sources: await listSourcesSqlite()
      });
    }

    if (req.method === "GET" && req.url === "/api/models/providers") {
      return json(res, 200, {
        providers: listProviderTemplates()
      });
    }

    if (req.method === "GET" && req.url?.startsWith("/api/search")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const query = url.searchParams.get("q") || "";
      return json(res, 200, {
        query,
        results: await searchAllSqlite(query)
      });
    }

    if (req.method === "GET" && req.url?.startsWith("/api/vector/search")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const query = url.searchParams.get("q") || "";
      return json(res, 200, {
        query,
        results: await vectorSearch(query)
      });
    }

    if (req.method === "GET" && req.url?.startsWith("/api/segments")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const sourceId = url.searchParams.get("source_id");
      return json(res, 200, {
        source_id: sourceId,
        segments: await listMemorySegments(sourceId)
      });
    }

    if (req.method === "GET" && req.url?.startsWith("/api/sources/impact")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const sourceId = url.searchParams.get("source_id");
      return json(res, 200, await getImpactScope(sourceId));
    }

    if (req.method === "GET" && req.url === "/api/graph") {
      return json(res, 200, await getGraph());
    }

    if (req.method === "GET" && req.url?.startsWith("/api/graph/search")) {
      const url = new URL(req.url, "http://127.0.0.1");
      const query = url.searchParams.get("q") || "";
      return json(res, 200, await searchGraph(query));
    }

    if (req.method === "POST" && req.url === "/api/import") {
      const body = await readJson(req);
      return json(res, 200, await handleImport(body));
    }

    if (req.method === "POST" && req.url === "/api/parse") {
      const body = await readJson(req);
      return json(res, 200, await parseSource(body.source_id, { llm_fallback: Boolean(body.llm_fallback) }));
    }

    if (req.method === "POST" && req.url === "/api/ask") {
      const body = await readJson(req);
      let results = await searchAllSqlite(body.question || "");
      if (results.length === 0) {
        results = await listSourcesSqlite();
      }
      return json(
        res,
        200,
        await routeChat({
          provider_id: body.provider_id || "mock",
          question: body.question || "",
          context: results.slice(0, 5),
          config: body.config || {}
        })
      );
    }

    if (req.method === "POST" && req.url === "/api/sources/quarantine") {
      const body = await readJson(req);
      await quarantineSourceCascade(body.source_id);
      return json(res, 200, {
        status: "quarantined",
        source_id: body.source_id
      });
    }

    if (req.method === "POST" && req.url === "/api/sources/restore") {
      const body = await readJson(req);
      await restoreSourceCascade(body.source_id);
      return json(res, 200, {
        status: "restored",
        source_id: body.source_id
      });
    }

    return json(res, 404, {
      error: "not_found"
    });
  } catch (error) {
    return json(res, 500, {
      error: "internal_error",
      message: error.message
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local Memory Hub API listening on http://127.0.0.1:${port}`);
  console.log(`Data directory: ${dataInfo.data_dir}`);
});

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(body === null ? "" : JSON.stringify(body, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
