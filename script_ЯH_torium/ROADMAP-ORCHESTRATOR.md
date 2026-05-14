# 📜 ROADMAP — ORCHESTRATOR

**Proyecto:** scriptorium-maestro
**Fecha:** 2026-04-03
**Base:** Auditoría + estado actual del sistema

---

## I. CONTEXTO

El Orchestrator introduce una nueva capa de control en el sistema:

> **Antes:** ejecución manual de pipelines
> **Ahora:** sistema decide qué ejecutar, cuándo y por qué

Esto lo convierte en un **componente crítico de gobernanza**, no solo ejecución.

En términos de arquitectura moderna, pasa a ser el equivalente a un **workflow engine / decision layer**, similar a sistemas de orquestación que gestionan procesos y estados dinámicos ([Wikipedia][2]).

---

## II. PRINCIPIO RECTOR (ACTUALIZADO)

### 🔑 Regla de Oro (reformulada)

> **El engine contiene lógica y contratos.
> El runtime contiene estado y efectos.**

Corrección clave:

* ❌ Antes: violada (state.json dentro de engine)
* ✅ Ahora: separación explícita y obligatoria

---

## III. ESTADO ACTUAL (POST-AUDITORÍA)

### 🧠 Capacidades del Orchestrator

* Evaluación de modo (`produccion_limitada`)
* Decisión de siguiente paso (`generar_pack_preview`)
* Ejecución de runner ARC
* Integración con estado persistente
* Logs operativos

### ⚠️ Problemas detectados

1. Violación de separación engine/runtime
2. Hardcode de templates
3. Efectos secundarios al importar
4. Falta de testabilidad
5. CI inexistente
6. Documentación incompleta

---

## IV. FASES DEL ROADMAP

---

### 🔴 FASE 0 — CORRECCIÓN ESTRUCTURAL (CRÍTICA)

**Objetivo:** restaurar coherencia arquitectónica

#### Cambios

* [ ] Mover:

```
engine/orchestrator/state.json
→ runtime/orchestrator/state.json
```

* [ ] Actualizar rutas:

```js
const STATE_PATH = "./runtime/orchestrator/state.json";
```

* [ ] `.gitignore` (modelo definitivo):

```
runtime/**
!runtime/**/.gitkeep
```

* [ ] Eliminar:

```
runtime/previews/**
```

del historial

#### Resultado esperado

* Engine vuelve a ser **fuente de verdad pura**
* Runtime queda como **zona efímera controlada**

---

### 🔴 FASE 1 — DESACOPLE DEL ORCHESTRATOR

**Objetivo:** convertirlo en sistema, no script

#### Cambios

✔ Eliminar hardcode:

```js
const templatePath = `pipelines/reels/${state.universo}/${state.template_actual}.arc`;
```

✔ Evitar auto-ejecución:

```js
if (isMainModule) runOrchestrator();
```

✔ Exportar lógica:

```js
export function decideNextStep()
export function evaluateMode()
```

#### Resultado

* Orchestrator pasa a ser:

  * reutilizable
  * testeable
  * extensible

---

### 🟡 FASE 2 — TESTABILIDAD

**Objetivo:** validar decisiones, no solo ejecución

#### Nuevo archivo

`tests/orchestrator_decision_check.mjs`

#### Casos mínimos

1. Media faltante → `resolver_media`
2. Media completa → `generar_pack_preview`
3. Saturación alta → `expandir_templates`

#### Resultado

* Se valida la **inteligencia del sistema**, no solo su output

---

### 🔴 FASE 3 — CI (AUTOMATIZACIÓN REAL)

**Objetivo:** pasar de disciplina manual a garantía estructural

#### Crear:

```
.github/workflows/test.yml
```

#### Pipeline mínimo:

* parser
* runner
* media
* preview
* orchestrator (nuevo)

#### Resultado

* Cada commit queda verificado automáticamente
* Se elimina dependencia de “memoria humana”

---

### 🟡 FASE 4 — DOCUMENTACIÓN DEL SISTEMA

**Objetivo:** alinear código ↔ narrativa

#### Cambios

✔ README principal:

```
+ engine/orchestrator/
```

✔ Nuevo archivo:

```
engine/orchestrator/README.md
```

#### Contrato mínimo a documentar

* Qué decide el Orchestrator
* Qué NO debe hacer
* Flujo permitido:

```
Orchestrator → Runner → Runtime
Observer → (solo lectura)
```

⚠️ Regla crítica:

> Observer NUNCA llama Orchestrator

---

### 🟢 FASE 5 — PARAMETRIZACIÓN DEL SISTEMA

**Objetivo:** eliminar rigidez operativa

#### Cambios

* CLI dinámico:

```
npm run materialize:placeholder-preview -- <template>
```

* Preparación para múltiples pipelines

#### Resultado

* Sistema escala sin modificar código

---

### 🟢 FASE 6 — EVOLUCIÓN FUTURA

**(No ejecutar aún — visión)**

Basado en patrones reales de orquestación moderna ([PyPI][3]):

#### Posibles extensiones

* Multi-pipeline orchestration
* Sistema de prioridades
* Scheduler automático
* Métricas de ejecución
* Plugins / adapters

---

## V. RIESGOS ARQUITECTÓNICOS

### ⚠️ Riesgo 1 — Recaer en hardcode

Mitigación: todo debe venir de `state`

### ⚠️ Riesgo 2 — Mezclar runtime con engine

Mitigación: `.gitignore` estricto

### ⚠️ Riesgo 3 — Orchestrator como “script glorificado”

Mitigación: tests + exports + CI

### ⚠️ Riesgo 4 — Ciclos peligrosos

```
Observer → Orchestrator ❌
```

---

## VI. MÉTRICAS DE MADUREZ

| Nivel                 | Estado      |
| --------------------- | ----------- |
| Script                | ❌ superado  |
| Sistema operativo     | ⚠️ parcial  |
| Sistema gobernado     | 🔜 objetivo |
| Plataforma extensible | ⏳ futuro    |

---

## VII. DEFINICIÓN DE “DONE” (IMPORTANTE)

El Orchestrator se considera **correctamente implementado** cuando:

* [ ] No hay archivos runtime versionados
* [ ] El template no está hardcodeado
* [ ] Puede ser importado sin ejecutarse
* [ ] Tiene tests propios
* [ ] Está cubierto por CI
* [ ] Está documentado

---

## VIII. NOTA FINAL (CRÍTICA)

Tu intuición es correcta.

> Publicar discurso filosófico/ético sin tener coherencia técnica interna
> → genera disonancia estructural

Aquí estás haciendo lo correcto:

* primero arquitectura
* luego discurso

Eso no es perfeccionismo:
es **consistencia epistemológica aplicada al software**

---

## IX. SIGUIENTE PASO RECOMENDADO

Ejecutar en este orden exacto:

1. 🔴 `.gitignore` + limpieza runtime
2. 🔴 mover `state.json`
3. 🔴 fix orchestrator (hardcode + ejecución)
4. 🟡 tests
5. 🔴 CI
6. 🟡 documentación
