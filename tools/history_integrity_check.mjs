import fs from "node:fs";
import path from "node:path";
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
  return typeof value === "string" && value.trim().length > 0;
}

function assertEntry(condition, message, lineNumber) {
  if (!condition) {
    throw new Error(`history.log invalido (linea ${lineNumber}): ${message}`);
  }
}

function validateDecision(decision, lineNumber) {
  assertEntry(isObject(decision), "payload.decision debe ser objeto", lineNumber);
  assertEntry(Array.isArray(decision.actions) && decision.actions.length > 0, "payload.decision.actions debe ser array no vacio", lineNumber);
  assertEntry(decision.actions.every(isNonEmptyString), "payload.decision.actions debe contener strings no vacios", lineNumber);
  assertEntry(isNonEmptyString(decision.priority), "payload.decision.priority requerido", lineNumber);
  assertEntry(isNonEmptyString(decision.reasoning), "payload.decision.reasoning requerido", lineNumber);
}

export function validateHistoryEntry(entry, lineNumber) {
  assertEntry(isObject(entry), "entrada debe ser objeto JSON", lineNumber);
  assertEntry(Number.isInteger(entry.event_version) && entry.event_version >= 1, "event_version requerido (entero >= 1)", lineNumber);
  assertEntry(isNonEmptyString(entry.event_id), "event_id requerido", lineNumber);
  assertEntry(isNonEmptyString(entry.run_id), "run_id requerido", lineNumber);
  assertEntry(isNonEmptyString(entry.event_type), "event_type requerido", lineNumber);
  assertEntry(isNonEmptyString(entry.source), "source requerido", lineNumber);
  assertEntry(isNonEmptyString(entry.timestamp), "timestamp requerido", lineNumber);
  assertEntry(isNonEmptyString(entry.correlation_id), "correlation_id requerido", lineNumber);
  assertEntry(
    entry.caused_by === null || isNonEmptyString(entry.caused_by),
    "caused_by debe ser null o event_id string",
    lineNumber
  );
  assertEntry(!Number.isNaN(Date.parse(entry.timestamp)), "timestamp debe ser ISO valido", lineNumber);
  assertEntry(isObject(entry.payload), "payload debe ser objeto", lineNumber);

  if (entry.state_snapshot !== undefined) {
    assertEntry(isObject(entry.state_snapshot), "state_snapshot debe ser objeto si existe", lineNumber);
  }

  if (entry.event_type === "decision.made") {
    validateDecision(entry.payload.decision, lineNumber);
    assertEntry(isObject(entry.state_snapshot), "decision.made requiere state_snapshot", lineNumber);

    if (entry.payload.decision_meta !== undefined) {
      assertEntry(isObject(entry.payload.decision_meta), "decision_meta debe ser objeto si existe", lineNumber);
      assertEntry(isNonEmptyString(entry.payload.decision_meta.selected_rule), "decision_meta.selected_rule requerido", lineNumber);
      assertEntry(
        Array.isArray(entry.payload.decision_meta.discarded_rules),
        "decision_meta.discarded_rules debe ser array",
        lineNumber
      );
    }
  }

  if (entry.event_type === "action.started" || entry.event_type === "action.completed") {
    assertEntry(isNonEmptyString(entry.payload.action), `${entry.event_type} requiere payload.action`, lineNumber);
  }

  if (entry.event_type === "action.failed") {
    assertEntry(isNonEmptyString(entry.payload.action), "action.failed requiere payload.action", lineNumber);
    assertEntry(isNonEmptyString(entry.payload.error_message), "action.failed requiere payload.error_message", lineNumber);
  }

  if (entry.event_type === "action.skipped") {
    assertEntry(isNonEmptyString(entry.payload.reason), "action.skipped requiere payload.reason", lineNumber);
  }
}

export function validateHistoryText(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  let entries = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    entries += 1;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch (error) {
      throw new Error(`history.log invalido (linea ${i + 1}): JSON invalido (${error.message})`);
    }

    validateHistoryEntry(entry, i + 1);
  }

  return { entries };
}

function parseArgs(argv) {
  const args = {
    file: DEFAULT_HISTORY_PATH,
    strictMissing: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--strict-missing") {
      args.strictMissing = true;
      continue;
    }
    if (token === "--file") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta ruta despues de --file");
      args.file = path.resolve(next);
      i += 1;
    }
  }

  return args;
}

export function runHistoryIntegrityCheck({ filePath = DEFAULT_HISTORY_PATH, strictMissing = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (strictMissing) {
      throw new Error(`history.log no existe: ${filePath}`);
    }
    return { status: "missing", entries: 0, filePath };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const result = validateHistoryText(raw);
  return { status: "ok", entries: result.entries, filePath };
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const result = runHistoryIntegrityCheck({
    filePath: args.file,
    strictMissing: args.strictMissing
  });

  if (result.status === "missing") {
    console.log("History integrity skipped (history.log no existe)");
    return;
  }

  console.log(`History integrity OK (${result.entries} eventos)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    runCli();
  } catch (error) {
    console.error("History integrity failed");
    console.error(error);
    process.exitCode = 1;
  }
}
