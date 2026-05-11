import { randomUUID } from "node:crypto";
import {
  EVENT_VERSION_CURRENT,
  appendHistoryEntry,
  loadState,
  saveState
} from "./state_store.js";

export function observe(event) {
  const state = loadState();
  const updatedState = { ...state };

  if (event?.type === "runner_execution") {
    updatedState.estado_media = {
      presente: event?.payload?.mediaPresent ?? state?.estado_media?.presente ?? 0,
      faltante: event?.payload?.mediaMissing ?? state?.estado_media?.faltante ?? 0,
      placeholder: event?.payload?.mediaPlaceholder ?? state?.estado_media?.placeholder ?? 0,
      replacementHints: event?.payload?.mediaReplacementHints ?? state?.estado_media?.replacementHints ?? 0
    };
  }

  const timestamp = new Date().toISOString();
  updatedState.last_event = event?.type ?? "unknown";
  updatedState.timestamp_observer = timestamp;

  const runId = String(event?.payload?.run_id ?? `observer-${randomUUID()}`);
  const correlationId = String(event?.payload?.correlation_id ?? runId);
  const causedBy = event?.payload?.caused_by ?? null;

  appendHistoryEntry({
    event_id: randomUUID(),
    event_version: EVENT_VERSION_CURRENT,
    run_id: runId,
    correlation_id: correlationId,
    caused_by: causedBy,
    event_type: "observation.recorded",
    source: "observer",
    timestamp,
    payload: {
      event: updatedState.last_event,
      estado_media: updatedState.estado_media
    },
    state_snapshot: updatedState
  });

  saveState(updatedState);
  return updatedState;
}
