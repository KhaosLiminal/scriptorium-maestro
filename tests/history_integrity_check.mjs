import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runHistoryIntegrityCheck,
  validateHistoryEntry,
  validateHistoryText
} from "../tools/history_integrity_check.mjs";

const validDecision = {
  event_version: 1,
  event_id: "evt-1",
  run_id: "run-1",
  correlation_id: "run-1",
  caused_by: null,
  event_type: "decision.made",
  source: "orchestrator",
  timestamp: "2026-04-20T11:00:00.000Z",
  payload: {
    decision: {
      actions: ["resolver_media"],
      priority: "media_missing",
      reasoning: "faltante > 0"
    },
    decision_meta: {
      selected_rule: "media_faltante",
      discarded_rules: []
    }
  },
  state_snapshot: { modo: "produccion_limitada" }
};

const validAction = {
  event_version: 1,
  event_id: "evt-2",
  run_id: "run-1",
  correlation_id: "run-1",
  caused_by: "evt-1",
  event_type: "action.completed",
  source: "orchestrator",
  timestamp: "2026-04-20T11:00:01.000Z",
  payload: { action: "resolver_media" }
};

validateHistoryEntry(validDecision, 1);
validateHistoryEntry(validAction, 2);

const validation = validateHistoryText(`${JSON.stringify(validDecision)}\n${JSON.stringify(validAction)}\n`);
assert.equal(validation.entries, 2);

assert.throws(
  () => validateHistoryEntry({ ...validAction, event_id: "" }, 1),
  /event_id requerido/
);
assert.throws(
  () =>
    validateHistoryEntry(
      {
        ...validDecision,
        payload: { decision: { actions: [], priority: "", reasoning: "" } }
      },
      1
    ),
  /actions debe ser array no vacio/
);
assert.throws(
  () => validateHistoryText("{not-json}\n"),
  /JSON invalido/
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "history-integrity-check-"));
const filePath = path.join(tempDir, "history.log");
fs.writeFileSync(filePath, `${JSON.stringify(validDecision)}\n${JSON.stringify(validAction)}\n`, "utf8");

const fileResult = runHistoryIntegrityCheck({ filePath });
assert.equal(fileResult.status, "ok");
assert.equal(fileResult.entries, 2);

const missingResult = runHistoryIntegrityCheck({
  filePath: path.join(tempDir, "missing.log"),
  strictMissing: false
});
assert.equal(missingResult.status, "missing");

assert.throws(
  () =>
    runHistoryIntegrityCheck({
      filePath: path.join(tempDir, "missing.log"),
      strictMissing: true
    }),
  /history.log no existe/
);

console.log("History integrity test OK");
