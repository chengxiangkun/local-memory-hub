import assert from "node:assert/strict";
import { runSystemDoctor } from "./system-doctor.js";

const result = await runSystemDoctor();
const checks = result.checks || [];
const ids = new Set(checks.map((item) => item.id));
const validStatuses = new Set(["ok", "missing", "warning"]);

assert.ok(result.generated_at, "should include generated_at");
assert.ok(["ok", "degraded", "blocked"].includes(result.overall_status), "should return known overall status");
for (const id of ["sqlite3", "ffmpeg", "ffprobe", "pdftotext", "tesseract", "rustc", "cargo"]) {
  assert.ok(ids.has(id), `should include ${id}`);
}
for (const check of checks) {
  assert.ok(validStatuses.has(check.status), `invalid status for ${check.id}`);
  assert.equal(typeof check.required, "boolean", `${check.id} should include required flag`);
  assert.ok(check.label, `${check.id} should include label`);
  assert.ok(check.message, `${check.id} should include message`);
}

console.log("system doctor smoke test passed");
