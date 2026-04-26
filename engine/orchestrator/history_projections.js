function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toMs(value) {
  const ms = Date.parse(String(value ?? ""));
  return Number.isNaN(ms) ? null : ms;
}

export function buildAnalyticsProjection(events) {
  const byType = {};
  const bySource = {};
  const byRule = {};
  const byAction = {};
  let conflicts = 0;

  for (const event of events) {
    const eventType = String(event?.event_type ?? "unknown");
    const source = String(event?.source ?? "unknown");
    byType[eventType] = (byType[eventType] ?? 0) + 1;
    bySource[source] = (bySource[source] ?? 0) + 1;

    if (eventType === "decision.made") {
      const ruleId = event?.payload?.decision?.rule_id ?? "unknown";
      byRule[ruleId] = (byRule[ruleId] ?? 0) + 1;

      const action = event?.payload?.decision?.actions?.[0] ?? "none";
      byAction[action] = (byAction[action] ?? 0) + 1;

      const matchedRules = event?.payload?.decision_meta?.matched_rules;
      if (Array.isArray(matchedRules) && matchedRules.length > 1) {
        conflicts += 1;
      }
    }
  }

  return {
    generated_at: new Date().toISOString(),
    total_events: events.length,
    by_type: byType,
    by_source: bySource,
    decisions: {
      by_rule: byRule,
      by_action: byAction,
      conflicts
    }
  };
}

export function buildDebugProjection(events, limit = 200) {
  const byCorrelation = new Map();

  for (const event of events) {
    const correlationId = String(event?.correlation_id ?? "unknown");
    const current = byCorrelation.get(correlationId) ?? {
      correlation_id: correlationId,
      event_count: 0,
      first_timestamp: null,
      last_timestamp: null,
      last_event_type: null
    };

    current.event_count += 1;
    current.last_event_type = event?.event_type ?? null;
    current.first_timestamp ??= event?.timestamp ?? null;
    current.last_timestamp = event?.timestamp ?? current.last_timestamp;
    byCorrelation.set(correlationId, current);
  }

  return {
    generated_at: new Date().toISOString(),
    latest_events: events.slice(-Math.max(1, limit)),
    chains: Array.from(byCorrelation.values())
  };
}

export function buildPerformanceProjection(events) {
  const startsByCorrelation = new Map();
  const runs = [];

  for (const event of events) {
    const correlationId = String(event?.correlation_id ?? "unknown");
    const eventType = String(event?.event_type ?? "unknown");

    if (eventType === "action.started") {
      startsByCorrelation.set(correlationId, event);
      continue;
    }

    if (eventType !== "action.completed" && eventType !== "action.failed") {
      continue;
    }

    const started = startsByCorrelation.get(correlationId);
    const startMs = toMs(started?.timestamp);
    const endMs = toMs(event?.timestamp);
    const durationMs = startMs !== null && endMs !== null ? Math.max(0, endMs - startMs) : null;

    runs.push({
      correlation_id: correlationId,
      action: event?.payload?.action ?? started?.payload?.action ?? "unknown",
      started_at: started?.timestamp ?? null,
      finished_at: event?.timestamp ?? null,
      status: eventType === "action.completed" ? "completed" : "failed",
      duration_ms: durationMs
    });
  }

  const completed = runs.filter(item => item.status === "completed");
  const failed = runs.filter(item => item.status === "failed");
  const durations = runs
    .map(item => item.duration_ms)
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);

  const avgDurationMs = durations.length > 0
    ? durations.reduce((acc, value) => acc + value, 0) / durations.length
    : null;

  const p95DurationMs = durations.length > 0
    ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]
    : null;

  return {
    generated_at: new Date().toISOString(),
    runs,
    summary: {
      total_runs: runs.length,
      completed: completed.length,
      failed: failed.length,
      avg_duration_ms: avgDurationMs,
      p95_duration_ms: p95DurationMs
    }
  };
}

export function buildAllProjections(events) {
  const normalizedEvents = Array.isArray(events) ? events.filter(isObject) : [];
  return {
    analytics: buildAnalyticsProjection(normalizedEvents),
    debug: buildDebugProjection(normalizedEvents),
    performance: buildPerformanceProjection(normalizedEvents)
  };
}
