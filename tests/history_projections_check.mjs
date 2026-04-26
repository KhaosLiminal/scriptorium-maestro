import assert from "node:assert/strict";
import { buildAllProjections } from "../engine/orchestrator/history_projections.js";

const events = [
  {
    event_version: 1,
    event_id: "e1",
    run_id: "r1",
    correlation_id: "r1",
    caused_by: null,
    event_type: "decision.made",
    source: "orchestrator",
    timestamp: "2026-04-26T10:00:00.000Z",
    payload: {
      decision: {
        actions: ["resolver_media"],
        priority: "media_missing",
        reasoning: "faltante > 0",
        rule_id: "media_faltante",
        score: 0.95
      },
      decision_meta: {
        matched_rules: [
          { rule_id: "media_faltante", score: 0.95 },
          { rule_id: "otro", score: 0.3 }
        ]
      }
    }
  },
  {
    event_version: 1,
    event_id: "e2",
    run_id: "r1",
    correlation_id: "r1",
    caused_by: "e1",
    event_type: "action.started",
    source: "orchestrator",
    timestamp: "2026-04-26T10:00:01.000Z",
    payload: { action: "resolver_media" }
  },
  {
    event_version: 1,
    event_id: "e3",
    run_id: "r1",
    correlation_id: "r1",
    caused_by: "e2",
    event_type: "action.completed",
    source: "orchestrator",
    timestamp: "2026-04-26T10:00:04.000Z",
    payload: { action: "resolver_media" }
  }
];

const projections = buildAllProjections(events);

assert.equal(projections.analytics.total_events, 3);
assert.equal(projections.analytics.by_type["decision.made"], 1);
assert.equal(projections.analytics.decisions.by_rule.media_faltante, 1);
assert.equal(projections.analytics.decisions.conflicts, 1);
assert.equal(projections.debug.latest_events.length, 3);
assert.equal(projections.debug.chains.length, 1);
assert.equal(projections.performance.summary.total_runs, 1);
assert.equal(projections.performance.summary.completed, 1);
assert.equal(projections.performance.runs[0].duration_ms, 3000);

console.log("History projections OK");
