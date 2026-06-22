import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { getDataDir, initDataDir } from "./data-store.js";

const execFileAsync = promisify(execFile);
const sqliteInitPromises = new Map();

export function dbPath(dataDir = getDataDir()) {
  return path.join(dataDir, "database", "main.sqlite");
}

export async function initSqlite(dataDir = getDataDir()) {
  const key = dbPath(dataDir);
  if (sqliteInitPromises.has(key)) return sqliteInitPromises.get(key);
  const initPromise = initSqliteOnce(dataDir).catch((error) => {
    sqliteInitPromises.delete(key);
    throw error;
  });
  sqliteInitPromises.set(key, initPromise);
  return initPromise;
}

async function initSqliteOnce(dataDir) {
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
      title_path TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      trace_position TEXT,
      start_offset INTEGER NOT NULL DEFAULT 0,
      end_offset INTEGER NOT NULL DEFAULT 0,
      char_count INTEGER NOT NULL DEFAULT 0,
      token_count INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL DEFAULT '',
      parser_name TEXT NOT NULL DEFAULT 'unknown',
      parser_version TEXT NOT NULL DEFAULT 'unknown',
      pollution_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
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
      embedding_provider TEXT NOT NULL DEFAULT 'local_weak',
      embedding_model TEXT NOT NULL DEFAULT 'local-weak-bigram-v1',
      embedding_dimension INTEGER NOT NULL DEFAULT 32,
      chunk_hash TEXT NOT NULL DEFAULT '',
      pollution_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_parse_jobs_source ON parse_jobs(source_id);
    CREATE INDEX IF NOT EXISTS idx_extracted_texts_source ON extracted_texts(source_id);
    CREATE INDEX IF NOT EXISTS idx_memory_segments_source ON memory_segments(source_id);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_source ON graph_nodes(source_id);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_type_label ON graph_nodes(node_type, label);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON graph_edges(from_node_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON graph_edges(to_node_id);
    CREATE INDEX IF NOT EXISTS idx_parser_improvements_source ON parser_improvements(source_id);
    CREATE INDEX IF NOT EXISTS idx_vector_index_source ON vector_index(source_id);

    CREATE TABLE IF NOT EXISTS qa_sessions (
      session_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qa_messages (
      message_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      citations_json TEXT NOT NULL DEFAULT '[]',
      memory_status TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_qa_messages_session ON qa_messages(session_id, created_at);

    CREATE TABLE IF NOT EXISTS governance_events (
      event_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      source_id TEXT NOT NULL DEFAULT '',
      segment_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_governance_events_created ON governance_events(created_at);
    `,
    dataDir
  );
  await ensureMemorySegmentColumns(dataDir);
  await ensureVectorIndexColumns(dataDir);
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

export async function createQaSession(input = {}, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const now = new Date().toISOString();
  const session = {
    session_id: input.session_id || randomUUID(),
    title: input.title || "新的资料对话",
    created_at: input.created_at || now,
    updated_at: input.updated_at || now
  };
  await runSql(
    `
    INSERT INTO qa_sessions (session_id, title, created_at, updated_at)
    VALUES ($session_id, $title, $created_at, $updated_at);
    `,
    dataDir,
    session
  );
  return session;
}

export async function getOrCreateQaSession(sessionId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  if (sessionId) {
    const existing = await getQaSession(sessionId, dataDir);
    if (existing) return existing;
  }
  return createQaSession({}, dataDir);
}

export async function getQaSession(sessionId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const rows = await queryJson("SELECT * FROM qa_sessions WHERE session_id = $session_id LIMIT 1;", dataDir, {
    session_id: sessionId
  });
  return rows[0] || null;
}

export async function listQaMessages(sessionId, dataDir = getDataDir(), options = {}) {
  await initSqlite(dataDir);
  const limit = Math.max(1, Math.min(Number(options.limit || 80), 200));
  const rows = await queryJson(
    `
    SELECT * FROM qa_messages
    WHERE session_id = $session_id
    ORDER BY created_at ASC
    LIMIT $limit;
    `,
    dataDir,
    { session_id: sessionId, limit }
  );
  return rows.map((row) => ({
    ...row,
    citations: parseJsonArray(row.citations_json)
  }));
}

export async function listRecentQaMessages(sessionId, dataDir = getDataDir(), options = {}) {
  await initSqlite(dataDir);
  const limit = Math.max(1, Math.min(Number(options.limit || 6), 20));
  const rows = await queryJson(
    `
    SELECT * FROM qa_messages
    WHERE session_id = $session_id
    ORDER BY created_at DESC
    LIMIT $limit;
    `,
    dataDir,
    { session_id: sessionId, limit }
  );
  return rows.reverse().map((row) => ({
    ...row,
    citations: parseJsonArray(row.citations_json)
  }));
}

export async function appendQaMessage(input, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const now = input.created_at || new Date().toISOString();
  const message = {
    message_id: input.message_id || randomUUID(),
    session_id: input.session_id,
    role: input.role,
    content: input.content || "",
    model: input.model || "",
    citations_json: JSON.stringify(input.citations || []),
    memory_status: input.memory_status || "",
    created_at: now
  };
  await runSql(
    `
    INSERT INTO qa_messages (
      message_id, session_id, role, content, model, citations_json, memory_status, created_at
    ) VALUES (
      $message_id, $session_id, $role, $content, $model, $citations_json, $memory_status, $created_at
    );
    UPDATE qa_sessions
    SET updated_at = $created_at,
        title = CASE
          WHEN title = '新的资料对话' AND $role = 'user' THEN substr($content, 1, 40)
          ELSE title
        END
    WHERE session_id = $session_id;
    `,
    dataDir,
    message
  );
  return {
    ...message,
    citations: input.citations || []
  };
}

export async function clearQaSession(sessionId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await runSql(
    `
    DELETE FROM qa_messages WHERE session_id = $session_id;
    UPDATE qa_sessions
    SET title = '新的资料对话',
        updated_at = $updated_at
    WHERE session_id = $session_id;
    `,
    dataDir,
    {
      session_id: sessionId,
      updated_at: new Date().toISOString()
    }
  );
  return getQaSession(sessionId, dataDir);
}

export async function listQaSessions(dataDir = getDataDir(), options = {}) {
  await initSqlite(dataDir);
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 500));
  return queryJson(
    `
    SELECT
      s.session_id,
      s.title,
      s.created_at,
      s.updated_at,
      (SELECT COUNT(*) FROM qa_messages m WHERE m.session_id = s.session_id) AS message_count
    FROM qa_sessions s
    ORDER BY s.updated_at DESC
    LIMIT $limit;
    `,
    dataDir,
    { limit }
  );
}

export async function renameQaSession(sessionId, title, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const nextTitle = String(title || "").trim();
  if (!nextTitle) throw new Error("会话标题不能为空");
  await runSql(
    `
    UPDATE qa_sessions
    SET title = $title,
        updated_at = $updated_at
    WHERE session_id = $session_id;
    `,
    dataDir,
    {
      session_id: sessionId,
      title: nextTitle.slice(0, 80),
      updated_at: new Date().toISOString()
    }
  );
  return getQaSession(sessionId, dataDir);
}

export async function deleteQaSession(sessionId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await runSql(
    `
    DELETE FROM qa_messages WHERE session_id = $session_id;
    DELETE FROM qa_sessions WHERE session_id = $session_id;
    `,
    dataDir,
    { session_id: sessionId }
  );
  return { session_id: sessionId, deleted: true };
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

export async function searchAllSqlite(query, dataDir = getDataDir(), options = {}) {
  await initSqlite(dataDir);
  const includeConversationMemory = options.includeConversationMemory !== false;
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
      AND s.import_status != 'deleted'
      AND ($include_conversation_memory = 1 OR s.entrypoint != 'qa_conversation')
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
    {
      include_conversation_memory: includeConversationMemory ? 1 : 0,
      like: `%${query}%`
    }
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
    const normalized = normalizeMemorySegment(record);
    await runSql(
      `
      INSERT INTO memory_segments (
        segment_id, source_id, segment_index, title_path, text, trace_position,
        start_offset, end_offset, char_count, token_count, content_hash,
        parser_name, parser_version, pollution_status, created_at, updated_at
      ) VALUES (
        $segment_id, $source_id, $segment_index, $title_path, $text, $trace_position,
        $start_offset, $end_offset, $char_count, $token_count, $content_hash,
        $parser_name, $parser_version, $pollution_status, $created_at, $updated_at
      );
      `,
      dataDir,
      normalized
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

// 列出源资料的全部片段，包含已隔离的，供详情页/治理页展示和恢复使用。
export async function listAllMemorySegments(sourceId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  return queryJson(
    `
    SELECT * FROM memory_segments
    WHERE source_id = $source_id
    ORDER BY segment_index ASC;
    `,
    dataDir,
    { source_id: sourceId }
  );
}

export async function getMemorySegmentById(segmentId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const rows = await queryJson(
    "SELECT * FROM memory_segments WHERE segment_id = $segment_id LIMIT 1;",
    dataDir,
    { segment_id: segmentId }
  );
  return rows[0] || null;
}

// 片段级隔离：只翻转单个片段(及其向量)的污染状态，不连累整篇源资料。
// status 取 'quarantined' 隔离或 'clean' 恢复。检索层(listMemorySegments、
// searchAllSqlite、listVectors)已按 pollution_status 过滤，因此隔离后立即生效。
export async function setSegmentPollutionStatus(segmentId, status, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const now = new Date().toISOString();
  await runSql(
    `
    UPDATE memory_segments SET pollution_status = $status, updated_at = $updated_at WHERE segment_id = $segment_id;
    UPDATE vector_index SET pollution_status = $status WHERE segment_id = $segment_id;
    `,
    dataDir,
    { segment_id: segmentId, status, updated_at: now }
  );
  return getMemorySegmentById(segmentId, dataDir);
}

export async function appendGovernanceEvents(events, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const list = Array.isArray(events) ? events : [events];
  if (list.length === 0) return 0;
  const now = new Date().toISOString();
  for (const event of list) {
    await runSql(
      `
      INSERT INTO governance_events (
        event_id, scope, source_id, segment_id, title, action, reason, detail_json, created_at
      ) VALUES (
        $event_id, $scope, $source_id, $segment_id, $title, $action, $reason, $detail_json, $created_at
      );
      `,
      dataDir,
      {
        event_id: randomUUID(),
        scope: event.scope || "qa_memory",
        source_id: event.source_id || "",
        segment_id: event.segment_id || "",
        title: event.title || "",
        action: event.action || "",
        reason: event.reason || "",
        detail_json: JSON.stringify(event.detail || {}),
        created_at: event.created_at || now
      }
    );
  }
  return list.length;
}

export async function listGovernanceEvents(dataDir = getDataDir(), options = {}) {
  await initSqlite(dataDir);
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
  const rows = await queryJson(
    `
    SELECT * FROM governance_events
    ORDER BY created_at DESC
    LIMIT $limit;
    `,
    dataDir,
    { limit }
  );
  return rows.map((row) => ({ ...row, detail: parseJsonObject(row.detail_json) }));
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

export async function getGraphNodeByTypeAndLabel(nodeType, label, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const rows = await queryJson(
    `
    SELECT * FROM graph_nodes
    WHERE node_type = $node_type
      AND label = $label
      AND pollution_status != 'quarantined'
    ORDER BY created_at ASC
    LIMIT 1;
    `,
    dataDir,
    { node_type: nodeType, label }
  );
  return rows[0] || null;
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

export async function clearGraph(dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await runSql(
    `
    DELETE FROM graph_edges;
    DELETE FROM graph_nodes;
    `,
    dataDir
  );
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
        vector_id, source_id, segment_id, vector_json,
        embedding_provider, embedding_model, embedding_dimension, chunk_hash,
        pollution_status, created_at
      ) VALUES (
        $vector_id, $source_id, $segment_id, $vector_json,
        $embedding_provider, $embedding_model, $embedding_dimension, $chunk_hash,
        $pollution_status, $created_at
      );
      `,
      dataDir,
      normalizeVectorRecord(record)
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
      m.content_hash,
      s.title,
      s.source_type,
      s.source_platform,
      s.entrypoint
    FROM vector_index v
    JOIN memory_segments m ON m.segment_id = v.segment_id
    JOIN sources s ON s.source_id = v.source_id
    WHERE v.pollution_status != 'quarantined'
      AND m.pollution_status != 'quarantined'
      AND s.pollution_status != 'quarantined'
      AND s.import_status != 'deleted';
    `,
    dataDir
  );
}

export async function clearVectors(dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await runSql("DELETE FROM vector_index;", dataDir);
}

export async function getGraph(dataDir = getDataDir(), options = {}) {
  await initSqlite(dataDir);
  const limit = Math.max(1, Math.min(Number(options.limit || 200), 1000));
  const nodes = await queryJson(
    `
    SELECT * FROM graph_nodes
    WHERE pollution_status != 'quarantined'
    ORDER BY created_at DESC
    LIMIT $limit;
    `,
    dataDir,
    { limit }
  );
  if (nodes.length === 0) return { nodes, edges: [], limited: false };
  const nodeIds = nodes.map((node) => node.node_id);
  const edges = await queryJson(
    `
    SELECT e.* FROM graph_edges e
    JOIN graph_nodes a ON a.node_id = e.from_node_id
    JOIN graph_nodes b ON b.node_id = e.to_node_id
    WHERE a.pollution_status != 'quarantined'
      AND b.pollution_status != 'quarantined'
      AND e.from_node_id IN (${sqlPlaceholders("node", nodeIds.length)})
      AND e.to_node_id IN (${sqlPlaceholders("node", nodeIds.length)})
    ORDER BY e.created_at DESC;
    `,
    dataDir,
    bindList("node", nodeIds)
  );
  return { nodes, edges, limited: nodes.length === limit };
}

export async function getGraphNeighbors(nodeId, dataDir = getDataDir(), options = {}) {
  await initSqlite(dataDir);
  const limit = Math.max(1, Math.min(Number(options.limit || 120), 500));
  const rows = await queryJson(
    `
    SELECT DISTINCT n.*
    FROM graph_edges e
    JOIN graph_nodes n
      ON n.node_id = CASE WHEN e.from_node_id = $node_id THEN e.to_node_id ELSE e.from_node_id END
    WHERE (e.from_node_id = $node_id OR e.to_node_id = $node_id)
      AND n.pollution_status != 'quarantined'
    ORDER BY n.created_at DESC
    LIMIT $limit;
    `,
    dataDir,
    { node_id: nodeId, limit }
  );
  const nodes = [
    ...(await queryJson("SELECT * FROM graph_nodes WHERE node_id = $node_id LIMIT 1;", dataDir, { node_id: nodeId })),
    ...rows
  ];
  const nodeIds = [...new Set(nodes.map((node) => node.node_id))];
  const edges = nodeIds.length === 0 ? [] : await queryJson(
    `
    SELECT e.* FROM graph_edges e
    WHERE e.from_node_id IN (${sqlPlaceholders("node", nodeIds.length)})
      AND e.to_node_id IN (${sqlPlaceholders("node", nodeIds.length)})
    ORDER BY e.created_at DESC;
    `,
    dataDir,
    bindList("node", nodeIds)
  );
  return { node_id: nodeId, nodes, edges, limited: rows.length === limit };
}

export async function searchGraph(query, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const limit = 50;
  const nodes = await queryJson(
    `
    SELECT * FROM graph_nodes
    WHERE pollution_status != 'quarantined'
      AND (
        label LIKE $like
        OR node_type LIKE $like
      )
    ORDER BY created_at DESC
    LIMIT $limit;
    `,
    dataDir,
    { like: `%${query}%`, limit }
  );
  return { query, nodes };
}

export async function searchGraphSubgraph(query, dataDir = getDataDir(), options = {}) {
  const matches = await searchGraph(query, dataDir);
  const seedNodes = matches.nodes.slice(0, Math.max(1, Math.min(Number(options.seedLimit || 30), 80)));
  const nodes = new Map(seedNodes.map((node) => [node.node_id, node]));
  const edges = new Map();

  for (const node of seedNodes) {
    const neighbors = await getGraphNeighbors(node.node_id, dataDir, { limit: Number(options.neighborLimit || 20) });
    for (const item of neighbors.nodes) nodes.set(item.node_id, item);
    for (const edge of neighbors.edges) edges.set(edge.edge_id, edge);
  }

  return {
    query,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    matched_node_ids: seedNodes.map((node) => node.node_id),
    limited: matches.nodes.length >= 50
  };
}

export async function getGraphCommunities(dataDir = getDataDir()) {
  await initSqlite(dataDir);
  const groups = await queryJson(
    `
    SELECT node_type, COUNT(*) AS count
    FROM graph_nodes
    WHERE pollution_status != 'quarantined'
    GROUP BY node_type
    ORDER BY count DESC;
    `,
    dataDir
  );
  const nodes = groups.map((group) => ({
    node_id: `community:${group.node_type}`,
    source_id: null,
    node_type: "community",
    label: `${communityLabel(group.node_type)} · ${group.count}`,
    pollution_status: "clean",
    created_at: new Date().toISOString()
  }));
  const edges = await queryJson(
    `
    SELECT a.node_type AS from_type, b.node_type AS to_type, COUNT(*) AS count
    FROM graph_edges e
    JOIN graph_nodes a ON a.node_id = e.from_node_id
    JOIN graph_nodes b ON b.node_id = e.to_node_id
    WHERE a.pollution_status != 'quarantined'
      AND b.pollution_status != 'quarantined'
    GROUP BY a.node_type, b.node_type
    ORDER BY count DESC;
    `,
    dataDir
  );
  return {
    nodes,
    edges: edges.map((edge) => ({
      edge_id: `community:${edge.from_type}:${edge.to_type}`,
      from_node_id: `community:${edge.from_type}`,
      to_node_id: `community:${edge.to_type}`,
      edge_type: "community_relation",
      reason: `${edge.count} 条关系`,
      created_at: new Date().toISOString()
    }))
  };
}

export async function getGraphByNodeType(nodeType, dataDir = getDataDir(), options = {}) {
  await initSqlite(dataDir);
  const seedLimit = Math.max(1, Math.min(Number(options.seedLimit || 80), 200));
  const maxNodes = Math.max(seedLimit, Math.min(Number(options.maxNodes || 260), 500));
  const seedNodes = await queryJson(
    `
    SELECT * FROM graph_nodes
    WHERE pollution_status != 'quarantined'
      AND node_type = $node_type
    ORDER BY created_at DESC
    LIMIT $limit;
    `,
    dataDir,
    { node_type: nodeType, limit: seedLimit }
  );
  const nodes = new Map(seedNodes.map((node) => [node.node_id, node]));
  const edges = new Map();

  for (const node of seedNodes) {
    if (nodes.size >= maxNodes) break;
    const neighbors = await getGraphNeighbors(node.node_id, dataDir, { limit: Number(options.neighborLimit || 8) });
    for (const item of neighbors.nodes) {
      if (nodes.size >= maxNodes && !nodes.has(item.node_id)) break;
      nodes.set(item.node_id, item);
    }
    for (const edge of neighbors.edges) edges.set(edge.edge_id, edge);
  }

  return {
    node_type: nodeType,
    nodes: [...nodes.values()],
    edges: [...edges.values()].filter((edge) => nodes.has(edge.from_node_id) && nodes.has(edge.to_node_id)),
    limited: seedNodes.length === seedLimit || nodes.size >= maxNodes
  };
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

function communityLabel(type) {
  return {
    source: "源资料",
    topic: "主题",
    keyword: "关键词",
    memory: "记忆"
  }[type] || type;
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

export async function markSourceDeleted(sourceId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await updateSourceStatuses(sourceId, {
    import_status: "deleted",
    parse_status: "deleted",
    memory_status: "deleted",
    trace_status: "source_deleted",
    pollution_status: "quarantined"
  }, dataDir);
}

export async function markSourceExternalDeleted(sourceId, dataDir = getDataDir()) {
  await initSqlite(dataDir);
  await updateSourceStatuses(sourceId, {
    trace_status: "external_deleted"
  }, dataDir);
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
  args.push("-cmd", ".timeout 5000");

  for (const [key, value] of Object.entries(params)) {
    args.push("-cmd", `.parameter set $${key} ${escapeParam(value)}`);
  }

  args.push(dbPath(dataDir), sql);
  return execFileAsync("sqlite3", args);
}

function escapeParam(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlPlaceholders(prefix, count) {
  return Array.from({ length: count }, (_, index) => `$${prefix}_${index}`).join(", ");
}

function bindList(prefix, values) {
  return Object.fromEntries(values.map((value, index) => [`${prefix}_${index}`, value]));
}

async function ensureMemorySegmentColumns(dataDir) {
  const columns = await queryJson("PRAGMA table_info(memory_segments);", dataDir);
  const existing = new Set(columns.map((column) => column.name));
  const additions = [
    ["title_path", "TEXT NOT NULL DEFAULT ''"],
    ["start_offset", "INTEGER NOT NULL DEFAULT 0"],
    ["end_offset", "INTEGER NOT NULL DEFAULT 0"],
    ["char_count", "INTEGER NOT NULL DEFAULT 0"],
    ["token_count", "INTEGER NOT NULL DEFAULT 0"],
    ["content_hash", "TEXT NOT NULL DEFAULT ''"],
    ["parser_name", "TEXT NOT NULL DEFAULT 'unknown'"],
    ["parser_version", "TEXT NOT NULL DEFAULT 'unknown'"],
    ["updated_at", "TEXT NOT NULL DEFAULT ''"]
  ];

  for (const [name, definition] of additions) {
    if (!existing.has(name)) {
      await runSql(`ALTER TABLE memory_segments ADD COLUMN ${name} ${definition};`, dataDir);
    }
  }

  await runSql(
    `
    UPDATE memory_segments
    SET
      title_path = COALESCE(NULLIF(title_path, ''), trace_position, ''),
      start_offset = CASE WHEN start_offset = 0 THEN 0 ELSE start_offset END,
      end_offset = CASE WHEN end_offset = 0 THEN length(text) ELSE end_offset END,
      char_count = CASE WHEN char_count = 0 THEN length(text) ELSE char_count END,
      token_count = CASE WHEN token_count = 0 THEN MAX(1, (length(text) + 1) / 2) ELSE token_count END,
      content_hash = CASE WHEN content_hash = '' THEN segment_id ELSE content_hash END,
      parser_name = CASE WHEN parser_name = 'unknown' THEN 'legacy' ELSE parser_name END,
      parser_version = CASE WHEN parser_version = 'unknown' THEN 'v0' ELSE parser_version END,
      updated_at = CASE WHEN updated_at = '' THEN created_at ELSE updated_at END
    WHERE updated_at = ''
       OR content_hash = ''
       OR char_count = 0
       OR end_offset = 0;
    `,
    dataDir
  );

  await runSql("CREATE INDEX IF NOT EXISTS idx_memory_segments_hash ON memory_segments(source_id, content_hash);", dataDir);
}

async function ensureVectorIndexColumns(dataDir) {
  const columns = await queryJson("PRAGMA table_info(vector_index);", dataDir);
  const existing = new Set(columns.map((column) => column.name));
  const additions = [
    ["embedding_provider", "TEXT NOT NULL DEFAULT 'local_weak'"],
    ["embedding_model", "TEXT NOT NULL DEFAULT 'local-weak-bigram-v1'"],
    ["embedding_dimension", "INTEGER NOT NULL DEFAULT 32"],
    ["chunk_hash", "TEXT NOT NULL DEFAULT ''"]
  ];

  for (const [name, definition] of additions) {
    if (!existing.has(name)) {
      await runSql(`ALTER TABLE vector_index ADD COLUMN ${name} ${definition};`, dataDir);
    }
  }

  await runSql(
    `
    UPDATE vector_index
    SET
      embedding_provider = CASE WHEN embedding_provider = '' THEN 'local_weak' ELSE embedding_provider END,
      embedding_model = CASE WHEN embedding_model = '' THEN 'local-weak-bigram-v1' ELSE embedding_model END,
      embedding_dimension = CASE WHEN embedding_dimension = 0 THEN 32 ELSE embedding_dimension END,
      chunk_hash = CASE WHEN chunk_hash = '' THEN segment_id ELSE chunk_hash END
    WHERE chunk_hash = ''
       OR embedding_provider = ''
       OR embedding_model = ''
       OR embedding_dimension = 0;
    `,
    dataDir
  );

  await runSql("CREATE INDEX IF NOT EXISTS idx_vector_index_model ON vector_index(embedding_provider, embedding_model);", dataDir);
}

function normalizeMemorySegment(record) {
  const text = String(record.text || "");
  const createdAt = record.created_at || new Date().toISOString();
  const startOffset = Number.isFinite(Number(record.start_offset)) ? Number(record.start_offset) : 0;
  const endOffset = Number.isFinite(Number(record.end_offset)) ? Number(record.end_offset) : startOffset + text.length;
  return {
    ...record,
    title_path: record.title_path || record.trace_position || "",
    text,
    start_offset: startOffset,
    end_offset: endOffset,
    char_count: Number.isFinite(Number(record.char_count)) ? Number(record.char_count) : text.length,
    token_count: Number.isFinite(Number(record.token_count)) ? Number(record.token_count) : Math.max(1, Math.ceil(text.length / 2)),
    content_hash: record.content_hash || createHash("sha256").update(`${record.source_id}:${record.segment_index}:${text}`).digest("hex"),
    parser_name: record.parser_name || "MinimalTextParser",
    parser_version: record.parser_version || "v1",
    pollution_status: record.pollution_status || "clean",
    created_at: createdAt,
    updated_at: record.updated_at || createdAt
  };
}

function normalizeVectorRecord(record) {
  const vector = Array.isArray(record.vector) ? record.vector : JSON.parse(record.vector_json || "[]");
  return {
    ...record,
    vector_json: record.vector_json || JSON.stringify(vector),
    embedding_provider: record.embedding_provider || "local_weak",
    embedding_model: record.embedding_model || "local-weak-bigram-v1",
    embedding_dimension: Number(record.embedding_dimension || vector.length || 32),
    chunk_hash: record.chunk_hash || record.segment_id,
    pollution_status: record.pollution_status || "clean",
    created_at: record.created_at || new Date().toISOString()
  };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
