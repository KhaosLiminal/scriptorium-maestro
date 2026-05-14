import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  EVENT_VERSION_CURRENT,
  PROJECT_ROOT,
  DECISION_PATH,
  appendHistoryEntry,
  loadJson,
  loadState,
  saveState
} from "./state_store.js";
import { maybeWriteSnapshot } from "./event_sourcing_layer.js";

const DEFAULT_DECISION = {
  actions: ["generar_pack_preview"],
  priority: "steady_flow",
  reasoning: "flujo estable: continuar pack preview",
  rule_id: "default",
  score: 0
};

function asArcFilename(templateActual) {
  const raw = String(templateActual ?? "").trim();
  if (!raw) return null;
  return raw.endsWith(".arc") ? raw : `${raw}.arc`;
}

function candidateTemplatePaths(state) {
  const out = [];

  if (typeof state.template_path === "string" && state.template_path.trim()) {
    out.push(state.template_path.trim());
  }

  const arcFilename = asArcFilename(state.template_actual);
  const universo = String(state.universo ?? "").trim();

  if (universo && arcFilename) {
    out.push(path.join("pipelines", "reels", universo, arcFilename));
  }

  if (arcFilename) {
    const familyFromTemplate = arcFilename.replace(/\.arc$/i, "").replace(/_template$/i, "");
    if (familyFromTemplate) {
      out.push(path.join("pipelines", "reels", familyFromTemplate, arcFilename));
    }
  }

  return [...new Set(out)];
}

export function resolveTemplatePath(state, projectRoot = PROJECT_ROOT) {
  const candidates = candidateTemplatePaths(state);

  for (const relativeCandidate of candidates) {
    const absoluteCandidate = path.resolve(projectRoot, relativeCandidate);
    if (fs.existsSync(absoluteCandidate)) {
      return relativeCandidate.replace(/\\/g, "/");
    }
  }

  throw new Error(`No se pudo resolver template desde estado. Candidatos: ${candidates.join(", ")}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPathValue(input, pathExpr) {
  const segments = String(pathExpr ?? "")
    .split(".")
    .map(token => token.trim())
    .filter(Boolean);

  let current = input;
  for (const segment of segments) {
    if (segment === "length" && (Array.isArray(current) || typeof current === "string")) {
      current = current.length;
      continue;
    }

    if (!isObject(current) && !Array.isArray(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function compareValues(actual, op, expected) {
  switch (op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "includes":
      if (Array.isArray(actual)) return actual.includes(expected);
      if (typeof actual === "string") return actual.includes(String(expected));
      return false;
    case "exists":
      return actual !== undefined && actual !== null;
    case "not_exists":
      return actual === undefined || actual === null;
    default:
      return false;
  }
}

function matchesCondition(state, condition) {
  if (!isObject(condition)) return false;

  if (Array.isArray(condition.all)) {
    return condition.all.every(item => matchesCondition(state, item));
  }

  if (Array.isArray(condition.any)) {
    return condition.any.some(item => matchesCondition(state, item));
  }

  if (condition.not) {
    return !matchesCondition(state, condition.not);
  }

  if (typeof condition.path !== "string") return false;
  const actual = getPathValue(state, condition.path);
  return compareValues(actual, condition.op ?? "eq", condition.value);
}

function normalizeDecision(decisionLike, metadata = {}) {
  const actions = Array.isArray(decisionLike?.actions)
    ? decisionLike.actions
        .map(item => String(item ?? "").trim())
        .filter(Boolean)
    : [];

  return {
    actions,
    priority: String(decisionLike?.priority ?? "unspecified"),
    reasoning: String(decisionLike?.reasoning ?? "sin razon declarada"),
    rule_id: metadata.ruleId ?? String(decisionLike?.rule_id ?? "unspecified"),
    score: Number.isFinite(metadata.score) ? Number(metadata.score) : Number(decisionLike?.score ?? 0)
  };
}

function buildDecisionMeta({ candidates, selectedRuleId, selectedScore }) {
  const matchedRules = candidates
    .filter(item => item.matched)
    .map(item => ({
      rule_id: item.ruleId,
      score: item.score
    }));

  const discardedRules = candidates
    .filter(item => !item.matched)
    .map(item => item.ruleId);

  return {
    selected_rule: selectedRuleId,
    selected_score: selectedScore,
    matched_rules: matchedRules,
    discarded_rules: discardedRules
  };
}

export function evaluateMode(state, rules) {
  const modeRules = Array.isArray(rules?.mode_rules) ? rules.mode_rules : [];

  for (const modeRule of modeRules) {
    if (matchesCondition(state, modeRule?.when)) {
      const candidateMode = String(modeRule?.set_modo ?? "").trim();
      if (candidateMode) return candidateMode;
    }
  }

  return state.modo;
}

export function decideNextStep(state, rules) {
  return decideNextStepWithMeta(state, rules).decision;
}

export function decideNextStepWithMeta(state, rules) {
  const decisionRules = Array.isArray(rules?.decision_rules) ? rules.decision_rules : [];
  const candidates = [];

  for (let i = 0; i < decisionRules.length; i += 1) {
    const decisionRule = decisionRules[i];
    const matched = matchesCondition(state, decisionRule?.when);

    const weight = Number.isFinite(decisionRule?.weight) ? Number(decisionRule.weight) : 0;
    candidates.push({
      index: i,
      ruleId: String(decisionRule?.id ?? `rule_${i + 1}`),
      decision: decisionRule?.decision,
      score: weight,
      matched
    });
  }

  const matchedCandidates = candidates.filter(item => item.matched);

  if (matchedCandidates.length > 0) {
    matchedCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

    const winner = matchedCandidates[0];
    const decision = normalizeDecision(winner.decision, {
      ruleId: winner.ruleId,
      score: winner.score
    });

    return {
      decision,
      meta: buildDecisionMeta({
        candidates,
        selectedRuleId: winner.ruleId,
        selectedScore: winner.score
      })
    };
  }

  const decision = normalizeDecision(rules?.default_decision ?? DEFAULT_DECISION, {
    ruleId: "default",
    score: Number.isFinite(rules?.default_decision?.weight) ? Number(rules.default_decision.weight) : 0
  });

  return {
    decision,
    meta: buildDecisionMeta({
      candidates,
      selectedRuleId: "default",
      selectedScore: decision.score
    })
  };
}

function runRunner(templatePath, envExtra = {}) {
  const runnerPath = path.join(PROJECT_ROOT, "engine", "runner", "index.js");
  execFileSync(process.execPath, [runnerPath, templatePath], {
    stdio: "inherit",
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...envExtra
    }
  });
}

function runHydrateMedia() {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run hydrate:media"], {
      stdio: "inherit",
      cwd: PROJECT_ROOT
    });
    return;
  }

  execFileSync("npm", ["run", "hydrate:media"], {
    stdio: "inherit",
    cwd: PROJECT_ROOT
  });
}

function getPrimaryAction(decision) {
  if (!Array.isArray(decision?.actions) || decision.actions.length === 0) {
    return null;
  }
  return decision.actions[0];
}

function executeAction(decision, state, runId, causedByEventId) {
  const nextStep = getPrimaryAction(decision);
  let startedEventId = null;

  try {
    if (!nextStep) {
      appendHistoryEntry({
        event_id: randomUUID(),
        event_version: EVENT_VERSION_CURRENT,
        run_id: runId,
        correlation_id: runId,
        caused_by: causedByEventId ?? null,
        event_type: "action.skipped",
        source: "orchestrator",
        timestamp: new Date().toISOString(),
        payload: { reason: "sin accion declarada" }
      });
      return;
    }

    startedEventId = randomUUID();
    appendHistoryEntry({
      event_id: startedEventId,
      event_version: EVENT_VERSION_CURRENT,
      run_id: runId,
      correlation_id: runId,
      caused_by: causedByEventId ?? null,
      event_type: "action.started",
      source: "orchestrator",
      timestamp: new Date().toISOString(),
      payload: { action: nextStep }
    });

    if (nextStep === "generar_pack_preview") {
      const templatePath = resolveTemplatePath(state, PROJECT_ROOT);
      runRunner(templatePath, {
        ORCHESTRATOR_RUN_ID: runId,
        ORCHESTRATOR_CORRELATION_ID: runId,
        ORCHESTRATOR_CAUSED_BY: startedEventId ?? causedByEventId ?? ""
      });
    } else if (nextStep === "continuar_ciclope") {
      console.log("Ciclope pendiente; se omite runner");
    } else if (nextStep === "resolver_media") {
      runHydrateMedia();
    } else if (nextStep === "expandir_templates") {
      console.log("expandir_templates: pendiente de implementar");
    }

    appendHistoryEntry({
      event_id: randomUUID(),
      event_version: EVENT_VERSION_CURRENT,
      run_id: runId,
      correlation_id: runId,
      caused_by: startedEventId,
      event_type: "action.completed",
      source: "orchestrator",
      timestamp: new Date().toISOString(),
      payload: { action: nextStep }
    });
  } catch (error) {
    try {
      appendHistoryEntry({
        event_id: randomUUID(),
        event_version: EVENT_VERSION_CURRENT,
        run_id: runId,
        correlation_id: runId,
        caused_by: startedEventId ?? causedByEventId ?? null,
        event_type: "action.failed",
        source: "orchestrator",
        timestamp: new Date().toISOString(),
        payload: {
          action: nextStep,
          error_message: error instanceof Error ? error.message : String(error)
        }
      });
    } catch (historyError) {
      console.error("Error registrando action.failed en history.log");
      console.error(historyError);
    }
    console.error("Error ejecutando accion del orchestrator");
    console.error(error);
  }
}

export function runOrchestrator() {
  const runId = randomUUID();
  const state = loadState();
  const rules = loadJson(DECISION_PATH);

  const newMode = evaluateMode(state, rules);
  const stateForDecision = { ...state, modo: newMode };
  const decisionResult = decideNextStepWithMeta(stateForDecision, rules);
  const decision = decisionResult.decision;
  const nextStep = getPrimaryAction(decision);
  const timestamp = new Date().toISOString();

  const updatedState = {
    ...state,
    modo: newMode,
    proximo_paso_sugerido: nextStep ?? "sin_accion",
    decision_actual: decision,
    timestamp_orchestrator: timestamp
  };

  saveState(updatedState);
  const decisionEventId = randomUUID();
  appendHistoryEntry({
    event_id: decisionEventId,
    event_version: EVENT_VERSION_CURRENT,
    run_id: runId,
    correlation_id: runId,
    caused_by: null,
    event_type: "decision.made",
    timestamp,
    source: "orchestrator",
    payload: {
      decision,
      decision_meta: decisionResult.meta
    },
    state_snapshot: updatedState
  });

  console.log("ORCHESTRATOR DECISION");
  console.log("---------------------");
  console.log("Modo:", newMode);
  console.log("Siguiente paso:", nextStep ?? "sin_accion");
  console.log("Prioridad:", decision.priority);
  console.log("Regla:", decision.rule_id);
  console.log("Score:", decision.score);
  console.log("Razon:", decision.reasoning);

  executeAction(decision, updatedState, runId, decisionEventId);

  try {
    const snapshotInterval = Number.parseInt(process.env.ORCHESTRATOR_SNAPSHOT_INTERVAL ?? "10", 10);
    const result = maybeWriteSnapshot({ interval: Number.isFinite(snapshotInterval) ? snapshotInterval : 10 });
    if (result.status === "written") {
      console.log("Snapshot:", result.snapshotPath);
    }
  } catch (error) {
    console.warn("Snapshot warning:", error instanceof Error ? error.message : String(error));
  }

  return loadState();
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    runOrchestrator();
  } catch (error) {
    console.error("ORCHESTRATOR ERROR");
    console.error(error);
    process.exitCode = 1;
  }
}
