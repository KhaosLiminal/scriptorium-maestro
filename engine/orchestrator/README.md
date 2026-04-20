# Orchestrator Contract

`engine/orchestrator/` define la capa de decision del sistema. No genera contenido y no reemplaza al runner. Su trabajo es decidir que accion ejecutar segun el estado operativo.

## Componentes

- `orchestrator.js`: logica de decision y ejecucion de acciones.
- `observer.js`: actualiza estado operativo desde eventos externos.
- `decision_table.json`: reglas declarativas de modo y decision.
- `state_schema.js`: validacion minima del estado (`modo`, `ciclope`, `estado_media`).
- `state.seed.json`: snapshot canonic para bootstrap.
- `state_store.js`: acceso unificado al estado runtime.

## Regla de oro aplicada

- `engine/` guarda logica y contratos.
- `runtime/` guarda estado mutable y efectos.

Por eso el estado vivo se guarda en `runtime/orchestrator/state.json`.
La memoria historica se registra en `runtime/orchestrator/history.log` como JSONL de eventos.

## Flujo permitido

- `Orchestrator -> Runner -> Runtime`
- `Observer -> Runtime`
- `Orchestrator -> history.log` (escritor unico)

## Flujo prohibido

- `Observer -> Orchestrator`
- `Observer -> history.log`

El observer no decide acciones; solo registra hechos.

## Ejecucion

- CLI: `npm run orchestrate`
- Import seguro: importar `runOrchestrator` no ejecuta efectos automaticamente.

## Estado minimo esperado

- `template_actual` o `template_path`
- `modo` (string no vacio)
- `estado_media` (`presente`, `faltante`)
- `ciclope.capas_pendientes`
- `saturacion`

## Decision Engine 2.0

`decideNextStep` devuelve un objeto declarativo:

```json
{
  "actions": ["generar_pack_preview"],
  "priority": "media_ready",
  "reasoning": "no faltante + ciclope con capas pendientes"
}
```

La seleccion se hace evaluando `decision_table.json`, no con `if/else` hardcodeados.
