# Scriptorium Maestro

Repositorio maestro para unificar dos linajes del proyecto:

- `SCRIPTORIUM🜇 0.1`: canon editorial, glosarios, prompts híbridos, generación textual.
- `scriptorium-arcontico punto cero`: motor ARC, parser, runner, pipelines audiovisuales y export CapCut.

## Principio de arquitectura

El repositorio se organiza por dominios:

- `canon/`: verdad editorial y semántica.
- `arc/`: módulos fuente del lenguaje ARC.
- `engine/`: parser, runner, acciones y exportadores.
- `engine/orchestrator/`: capa de decision que coordina ejecucion, estado y prioridad operativa.
- `integrations/`: puentes con LLM, Notion y publicación.
- `pipelines/`: fuentes de ejecución.
- `assets/`: material fuente y paquetes pesados.
- `runtime/`: outputs, caché y temporales no canónicos.
- `docs/`: auditorías, migración y gobierno técnico.
- `logs/`: memoria histórica y trazabilidad.

## Regla de oro

Nada generado en `runtime/` puede convertirse en fuente de verdad.

La verdad del sistema vive en:

- `canon/`
- `arc/`
- `engine/`
- `integrations/`
- `pipelines/`

## Estado

Este repositorio ya tiene dos lotes de consolidación activos.

Lote 1 migrado:

- base de higiene (`.gitignore`, `.env.example`)
- auditorías
- memoria de origen
- primer bloque de canon editorial

Lote 2 migrado:

- `arc/core/` y `arc/rituales/` rescatados desde `scriptorium-arcontico punto cero`
- parser ARC unificado con contrato normalizado para `steps`, `timeline` y `sequence`
- `engine/exporters/capcut_exporter.js` saneado
- `engine/preexport/voice_pipeline.js` deshardcodeado
- prueba de contrato del parser en `tests/parser_contract_check.mjs`

Lote 2.5 migrado:

- `engine/actions/` con acciones base ejecutables
- `engine/runner/` nuevo sobre el contrato actual del parser
- prueba de humo del runner en `tests/runner_smoke_check.mjs`

Lote 3 migrado:

- primer pipeline real en `pipelines/reels/madonna_hibrida/`
- verificación del runner sobre `madonna_hibrida_master.arc`

Lote 4 migrado:

- familia `kerigma_silencio_arconte` y `kerigma_master`
- soporte para `secuencia { incluye: ... }`
- soporte para acciones inline dentro de `timeline`

Lote 5 migrado:

- auditoría automatizada de referencias `assets/...` y `audio/...`
- política provisional de no inventar aliases
- reporte actual en `docs/AUDITORIA_ASSETS.md`

Lote 6 migrado:

- hidratación mínima real de `arconte/01-04.jpg`
- hidratación real de `audio/silencio_arconte.wav`
- medición de cobertura de media por pipeline

Lote 7 migrado:

- hidratación del pack oficial `madonna_hibrida_pack`
- aliases con evidencia para `assets/madonna_hibrida/01-04.jpg`
- `madonna_hibrida_acto2.arc` subido a cobertura parcial verificable

Lote 8 migrado:

- registro automatizado de refs faltantes con trazabilidad a `1.txt`..`6.txt`
- `report:missing-media` ahora refresca la auditoría antes de clasificar faltantes
- estado consolidado: `48` refs auditadas, `12` presentes en maestro y `36` aún ausentes
- deuda restante cerrada como problema de material faltante, no de ambigüedad documental

Lote 9 migrado:

- manifiesto canónico de media en `assets/source/media_canon.json`
- runner clasifica refs como `evidence_hydrated`, `placeholder_missing` o `declared_missing_final`
- reporte canónico en `docs/MANIFIESTO_MEDIA_CANONICA.md`
- separación operativa entre placeholders de plantilla y media final faltante

Lote 10 migrado:

- manifiesto de reemplazo de placeholders en `assets/source/media_replacements.json`
- `replacementHints` expuestos por el runner para plantillas
- reporte de reemplazo en `docs/MANIFIESTO_REEMPLAZO_PLACEHOLDERS.md`
- separación entre cobertura real y sugerencias de preview para placeholders

Lote 11 migrado:

- materialización de previews derivados desde placeholders
- salida no destructiva en `runtime/previews/`
- la plantilla `madonna_hibrida_template.arc` ya genera un preview parcial ejecutable

Lote 12 migrado:

- soporte para `preview_generator` en placeholders
- generación sintética de audio preview en `runtime/previews/media/`
- la plantilla `madonna_hibrida_template.arc` ya genera un preview completo `5/5`


Lote 13 migrado:

- estado del orchestrator movido de `engine/` a `runtime/orchestrator/` (bootstrap desde `engine/orchestrator/state.seed.json`)
- orchestrator sin autoejecucion por import y con decision testable (`evaluateMode`, `decideNextStep`)
- resolucion de template sin hardcode (usa `template_path`/`template_actual` del estado)
- prueba nueva `tests/orchestrator_decision_check.mjs`
- CI minima en `.github/workflows/test.yml` + `dependabot.yml`
- hardening de `.gitignore` para blindar `runtime/**` y evitar contaminar fuente de verdad

Lote 14 migrado:

- gobernanza de publicacion en `.github/CODEOWNERS`
- template de PR con checklist de coherencia en `.github/pull_request_template.md`
- politica base de seguridad en `SECURITY.md`
- guia operativa de branch protection en `docs/GOBERNANZA_PUBLICACION_2026-04-08.md`
- comando `npm run health:check` para gate local de publicacion

Lote 15 migrado:

- guard automatico de runtime en `tools/runtime_guard_check.mjs`
- nuevo test `test:runtime-guard`
- `health:check` endurecido para exigir guard + pruebas criticas
- workflow CI actualizado para fallar si se versiona output efimero en `runtime/`

Lote 16 migrado:

- validacion de estado en `engine/orchestrator/state_schema.js` (falla rapido ante estado invalido)
- Decision Engine 2.0: `decideNextStep` ahora devuelve `actions`, `priority`, `reasoning`
- memoria historica inicial en `runtime/orchestrator/history.log` para decisiones operativas

Lote 17 migrado:

- `decision_table.json` convertido a motor declarativo real (`mode_rules`, `decision_rules`, `default_decision`)
- Orchestrator evalua reglas externas en lugar de `if/else` para decidir acciones
- `history.log` formalizado como stream de eventos JSONL con escritor unico (`orchestrator`)
- `state_schema` ampliado con invariantes de coherencia (`template_actual/template_path`, `decision_actual`, rangos y tipos)

Lote 18 migrado:

- migrador de `history.log` legacy a eventos normalizados en `tools/migrate_orchestrator_history_log.mjs`
- comando `npm run migrate:history` con soporte `--dry-run` y backup automatico
- prueba dedicada `tests/history_migration_check.mjs`

Lote 19 migrado:

- verificacion de integridad de eventos historicos en `tools/history_integrity_check.mjs`
- comando `npm run test:history-integrity` integrado al `health:check` y a CI
- cobertura de pruebas para integridad en `tests/history_integrity_check.mjs`

Lote 20 migrado:

- capa `event_sourcing_layer.js` con `rebuildStateFromHistory` y chequeo `state === fold(history)`
- nuevos comandos `test:event-sourcing-layer` y `test:event-sourcing-consistency` (integrados en CI y `health:check`)
- causalidad explicita en eventos (`correlation_id`, `caused_by`) desde orchestrator
- decision engine con scoring por `weight` + traza de regla ganadora (`rule_id`, `score`)
- estrategia de snapshot periodico (`runtime/orchestrator/snapshot.json`) via `maybeWriteSnapshot`

Lote 21 migrado:

- versionado de eventos (`event_version`) + upcasting en lectura de historia
- `decision_meta` en eventos `decision.made` (regla seleccionada, descartadas, score)
- proyecciones multiples desde `history.log` (`analytics`, `debug`, `performance`)
- nuevos comandos `project:history`, `test:history-projections`
- mapa de continuidad en `docs/MAPA_CONTINUIDAD_ORCHESTRATOR_2026-04-26.md`

Lote 22 migrado:

- ingesta de conocimiento externo desde Cíclope HF con `tools/sync_ciclope_dataset.mjs`
- fusion de corpus Cíclope + export Notion en `tools/build_knowledge_fusion_pack.mjs`
- comandos operativos: `knowledge:sync:ciclope`, `knowledge:fuse`, `knowledge:bootstrap`
- salida runtime para produccion textual: `runtime/knowledge/fusion/fusion_pack.json` y `fusion_prompt.md`

Pendiente:

- hidratación real de media aún ausente:
  `assets/arconte/00.jpg`, `assets/arconte/05-12.jpg`,
  `assets/madonna_hibrida/05-12.jpg`, `assets/madonna_hibrida/__01-__04.jpg`,
  `assets/madonna/frame_01-07.jpg`, `assets/madonna/final_frame.jpg`,
  `audio/antes_del_silencio_cantos_de_ballena.wav`, `audio/transfiguracion.wav`,
  `audio/ascension.wav`, `audio/silencio_arconte_acto2.wav`,
  `audio/score_madonna_hibrida.wav`, `audio/vo_madonna_hibrida.wav`, `audio/__track.wav`
- automatizar sustitución de placeholders cuando aparezca media final real
- integración LLM/publicación sobre `fusion_prompt.md`
- política final para assets y binarios pesados

## Arranque de conocimiento hibrido

1. Exporta Notion en markdown hacia `integrations/notion_export/kraken_liminal_lab/`.
2. Ejecuta `npm run knowledge:bootstrap`.
3. Usa `runtime/knowledge/fusion/fusion_prompt.md` como base de generacion.
