# Orchestrator Contract

`engine/orchestrator/` define la capa de decision del sistema. No genera contenido y no reemplaza al runner. Su trabajo es decidir que accion ejecutar segun el estado operativo.

## Componentes

- `orchestrator.js`: logica de decision y ejecucion de acciones.
- `observer.js`: actualiza estado operativo desde eventos externos.
- `decision_table.json`: reglas declarativas de modo y decision.
- `state_schema.js`: validacion minima del estado (`modo`, `ciclope`, `estado_media`).
- `state.seed.json`: snapshot canonic para bootstrap.
- `state_store.js`: acceso unificado al estado runtime.
- `event_sourcing_layer.js`: reconstruccion de estado desde eventos y snapshots periodicos.

## Regla de oro aplicada

- `engine/` guarda logica y contratos.
- `runtime/` guarda estado mutable y efectos.

Por eso el estado vivo se guarda en `runtime/orchestrator/state.json`.
La memoria historica se registra en `runtime/orchestrator/history.log` como JSONL de eventos.

## Flujo permitido

- `Orchestrator -> Runner -> Runtime`
- `Observer -> Runtime`
- `Orchestrator -> history.log` (decision/action events)
- `Observer -> history.log` (`observation.recorded` solamente)

## Flujo prohibido

- `Observer -> Orchestrator`
- `Observer -> decision.made | action.*`

El observer no decide acciones; solo registra hechos observados.

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
  "reasoning": "no faltante + ciclope con capas pendientes",
  "rule_id": "preview_con_capas_pendientes",
  "score": 0.7
}
```

La seleccion se hace evaluando `decision_table.json` con `weight` por regla, no con `if/else` hardcodeados.
Cada decision registra tambien `decision_meta` (regla aplicada, reglas descartadas y scores).

## Migracion de historia legacy

Comando:

```powershell
npm run migrate:history
```

Opcional:
- `-- --dry-run` para simular sin escribir
- `-- --no-backup` para omitir backup
- `-- --file <ruta>` para archivo alterno

## Integridad de historia

Comando:

```powershell
npm run test:history-integrity
```

Valida que cada evento en `history.log` cumpla el contrato (`event_id`, `run_id`, `event_type`, `source`, `timestamp`, `payload`).
Tambien exige causalidad explicita (`correlation_id`, `caused_by`).
Tambien exige `event_version` para evolucion segura del contrato.

## Consistencia event sourcing

Comandos:

```powershell
npm run test:event-sourcing-consistency
npm run test:event-sourcing-layer
```

`test:event-sourcing-layer` valida la equivalencia con fixtures en CI.
`test:event-sourcing-consistency` valida equivalencia contra runtime local cuando existe historia.

## Proyecciones multiples

Comando:

```powershell
npm run project:history
```

Genera:
- `runtime/orchestrator/projections/analytics.json`
- `runtime/orchestrator/projections/debug.json`
- `runtime/orchestrator/projections/performance.json`
