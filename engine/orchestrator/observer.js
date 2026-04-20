import { loadState, saveState } from "./state_store.js";

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

  saveState(updatedState);
  return updatedState;
}
