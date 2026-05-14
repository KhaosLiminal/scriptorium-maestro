import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  checkStateConsistency,
  maybeWriteSnapshot,
  rebuildStateFromHistory
} from "../engine/orchestrator/event_sourcing_layer.js";

const seedState = {
  universo: "madonna_hibrida",
  modo: "produccion",
  objetivo_activo: "generar_pack_preview",
  template_actual: "madonna_hibrida_template",
  template_path: "pipelines/reels/madonna_hibrida/madonna_hibrida_template.arc",
  estado_media: { presente: 5, faltante: 0, placeholder: 0, replacementHints: 0 },
  ciclope: { capas_pendientes: [], bloqueante: false },
  saturacion: 0.2
};

const decisionState = {
  ...seedState,
  modo: "produccion_limitada",
  estado_media: { presente: 0, faltante: 5, placeholder: 5, replacementHints: 5 },
  proximo_paso_sugerido: "resolver_media",
  decision_actual: {
    actions: ["resolver_media"],
    priority: "media_missing",
    reasoning: "faltante > 0",
    rule_id: "media_faltante",
    score: 0.95
  },
  timestamp_orchestrator: "2026-04-25T10:00:00.000Z"
};

const historyEvents = [
  {
    event_version: 1,
    event_id: "evt-1",
    run_id: "run-1",
    correlation_id: "run-1",
    caused_by: null,
    event_type: "decision.made",
    source: "orchestrator",
    timestamp: "2026-04-25T10:00:00.000Z",
    payload: { decision: decisionState.decision_actual },
    state_snapshot: decisionState
  },
  {
    event_version: 1,
    event_id: "evt-2",
    run_id: "run-1",
    correlation_id: "run-1",
    caused_by: "evt-1",
    event_type: "action.started",
    source: "orchestrator",
    timestamp: "2026-04-25T10:00:01.000Z",
    payload: { action: "resolver_media" }
  },
  {
    event_version: 1,
    event_id: "evt-3",
    run_id: "run-1",
    correlation_id: "run-1",
    caused_by: "evt-2",
    event_type: "action.completed",
    source: "orchestrator",
    timestamp: "2026-04-25T10:00:02.000Z",
    payload: { action: "resolver_media" }
  }
];

const rebuiltDirect = rebuildStateFromHistory({
  historyEvents,
  seedState
});
assert.deepEqual(rebuiltDirect, decisionState);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-sourcing-check-"));
const historyPath = path.join(tempDir, "history.log");
const statePath = path.join(tempDir, "state.json");
const seedPath = path.join(tempDir, "seed.json");
const snapshotPath = path.join(tempDir, "snapshot.json");

fs.writeFileSync(historyPath, `${historyEvents.map(item => JSON.stringify(item)).join("\n")}\n`, "utf8");
fs.writeFileSync(statePath, JSON.stringify(decisionState, null, 2), "utf8");
fs.writeFileSync(seedPath, JSON.stringify(seedState, null, 2), "utf8");

const consistency = checkStateConsistency({
  statePath,
  historyPath,
  seedStatePath: seedPath
});
assert.equal(consistency.status, "ok");
assert.equal(consistency.equivalent, true);
assert.equal(consistency.historyEvents, 3);

const snapshotResult = maybeWriteSnapshot({
  historyPath,
  seedStatePath: seedPath,
  snapshotPath,
  force: true
});
assert.equal(snapshotResult.status, "written");
assert.equal(fs.existsSync(snapshotPath), true);

console.log("Event sourcing rebuild OK");
