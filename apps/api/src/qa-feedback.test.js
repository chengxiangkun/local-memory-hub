import { rmSync } from "node:fs";
import { initDataDir } from "./data-store.js";
import { appendGovernanceEvents, initSqlite, listGovernanceEvents } from "./sqlite-store.js";

const dataDir = `/tmp/lmh-fb-test-${Date.now()}`;
process.env.LMH_DATA_DIR = dataDir;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await initDataDir(dataDir);
  await initSqlite(dataDir);

  // 仿 /api/qa/feedback 落库:scope=qa_feedback,带 message_id / reason / detail
  await appendGovernanceEvents(
    {
      scope: "qa_feedback",
      message_id: "msg-abc-123",
      title: "MQTT 怎么配置",
      action: "thumbs_down",
      reason: "答非所问,没提到端口",
      detail: { session_id: "sess-1", question: "MQTT 怎么配置", answer_snippet: "某段回答" }
    },
    dataDir
  );

  const events = (await listGovernanceEvents(dataDir, { limit: 50 })).filter((e) => e.scope === "qa_feedback");
  assert(events.length === 1, `应有 1 条反馈事件,实际:${events.length}`);
  const fb = events[0];
  assert(fb.message_id === "msg-abc-123", `应保留 message_id,实际:${fb.message_id}`);
  assert(fb.action === "thumbs_down", `action 应为 thumbs_down,实际:${fb.action}`);
  assert(fb.reason === "答非所问,没提到端口", "reason 应保留");
  assert(fb.detail && fb.detail.session_id === "sess-1", "detail.session_id 应保留");
  assert(fb.detail.answer_snippet === "某段回答", "detail.answer_snippet 应保留");

  console.log("qa-feedback test passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
