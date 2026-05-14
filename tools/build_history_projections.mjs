import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHistoryEvents } from "../engine/orchestrator/event_sourcing_layer.js";
import { buildAllProjections } from "../engine/orchestrator/history_projections.js";

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
const PROJECTION_DIR = path.join(PROJECT_ROOT, "runtime", "orchestrator", "projections");

export function buildHistoryProjections() {
  const events = loadHistoryEvents();
  if (events.length === 0) {
    return { status: "missing_history", eventCount: 0, outputDir: PROJECTION_DIR };
  }

  const projections = buildAllProjections(events);
  fs.mkdirSync(PROJECTION_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECTION_DIR, "analytics.json"), JSON.stringify(projections.analytics, null, 2));
  fs.writeFileSync(path.join(PROJECTION_DIR, "debug.json"), JSON.stringify(projections.debug, null, 2));
  fs.writeFileSync(path.join(PROJECTION_DIR, "performance.json"), JSON.stringify(projections.performance, null, 2));

  return { status: "written", eventCount: events.length, outputDir: PROJECTION_DIR };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const result = buildHistoryProjections();
    if (result.status === "missing_history") {
      console.log("History projections skipped (history.log no existe o vacio)");
    } else {
      console.log(`History projections OK (${result.eventCount} eventos)`);
      console.log(`Output: ${result.outputDir}`);
    }
  } catch (error) {
    console.error("History projections failed");
    console.error(error);
    process.exitCode = 1;
  }
}
