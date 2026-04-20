import assert from "node:assert/strict";
import {
  decideNextStep,
  evaluateMode,
  resolveTemplatePath
} from "../engine/orchestrator/orchestrator.js";
import { validateState } from "../engine/orchestrator/state_schema.js";

const rules = {
  mode_rules: [
    {
      when: {
        all: [
          { path: "modo", op: "eq", value: "produccion" },
          { path: "ciclope.capas_pendientes.length", op: "gt", value: 0 }
        ]
      },
      set_modo: "produccion_limitada"
    }
  ],
  decision_rules: [
    {
      when: { all: [{ path: "estado_media.faltante", op: "gt", value: 0 }] },
      decision: {
        actions: ["resolver_media"],
        priority: "media_missing",
        reasoning: "faltante > 0"
      }
    },
    {
      when: {
        all: [
          { path: "estado_media.faltante", op: "eq", value: 0 },
          { path: "ciclope.capas_pendientes.length", op: "gt", value: 0 }
        ]
      },
      decision: {
        actions: ["generar_pack_preview"],
        priority: "media_ready",
        reasoning: "no faltante + ciclope con capas pendientes"
      }
    },
    {
      when: {
        all: [
          { path: "estado_media.faltante", op: "eq", value: 0 },
          { path: "ciclope.capas_pendientes.length", op: "eq", value: 0 },
          { path: "saturacion", op: "gt", value: 0.7 }
        ]
      },
      decision: {
        actions: ["expandir_templates"],
        priority: "saturation_high",
        reasoning: "saturacion > 0.7"
      }
    }
  ],
  default_decision: {
    actions: ["generar_pack_preview"],
    priority: "steady_flow",
    reasoning: "flujo estable: continuar pack preview"
  }
};

const baseState = {
  universo: "madonna_hibrida",
  modo: "produccion",
  objetivo_activo: "generar_pack_preview",
  template_actual: "madonna_hibrida_template",
  template_path: "pipelines/reels/madonna_hibrida/madonna_hibrida_template.arc",
  estado_media: { presente: 5, faltante: 0, placeholder: 0, replacementHints: 0 },
  ciclope: { capas_pendientes: [], bloqueante: false },
  saturacion: 0.2
};

assert.equal(
  evaluateMode(
    {
      ...baseState,
      modo: "produccion",
      ciclope: { capas_pendientes: ["capa_6"], bloqueante: false }
    },
    rules
  ),
  "produccion_limitada"
);

assert.deepEqual(
  decideNextStep(
    {
      ...baseState,
      estado_media: { presente: 4, faltante: 1, placeholder: 0, replacementHints: 0 },
      ciclope: { capas_pendientes: [], bloqueante: false },
      saturacion: 0.1
    },
    rules
  ),
  {
    actions: ["resolver_media"],
    priority: "media_missing",
    reasoning: "faltante > 0"
  }
);

assert.deepEqual(
  decideNextStep(
    {
      ...baseState,
      estado_media: { presente: 5, faltante: 0, placeholder: 0, replacementHints: 0 },
      ciclope: { capas_pendientes: ["capa_6"], bloqueante: false },
      saturacion: 0.1
    },
    rules
  ),
  {
    actions: ["generar_pack_preview"],
    priority: "media_ready",
    reasoning: "no faltante + ciclope con capas pendientes"
  }
);

assert.deepEqual(
  decideNextStep(
    {
      ...baseState,
      estado_media: { presente: 5, faltante: 0, placeholder: 0, replacementHints: 0 },
      ciclope: { capas_pendientes: [], bloqueante: false },
      saturacion: 0.9
    },
    rules
  ),
  {
    actions: ["expandir_templates"],
    priority: "saturation_high",
    reasoning: "saturacion > 0.7"
  }
);

assert.deepEqual(
  decideNextStep(
    {
      ...baseState,
      estado_media: { presente: 5, faltante: 0, placeholder: 0, replacementHints: 0 },
      ciclope: { capas_pendientes: [], bloqueante: false },
      saturacion: 0.4
    },
    rules
  ),
  {
    actions: ["generar_pack_preview"],
    priority: "steady_flow",
    reasoning: "flujo estable: continuar pack preview"
  }
);

const resolvedTemplatePath = resolveTemplatePath(baseState);
assert.equal(resolvedTemplatePath, "pipelines/reels/madonna_hibrida/madonna_hibrida_template.arc");
assert.equal(validateState(baseState), baseState);
assert.throws(
  () => validateState({ ...baseState, modo: "", ciclope: null }),
  /Estado invalido/
);
assert.throws(
  () =>
    validateState({
      ...baseState,
      proximo_paso_sugerido: "resolver_media",
      decision_actual: {
        actions: ["generar_pack_preview"],
        priority: "steady_flow",
        reasoning: "test"
      }
    }),
  /invariante rota/
);

console.log("Orchestrator decision OK");
