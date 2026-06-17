import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { getDataDir, initDataDir } from "./data-store.js";

const execFileAsync = promisify(execFile);

export function dbPath(dataDir = getDataDir()) {
  return path.join(dataDir, "database", "main.sqlite");
}

export async function initSqlite(dataDir = getDataDir()) {
  await initDataDir(dataDir);
  await runSql(
    `
    CREATE TABLE IF NOT EXISTS sources (
      source_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_platform TEXT NOT NULL,
      entrypoint TEXT NOT NULL,
      original_url TEXT,
      canonical_url TEXT,
      local_file_path TEXT,
      content_hash TEXT NOT NULL UNIQUE,
      import_status TEXT NOT NULL,
      parse_status TEXT NOT NULL,
      memory_status TEXT NOT NULL,
      trace_status TEXT NOT NULL,
      pollution_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sources_title ON sources(title);
    CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);
    CREATE INDEX IF NOT EXISTS idx_sources_platform ON sources(source_platform);

    CREATE TABLE IF NOT EXISTS parse_jobs (
      job_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL,
      parser_name TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extracted_texts (
      extracted_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      text_path TEXT NOT NULL,
      text_preview TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_segments (
      segment_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      segment_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      trace_position TEXT,
      pollution_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS graph_nodes (
      node_id TEXT PRIMARY KEY,
      source_id TEXT,
      node_type TEXT NOT NULL,
      label TEXT NOT NULL,
      pollution_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS graph_edges (
      edge_id TEXT PRIMARY KEY,
      from_node_id TEXT NOT NULL,
      to_node_id TEXT NOT NULL,
      edge_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parser_improvements (
      improvement_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      failure_pattern TEXT NOT NULL,
      local_error TEXT NOT NULL,
      llm_corrected_output TEXT NOT NULL,
      generated_rule TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vector_index (
      vector_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      segment_id TEXT NOT NULL,
      vector_json TEXT NOT NULL,
      pollution_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_parse_jobs_source ON parse_jobs(source_id);
    CREATE INDEX IF NOT EXISTS idx_extracted_texts_source ON extracted_texts(source_id);
    CREATE INDEX IF NOT EXISTS idx_memory_segments_source ON memory_segments(source_id);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_source ON graph_nodes(source_id);
    CREATE INDEX IF NOT EXISTS idx_parser_improvements_source ON parser_improvements(source_id);
    CREATE INDEX IF NOT EXISTS idx_vector_index_source ON vector_index(source_id);
    `,
    dataDir
  );
}

export async function insertSourceSqlite(source, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const existing = await getSourceByHash(source.content_hash, dataDir);
  if (existing) return { source: existing, duplicate: true };

  await runSql(
    `
    INSERT INTO sources (
      source_id, title, source_type, source_platform, entrypoint,
      original_url, canonical_url, local_file_path, content_hash,
      import_status, parse_status, memory_status, trace_status, pollution_status,
      created_at, updated_at
    ) VALUES (
      $source_id, $title, $source_type, $source_platform, $entrypoint,
      $original_url, $canonical_url, $local_file_path, $content_hash,
      $import_status, $parse_status, $memory_status, $trace_status, $pollution_status,
      $created_at, $updated_at
    );
    `,
    dataDir,
    source
  );

  return { source, duplicate: false };
}

export async function listSourcesSqlite(dataDir = getDataDir()) {
  await initSqlite(dataDir);
  return queryJson("SELECT * FROM sources ORDER BY created_at DESC;", dataDir);
}

export async function searchSourcesSqlite(query, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  return queryJson(
    `
    SELECT * FROM sources
    WHERE pollution_status != 'quarantined'
      AND (
        title LIKE $like
        OR source_type LIKE $like
        OR source_platform LIKE $like
        OR original_url LIKE $like
        OR local_file_path LIKE $like
      )
    ORDER BY created_at DESC;
    `,
    dataDir,
    { like: `%${query}%` }
  );
}

export async function searchAllSqlite(query, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  return queryJson(
    `
    SELECT
      s.*,
      e.text_preview AS extracted_preview,
      m.text AS segment_text
    FROM sources s
    LEFT JOIN extracted_texts e ON e.source_id = s.source_id
    LEFT JOIN memory_segments m ON m.source_id = s.source_id AND m.pollution_status != 'quarantined'
    WHERE s.pollution_status != 'quarantined'
      AND (
        s.title LIKE $like
        OR s.source_type LIKE $like
        OR s.source_platform LIKE $like
        OR s.original_url LIKE $like
        OR s.local_file_path LIKE $like
        OR e.text_preview LIKE $like
        OR m.text LIKE $like
      )
    GROUP BY s.source_id
    ORDER BY s.created_at DESC;
    `,
    dataDir,
    { like: `%${query}%` }
  );
}

export async function updateSourceStatuses(sourceId, statuses, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const sets = Object.keys(statuses).map((key) => `${key} = $${key}`).join(", ");
  await runSql(
    `
    UPDATE sources
    SET ${sets}, updated_at = $updated_at
    WHERE source_id = $source_id;
    `,
    dataDir,
    {
      ...statuses,
      updated_at: new Date().toISOString(),
      source_id: sourceId
    }
  );
}

export async function getSourceById(sourceId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const rows = await queryJson("SELECT * FROM sources WHERE source_id = $source_id LIMIT 1;", dataDir, {
    source_id: sourceId
  });
  return rows[0] || null;
}

export async function insertParseJob(job, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await runSql(
    `
    INSERT INTO parse_jobs (
      job_id, source_id, status, parser_name, error_message, created_at, updated_at
    ) VALUES (
      $job_id, $source_id, $status, $parser_name, $error_message, $created_at, $updated_at
    );
    `,
    dataDir,
    job
  );
  return job;
}

export async function updateParseJob(jobId, fields, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const sets = Object.keys(fields).map((key) => `${key} = $${key}`).join(", ");
  await runSql(
    `
    UPDATE parse_jobs
    SET ${sets}, updated_at = $updated_at
    WHERE job_id = $job_id;
    `,
    dataDir,
    {
      ...fields,
      updated_at: new Date().toISOString(),
      job_id: jobId
    }
  );
}

export async function insertExtractedText(record, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await runSql(
    `
    INSERT INTO extracted_texts (
      extracted_id, source_id, text_path, text_preview, created_at
    ) VALUES (
      $extracted_id, $source_id, $text_path, $text_preview, $created_at
    );
    `,
    dataDir,
    record
  );
  return record;
}

export async function insertMemorySegments(records, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  for (const record of records) {
    await runSql(
      `
      INSERT INTO memory_segments (
        segment_id, source_id, segment_index, text, trace_position, pollution_status, created_at
      ) VALUES (
        $segment_id, $source_id, $segment_index, $text, $trace_position, $pollution_status, $created_at
      );
      `,
      dataDir,
      record
    );
  }
  return records;
}

export async function listMemorySegments(sourceId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  return queryJson(
    `
    SELECT * FROM memory_segments
    WHERE source_id = $source_id
      AND pollution_status != 'quarantined'
    ORDER BY segment_index ASC;
    `,
    dataDir,
    { source_id: sourceId }
  );
}

export async function insertGraphNodes(records, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  for (const record of records) {
    await runSql(
      `
      INSERT INTO graph_nodes (
        node_id, source_id, node_type, label, pollution_status, created_at
      ) VALUES (
        $node_id, $source_id, $node_type, $label, $pollution_status, $created_at
      );
      `,
      dataDir,
      record
    );
  }
  return records;
}

export async function insertGraphEdges(records, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  for (const record of records) {
    await runSql(
      `
      INSERT INTO graph_edges (
        edge_id, from_node_id, to_node_id, edge_type, reason, created_at
      ) VALUES (
        $edge_id, $from_node_id, $to_node_id, $edge_type, $reason, $created_at
      );
      `,
      dataDir,
      record
    );
  }
  return records;
}

export async function insertParserImprovement(record, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await runSql(
    `
    INSERT INTO parser_improvements (
      improvement_id, source_id, failure_pattern, local_error,
      llm_corrected_output, generated_rule, confidence, created_at
    ) VALUES (
      $improvement_id, $source_id, $failure_pattern, $local_error,
      $llm_corrected_output, $generated_rule, $confidence, $created_at
    );
    `,
    dataDir,
    record
  );
  return record;
}

export async function insertVectors(records, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  for (const record of records) {
    await runSql(
      `
      INSERT INTO vector_index (
        vector_id, source_id, segment_id, vector_json, pollution_status, created_at
      ) VALUES (
        $vector_id, $source_id, $segment_id, $vector_json, $pollution_status, $created_at
      );
      `,
      dataDir,
      record
    );
  }
  return records;
}

export async function listVectors(dataDir = getDataDir()) {
  await initSqlite(dataDir);
  return queryJson(
    `
    SELECT
      v.*,
      m.text,
      s.title,
      s.source_type,
      s.source_platform
    FROM vector_index v
    JOIN memory_segments m ON m.segment_id = v.segment_id
    JOIN sources s ON s.source_id = v.source_id
    WHERE v.pollution_status != 'quarantined'
      AND m.pollution_status != 'quarantined'
      AND s.pollution_status != 'quarantined';
    `,
    dataDir
  );
}

export async function getGraph(dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const nodes = await queryJson(
    `
    SELECT * FROM graph_nodes
    WHERE pollution_status != 'quarantined'
    ORDER BY created_at DESC;
    `,
    dataDir
  );
  const edges = await queryJson(
    `
    SELECT e.* FROM graph_edges e
    JOIN graph_nodes a ON a.node_id = e.from_node_id
    JOIN graph_nodes b ON b.node_id = e.to_node_id
    WHERE a.pollution_status != 'quarantined'
      AND b.pollution_status != 'quarantined'
    ORDER BY e.created_at DESC;
    `,
    dataDir
  );
  return { nodes, edges };
}

export async function searchGraph(query, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const nodes = await queryJson(
    `
    SELECT * FROM graph_nodes
    WHERE pollution_status != 'quarantined'
      AND (
        label LIKE $like
        OR node_type LIKE $like
      )
    ORDER BY created_at DESC;
    `,
    dataDir,
    { like: `%${query}%` }
  );
  return { query, nodes };
}

export async function quarantineSourceCascade(sourceId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await updateSourceStatuses(sourceId, { pollution_status: "quarantined" }, dataDir);
  await runSql(
    `
    UPDATE memory_segments
    SET pollution_status = 'quarantined'
    WHERE source_id = $source_id;

    UPDATE graph_nodes
    SET pollution_status = 'quarantined'
    WHERE source_id = $source_id;

    UPDATE vector_index
    SET pollution_status = 'quarantined'
    WHERE source_id = $source_id;
    `,
    dataDir,
    { source_id: sourceId }
  );
}

export async function restoreSourceCascade(sourceId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await updateSourceStatuses(sourceId, { pollution_status: "clean" }, dataDir);
  await runSql(
    `
    UPDATE memory_segments
    SET pollution_status = 'clean'
    WHERE source_id = $source_id;

    UPDATE graph_nodes
    SET pollution_status = 'clean'
    WHERE source_id = $source_id;

    UPDATE vector_index
    SET pollution_status = 'clean'
    WHERE source_id = $source_id;
    `,
    dataDir,
    { source_id: sourceId }
  );
}

export async function getImpactScope(sourceId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const source = await getSourceById(sourceId, dataDir);
  const segments = await queryJson(
    `
    SELECT segment_id, segment_index, pollution_status, trace_position
    FROM memory_segments
    WHERE source_id = $source_id
    ORDER BY segment_index ASC;
    `,
    dataDir,
    { source_id: sourceId }
  );
  const nodes = await queryJson(
    `
    SELECT node_id, node_type, label, pollution_status
    FROM graph_nodes
    WHERE source_id = $source_id
    ORDER BY created_at DESC;
    `,
    dataDir,
    { source_id: sourceId }
  );
  const edges = await queryJson(
    `
    SELECT DISTINCT e.*
    FROM graph_edges e
    JOIN graph_nodes n
      ON n.node_id = e.from_node_id OR n.node_id = e.to_node_id
    WHERE n.source_id = $source_id
    ORDER BY e.created_at DESC;
    `,
    dataDir,
    { source_id: sourceId }
  );

  return {
    source_id: sourceId,
    source,
    counts: {
      segments: segments.length,
      graph_nodes: nodes.length,
      graph_edges: edges.length
    },
    segments,
    graph_nodes: nodes,
    graph_edges: edges
  };
}

async function getSourceByHash(contentHash, dataDir) {
  const rows = await queryJson(
    "SELECT * FROM sources WHERE content_hash = $content_hash LIMIT 1;",
    dataDir,
    { content_hash: contentHash }
  );
  return rows[0] || null;
}

async function queryJson(sql, dataDir, params = {}) {
  const { stdout } = await sqliteExec(sql, dataDir, params, true);
  return stdout.trim() ? JSON.parse(stdout) : [];
}

async function runSql(sql, dataDir, params = {}) {
  await sqliteExec(sql, dataDir, params, false);
}

async function sqliteExec(sql, dataDir, params, json) {
  const args = [];
  if (json) args.push("-json");
  args.push(dbPath(dataDir));

  for (const [key, value] of Object.entries(params)) {
    args.push("-cmd", `.parameter set $${key} ${escapeParam(value)}`);
  }

  args.push(sql);
  return execFileAsync("sqlite3", args);
}

function escapeParam(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}
