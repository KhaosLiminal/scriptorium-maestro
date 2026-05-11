import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  EVENT_VERSION_CURRENT,
  HISTORY_LOG_PATH,
  SNAPSHOT_PATH,
  STATE_PATH,
  STATE_SEED_PATH,
  loadJson,
  saveJson
} from "./state_store.js";
import { validateState } from "./state_schema.js";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function parseHistoryText(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const events = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      events.push(upcastHistoryEvent(JSON.parse(line), i));
    } catch (error) {
      throw new Error(`history.log invalido en linea ${i + 1}: ${error.message}`);
    }
  }

  return events;
}

export function upcastHistoryEvent(rawEvent, index = 0) {
  if (!isObject(rawEvent)) return rawEvent;

  const runId = isNonEmptyString(rawEvent.run_id) ? rawEvent.run_id : `legacy-run-${index + 1}`;
  const correlationId = isNonEmptyString(rawEvent.correlation_id) ? rawEvent.correlation_id : runId;
  const eventVersion = Number.isInteger(rawEvent.event_version) && rawEvent.event_version >= 1
    ? rawEvent.event_version
    : 1;
  const causedBy = Object.prototype.hasOwnProperty.call(rawEvent, "caused_by")
    ? rawEvent.caused_by
    : null;

  return {
    ...rawEvent,
    event_version: eventVersion,
    run_id: runId,
    correlation_id: correlationId,
    caused_by: causedBy
  };
}

export function loadHistoryEvents(filePath = HISTORY_LOG_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return parseHistoryText(fs.readFileSync(filePath, "utf8"));
}

function applyEventToState(currentState, event) {
  if (!isObject(event)) return currentState;

  if (event.event_type === "decision.made") {
    if (isObject(event.state_snapshot)) {
      try {
        validateState(event.state_snapshot);
        return structuredClone(event.state_snapshot);
      } catch {
        // fallback to incremental projection when snapshot is legacy/incomplete
      }
    }

    const decision = event?.payload?.decision;
    if (isObject(decision)) {
      const nextStep = Array.isArray(decision.actions) && decision.actions.length > 0 ? decision.actions[0] : null;
      return {
        ...currentState,
        proximo_paso_sugerido: nextStep,
        decision_actual: decision,
        timestamp_orchestrator: event.timestamp
      };
    }
  }

  if (event.event_type === "observation.recorded") {
    if (isObject(event.state_snapshot)) {
      return structuredClone(event.state_snapshot);
    }

    return {
      ...currentState,
      last_event: event?.payload?.event ?? currentState?.last_event ?? "unknown",
      timestamp_observer: event.timestamp,
      estado_media: isObject(event?.payload?.estado_media)
        ? event.payload.estado_media
        : currentState?.estado_media
    };
  }

  return currentState;
}

export function rebuildStateFromHistory({ historyEvents = [], seedState }) {
  if (!isObject(seedState)) {
    throw new Error("seedState invalido: objeto requerido");
  }

  let rebuilt = structuredClone(seedState);
  for (const event of historyEvents) {
    rebuilt = applyEventToState(rebuilt, event);
  }

  validateState(rebuilt);
  return rebuilt;
}

export function checkStateConsistency({
  statePath = STATE_PATH,
  historyPath = HISTORY_LOG_PATH,
  seedStatePath = STATE_SEED_PATH
} = {}) {
  const historyEvents = loadHistoryEvents(historyPath);
  if (historyEvents.length === 0) {
    return {
      status: "missing_history",
      equivalent: true,
      historyEvents: 0,
      rebuiltState: null,
      currentState: null
    };
  }

  const currentState = loadJson(statePath);
  validateState(currentState);

  const seedState = loadJson(seedStatePath);
  validateState(seedState);

  const rebuiltState = rebuildStateFromHistory({ historyEvents, seedState });
  const equivalent = isDeepStrictEqual(currentState, rebuiltState);

  return {
    status: equivalent ? "ok" : "mismatch",
    equivalent,
    historyEvents: historyEvents.length,
    rebuiltState,
    currentState
  };
}

export function maybeWriteSnapshot({
  historyPath = HISTORY_LOG_PATH,
  seedStatePath = STATE_SEED_PATH,
  snapshotPath = SNAPSHOT_PATH,
  interval = 10,
  force = false
} = {}) {
  const historyEvents = loadHistoryEvents(historyPath);
  if (historyEvents.length === 0) {
    return { status: "missing_history", wrote: false, historyEvents: 0 };
  }

  if (!force && interval > 0 && historyEvents.length % interval !== 0) {
    return {
      status: "skipped_interval",
      wrote: false,
      historyEvents: historyEvents.length
    };
  }

  const seedState = loadJson(seedStatePath);
  validateState(seedState);
  const rebuiltState = rebuildStateFromHistory({ historyEvents, seedState });

  const lastEvent = historyEvents[historyEvents.length - 1] ?? null;
  const snapshot = {
    event_version: EVENT_VERSION_CURRENT,
    snapshot_version: 1,
    generated_at: new Date().toISOString(),
    event_count: historyEvents.length,
    last_event_id: lastEvent?.event_id ?? null,
    state: rebuiltState
  };

  saveJson(snapshotPath, snapshot);
  return {
    status: "written",
    wrote: true,
    historyEvents: historyEvents.length,
    snapshotPath
  };
}
