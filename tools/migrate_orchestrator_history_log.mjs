import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(startPath = __dirname) {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startPath);
}

const PROJECT_ROOT = findProjectRoot(__dirname);
const DEFAULT_HISTORY_PATH = path.join(PROJECT_ROOT, "runtime", "orchestrator", "history.log");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNormalizedEvent(entry) {
  return (
    isObject(entry) &&
    typeof entry.event_id === "string" &&
    entry.event_id.trim() !== "" &&
    typeof entry.event_type === "string" &&
    entry.event_type.trim() !== "" &&
    typeof entry.source === "string" &&
    entry.source.trim() !== "" &&
    isIsoDate(entry.timestamp)
  );
}

function normalizeLegacyEntry(entry, index) {
  const source = typeof entry?.source === "string" && entry.source.trim() ? entry.source : "unknown";
  const timestamp = isIsoDate(entry?.timestamp) ? entry.timestamp : new Date().toISOString();
  const payload = {};
  let eventType = "legacy.unknown";

  if (entry?.decision) {
    payload.decision = entry.decision;
    eventType = "decision.made";
  }

  if (entry?.event) {
    payload.event = entry.event;
    eventType = source === "observer" ? "observation.recorded" : "event.recorded";
  }

  if (Object.keys(payload).length === 0) {
    payload.legacy_entry = entry;
  }

  payload.migrated_from = "legacy.history.v1";
  payload.legacy_index = index + 1;

  const normalized = {
    event_version: 1,
    event_id: randomUUID(),
    run_id: `legacy-run-${index + 1}`,
    correlation_id: `legacy-run-${index + 1}`,
    caused_by: null,
    event_type: eventType,
    source,
    timestamp,
    payload
  };

  if (entry?.state_snapshot !== undefined) {
    normalized.state_snapshot = entry.state_snapshot;
  } else if (eventType === "decision.made") {
    normalized.state_snapshot = { migrated_without_state_snapshot: true };
    normalized.payload.migration_warning = "decision.made sin state_snapshot original";
  }

  return normalized;
}

function enrichCausality(events) {
  const enrichedEvents = [];
  const lastEventByCorrelation = new Map();
  let correlationEnrichedCount = 0;
  let causedByEnrichedCount = 0;
  let versionEnrichedCount = 0;
  let runIdEnrichedCount = 0;

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const eventVersion = Number.isInteger(event?.event_version) && event.event_version >= 1 ? event.event_version : 1;
    if (!Number.isInteger(event?.event_version) || event.event_version < 1) versionEnrichedCount += 1;

    const runId = isNonEmptyString(event?.run_id)
      ? event.run_id
      : isNonEmptyString(event?.correlation_id)
        ? event.correlation_id
        : `legacy-run-${i + 1}`;

    if (!isNonEmptyString(event?.run_id)) runIdEnrichedCount += 1;

    const correlationId = isNonEmptyString(event?.correlation_id)
      ? event.correlation_id
      : runId;

    if (!isNonEmptyString(event?.correlation_id)) correlationEnrichedCount += 1;

    let causedBy = event?.caused_by;
    if (causedBy === undefined || (causedBy !== null && !isNonEmptyString(causedBy))) {
      if (event?.event_type === "decision.made") {
        causedBy = null;
      } else {
        causedBy = lastEventByCorrelation.get(correlationId) ?? null;
      }
      causedByEnrichedCount += 1;
    }

    const enriched = {
      ...event,
      event_version: eventVersion,
      run_id: runId,
      correlation_id: correlationId,
      caused_by: causedBy
    };

    enrichedEvents.push(enriched);

    if (isNonEmptyString(enriched.event_id)) {
      lastEventByCorrelation.set(correlationId, enriched.event_id);
    }
  }

  return {
    events: enrichedEvents,
    correlationEnrichedCount,
    causedByEnrichedCount,
    versionEnrichedCount,
    runIdEnrichedCount
  };
}

export function migrateHistoryLines(lines) {
  const migratedRaw = [];
  const stats = {
    total: 0,
    normalized_kept: 0,
    legacy_converted: 0,
    correlation_enriched: 0,
    caused_by_enriched: 0,
    causal_enriched: 0,
    version_enriched: 0,
    run_id_enriched: 0
  };

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    stats.total += 1;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Linea invalida en history.log (${index + 1}): ${error.message}`);
    }

    if (isNormalizedEvent(parsed)) {
      migratedRaw.push(parsed);
      stats.normalized_kept += 1;
      continue;
    }

    migratedRaw.push(normalizeLegacyEntry(parsed, index));
    stats.legacy_converted += 1;
  }

  const causality = enrichCausality(migratedRaw);
  stats.correlation_enriched = causality.correlationEnrichedCount;
  stats.caused_by_enriched = causality.causedByEnrichedCount;
  stats.causal_enriched = causality.correlationEnrichedCount + causality.causedByEnrichedCount;
  stats.version_enriched = causality.versionEnrichedCount;
  stats.run_id_enriched = causality.runIdEnrichedCount;

  return { migrated: causality.events, stats };
}

function parseArgs(argv) {
  const args = {
    file: DEFAULT_HISTORY_PATH,
    dryRun: false,
    backup: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--no-backup") {
      args.backup = false;
      continue;
    }
    if (token === "--file") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta ruta despues de --file");
      args.file = path.resolve(next);
      i += 1;
      continue;
    }
  }

  return args;
}

function createBackup(filePath) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.legacy-${now}.bak`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

export function migrateHistoryFile({ filePath, dryRun = false, backup = true }) {
  if (!fs.existsSync(filePath)) {
    return {
      changed: false,
      stats: { total: 0, normalized_kept: 0, legacy_converted: 0 },
      backupPath: null,
      outputPath: filePath
    };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const { migrated, stats } = migrateHistoryLines(lines);
  const nextContent = migrated.map(entry => JSON.stringify(entry)).join("\n");
  const currentContent = raw.trimEnd();
  const changed = nextContent !== currentContent;

  let backupPath = null;
  if (!dryRun && changed) {
    if (backup) {
      backupPath = createBackup(filePath);
    }
    fs.writeFileSync(filePath, nextContent ? `${nextContent}\n` : "", "utf8");
  }

  return { changed, stats, backupPath, outputPath: filePath };
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const result = migrateHistoryFile({
    filePath: args.file,
    dryRun: args.dryRun,
    backup: args.backup
  });

  console.log("History migration summary");
  console.log("-----------------------");
  console.log("File:", result.outputPath);
  console.log("Total entries:", result.stats.total);
  console.log("Normalized kept:", result.stats.normalized_kept);
  console.log("Legacy converted:", result.stats.legacy_converted);
  console.log("Correlation enriched:", result.stats.correlation_enriched);
  console.log("Caused-by enriched:", result.stats.caused_by_enriched);
  console.log("Causal enriched:", result.stats.causal_enriched);
  console.log("Version enriched:", result.stats.version_enriched);
  console.log("Run id enriched:", result.stats.run_id_enriched);
  console.log("Changed:", result.changed ? "yes" : "no");
  console.log("Dry run:", args.dryRun ? "yes" : "no");
  if (result.backupPath) {
    console.log("Backup:", result.backupPath);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    runCli();
  } catch (error) {
    console.error("History migration failed");
    console.error(error);
    process.exitCode = 1;
  }
}
