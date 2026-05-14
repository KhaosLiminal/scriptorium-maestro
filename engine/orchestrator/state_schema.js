function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function isIsoDateString(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export const ORCHESTRATOR_STATE_SCHEMA = {
  type: "object",
  required: ["universo", "modo", "ciclope", "estado_media"],
  properties: {
    universo: { type: "string", minLength: 1 },
    modo: { type: "string", minLength: 1 },
    objetivo_activo: { type: "string" },
    template_actual: { type: "string" },
    template_path: { type: "string" },
    ciclope: {
      type: "object",
      required: ["capas_pendientes", "bloqueante"],
      properties: {
        capas_pendientes: { type: "array" },
        bloqueante: { type: "boolean" }
      }
    },
    estado_media: {
      type: "object",
      required: ["presente", "faltante", "placeholder", "replacementHints"],
      properties: {
        presente: { type: "number", minimum: 0 },
        faltante: { type: "number", minimum: 0 },
        placeholder: { type: "number", minimum: 0 },
        replacementHints: { type: "number", minimum: 0 }
      }
    },
    saturacion: { type: "number", minimum: 0, maximum: 1 },
    proximo_paso_sugerido: { type: "string" },
    timestamp_ultimo_lote: { type: "string" },
    timestamp_orchestrator: { type: "string" },
    timestamp_observer: { type: "string" },
    last_event: { type: "string" },
    decision_actual: {
      type: "object",
      properties: {
        actions: { type: "array" },
        priority: { type: "string" },
        reasoning: { type: "string" },
        rule_id: { type: "string" },
        score: { type: "number" }
      }
    }
  },
  anyOf: [
    { required: ["template_actual"] },
    { required: ["template_path"] }
  ]
};

function validateDecision(decision, errors) {
  if (!isObject(decision)) {
    errors.push("decision_actual invalido (objeto)");
    return;
  }

  if (!Array.isArray(decision.actions) || decision.actions.length === 0) {
    errors.push("decision_actual.actions requerido (array no vacio)");
  } else if (!decision.actions.every(isNonEmptyString)) {
    errors.push("decision_actual.actions debe contener strings no vacios");
  }

  if (!isNonEmptyString(decision.priority)) {
    errors.push("decision_actual.priority requerido (string no vacio)");
  }

  if (!isNonEmptyString(decision.reasoning)) {
    errors.push("decision_actual.reasoning requerido (string no vacio)");
  }

  if (decision.rule_id !== undefined && !isNonEmptyString(decision.rule_id)) {
    errors.push("decision_actual.rule_id invalido (string no vacio)");
  }

  if (decision.score !== undefined && !Number.isFinite(decision.score)) {
    errors.push("decision_actual.score invalido (numero)");
  }
};

export function validateState(state) {
  const errors = [];

  if (!isObject(state)) {
    throw new Error("Estado invalido: objeto requerido");
  }

  if (!isNonEmptyString(state.universo)) {
    errors.push("universo requerido (string no vacio)");
  }

  if (!isNonEmptyString(state.modo)) {
    errors.push("modo requerido (string no vacio)");
  }

  if (!isNonEmptyString(state.template_actual) && !isNonEmptyString(state.template_path)) {
    errors.push("template_actual o template_path requerido");
  }

  if (!isObject(state.ciclope)) {
    errors.push("ciclope requerido (objeto)");
  } else {
    if (!Array.isArray(state.ciclope.capas_pendientes)) {
      errors.push("ciclope.capas_pendientes requerido (array)");
    } else if (!state.ciclope.capas_pendientes.every(isNonEmptyString)) {
      errors.push("ciclope.capas_pendientes debe contener strings no vacios");
    }

    if (typeof state.ciclope.bloqueante !== "boolean") {
      errors.push("ciclope.bloqueante requerido (boolean)");
    }
  }

  if (!isObject(state.estado_media)) {
    errors.push("estado_media requerido (objeto)");
  } else {
    const presente = state.estado_media.presente;
    const faltante = state.estado_media.faltante;
    const placeholder = state.estado_media.placeholder;
    const replacementHints = state.estado_media.replacementHints;

    if (!isNonNegativeNumber(presente)) {
      errors.push("estado_media.presente requerido (numero >= 0)");
    }

    if (!isNonNegativeNumber(faltante)) {
      errors.push("estado_media.faltante requerido (numero >= 0)");
    }

    if (!isNonNegativeNumber(placeholder)) {
      errors.push("estado_media.placeholder requerido (numero >= 0)");
    }

    if (!isNonNegativeNumber(replacementHints)) {
      errors.push("estado_media.replacementHints requerido (numero >= 0)");
    }
  }

  if (state.saturacion !== undefined) {
    if (!Number.isFinite(state.saturacion) || state.saturacion < 0 || state.saturacion > 1) {
      errors.push("saturacion fuera de rango (0..1)");
    }
  }

  if (state.proximo_paso_sugerido !== undefined && !isNonEmptyString(state.proximo_paso_sugerido)) {
    errors.push("proximo_paso_sugerido invalido (string no vacio)");
  }

  if (state.decision_actual !== undefined) {
    validateDecision(state.decision_actual, errors);

    if (
      isObject(state.decision_actual) &&
      Array.isArray(state.decision_actual.actions) &&
      state.decision_actual.actions.length > 0 &&
      isNonEmptyString(state.proximo_paso_sugerido) &&
      state.decision_actual.actions[0] !== state.proximo_paso_sugerido
    ) {
      errors.push("invariante rota: proximo_paso_sugerido debe coincidir con decision_actual.actions[0]");
    }
  }

  if (state.timestamp_orchestrator !== undefined && !isIsoDateString(state.timestamp_orchestrator)) {
    errors.push("timestamp_orchestrator invalido (ISO date)");
  }

  if (state.timestamp_observer !== undefined && !isIsoDateString(state.timestamp_observer)) {
    errors.push("timestamp_observer invalido (ISO date)");
  }

  if (errors.length > 0) {
    throw new Error(`Estado invalido: ${errors.join("; ")}`);
  }

  return state;
}
