import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  migrateHistoryFile,
  migrateHistoryLines
} from "../tools/migrate_orchestrator_history_log.mjs";

const normalizedEvent = {
  event_id: "evt-1",
  run_id: "run-1",
  event_type: "decision.made",
  source: "orchestrator",
  timestamp: "2026-04-20T10:00:00.000Z",
  payload: {
    decision: {
      actions: ["resolver_media"],
      priority: "media_missing",
      reasoning: "faltante > 0"
    }
  }
};

const legacyEntry = {
  timestamp: "2026-04-20T09:00:00.000Z",
  source: "orchestrator",
  decision: {
    actions: ["generar_pack_preview"],
    priority: "media_ready",
    reasoning: "test legacy"
  },
  state_snapshot: {
    modo: "produccion_limitada"
  }
};

const lines = [JSON.stringify(legacyEntry), JSON.stringify(normalizedEvent)];
const migratedFromLines = migrateHistoryLines(lines);
assert.equal(migratedFromLines.stats.total, 2);
assert.equal(migratedFromLines.stats.legacy_converted, 1);
assert.equal(migratedFromLines.stats.normalized_kept, 1);
assert.equal(migratedFromLines.stats.causal_enriched > 0, true);
assert.equal(migratedFromLines.stats.version_enriched > 0, true);
assert.equal(migratedFromLines.migrated[0].event_type, "decision.made");
assert.equal(migratedFromLines.migrated[1].event_id, "evt-1");
assert.equal(typeof migratedFromLines.migrated[0].correlation_id, "string");
assert.equal(migratedFromLines.migrated[0].caused_by, null);
assert.equal(typeof migratedFromLines.migrated[1].correlation_id, "string");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "history-migration-check-"));
const filePath = path.join(tempDir, "history.log");
fs.writeFileSync(filePath, `${JSON.stringify(legacyEntry)}\n${JSON.stringify(normalizedEvent)}\n`, "utf8");

const firstRun = migrateHistoryFile({ filePath, dryRun: false, backup: false });
assert.equal(firstRun.changed, true);
assert.equal(firstRun.stats.total, 2);
assert.equal(firstRun.stats.legacy_converted, 1);
assert.equal(firstRun.stats.causal_enriched > 0, true);
assert.equal(firstRun.stats.version_enriched > 0, true);

const secondRun = migrateHistoryFile({ filePath, dryRun: false, backup: false });
assert.equal(secondRun.changed, false);
assert.equal(secondRun.stats.total, 2);
assert.equal(secondRun.stats.legacy_converted, 0);
assert.equal(secondRun.stats.normalized_kept, 2);
assert.equal(secondRun.stats.causal_enriched, 0);
assert.equal(secondRun.stats.version_enriched, 0);

const dryRunResult = migrateHistoryFile({ filePath, dryRun: true, backup: true });
assert.equal(dryRunResult.changed, false);
assert.equal(dryRunResult.stats.total, 2);

// Partially normalized events (passing isNormalizedEvent but missing run_id)
// should be enriched with a run_id derived from correlation_id or a legacy fallback
// so that the history integrity check accepts them.
const partiallyNormalizedNoRunId = {
  event_id: "evt-no-run",
  event_type: "observation.recorded",
  source: "observer",
  timestamp: "2026-04-20T11:00:00.000Z",
  correlation_id: "corr-from-observer",
  payload: { event: "runner_execution" }
};
const partiallyNormalizedNoIds = {
  event_id: "evt-no-ids",
  event_type: "decision.made",
  source: "orchestrator",
  timestamp: "2026-04-20T11:05:00.000Z",
  payload: {
    decision: {
      actions: ["resolver_media"],
      priority: "media_missing",
      reasoning: "test partial"
    }
  }
};

const partialMigration = migrateHistoryLines([
  JSON.stringify(partiallyNormalizedNoRunId),
  JSON.stringify(partiallyNormalizedNoIds)
]);
assert.equal(partialMigration.stats.total, 2);
assert.equal(partialMigration.stats.normalized_kept, 2);
assert.equal(partialMigration.stats.run_id_enriched, 2);
assert.equal(partialMigration.migrated[0].run_id, "corr-from-observer");
assert.equal(partialMigration.migrated[0].correlation_id, "corr-from-observer");
assert.equal(partialMigration.migrated[1].run_id, "legacy-run-2");
assert.equal(partialMigration.migrated[1].correlation_id, "legacy-run-2");

console.log("History migration OK");
