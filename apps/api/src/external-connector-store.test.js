import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  externalConnectorPath,
  listExternalConnectors,
  markConnectorSync,
  saveExternalConnector
} from "./external-connector-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-connectors-"));

const feishu = await saveExternalConnector({
  platform: "feishu",
  account_name: "产品空间",
  root_url: "https://example.feishu.cn/wiki/root",
  auth_status: "connected",
  sync_mode: "event"
}, dataDir);

assert.equal(feishu.display_name, "飞书文档");
assert.equal(feishu.root_url, "https://example.feishu.cn/wiki/root");
assert.equal(feishu.preserve_remote_structure, true);
assert.equal(feishu.delete_remote_cleanup, false);

await saveExternalConnector({
  platform: "tencent_docs",
  account_name: "团队文档",
  auth_status: "connected",
  sync_mode: "polling"
}, dataDir);

const connectors = await listExternalConnectors(dataDir);
assert.equal(connectors.length, 2);
assert.ok(connectors.some((item) => item.platform === "feishu"));
assert.ok(connectors.some((item) => item.platform === "tencent_docs"));

const sync = await markConnectorSync({ platform: "feishu" }, dataDir);
assert.equal(sync.result.status, "queued");
assert.ok(sync.connector.last_sync_at);

await saveExternalConnector({
  platform: "tencent_docs",
  auth_status: "disconnected"
}, dataDir);
await assert.rejects(
  () => markConnectorSync({ platform: "tencent_docs" }, dataDir),
  /尚未授权/
);

const fileMode = (await stat(externalConnectorPath(dataDir))).mode & 0o777;
assert.equal(fileMode, 0o600);

console.log("external connector store test passed");
