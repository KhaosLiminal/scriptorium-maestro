import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkStateConsistency,
  maybeWriteSnapshot
} from "../engine/orchestrator/event_sourcing_layer.js";

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const args = {
    writeSnapshot: false,
    forceSnapshot: false,
    snapshotInterval: 10
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--write-snapshot") {
      args.writeSnapshot = true;
      continue;
    }
    if (token === "--force-snapshot") {
      args.writeSnapshot = true;
      args.forceSnapshot = true;
      continue;
    }
    if (token === "--snapshot-interval") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --snapshot-interval");
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("snapshot-interval invalido");
      }
      args.snapshotInterval = parsed;
      i += 1;
    }
  }

  return args;
}

function summarizeMismatch(result) {
  const current = JSON.stringify(result.currentState);
  const rebuilt = JSON.stringify(result.rebuiltState);
  if (current === rebuilt) return "mismatch no detectable";

  return [
    `currentState.len=${current.length}`,
    `rebuiltState.len=${rebuilt.length}`
  ].join(" ");
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const result = checkStateConsistency();

  if (result.status === "missing_history") {
    console.log("Event sourcing consistency skipped (history.log no existe o vacio)");
    return;
  }

  if (result.status !== "ok") {
    throw new Error(`state != fold(history). ${summarizeMismatch(result)}`);
  }

  console.log(`Event sourcing consistency OK (${result.historyEvents} eventos)`);

  if (args.writeSnapshot) {
    const snapshotResult = maybeWriteSnapshot({
      force: args.forceSnapshot,
      interval: args.snapshotInterval
    });
    console.log(`Snapshot status: ${snapshotResult.status}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    runCli();
  } catch (error) {
    console.error("Event sourcing consistency failed");
    console.error(error);
    process.exitCode = 1;
  }
}
