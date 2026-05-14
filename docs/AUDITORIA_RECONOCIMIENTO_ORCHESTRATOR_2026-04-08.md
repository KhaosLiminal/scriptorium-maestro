# Auditoria de Reconocimiento Orchestrator

Fecha: 2026-04-08
Repositorio: `scriptorium-maestro`
Fuentes contrastadas:
- `README.md`
- `ROADMAP-ORCHESTRATOR.md`
- `critical_aperture.txt`
- `engine/orchestrator/*`
- auditorias en `docs/`

## Hallazgos verificados

1. Regla de oro vs estado mutable
- Estado anterior: `engine/orchestrator/state.json` (contradiccion con la regla de oro).
- Estado actual: corregido con `runtime/orchestrator/state.json` + `engine/orchestrator/state.seed.json`.

2. Autoejecucion por import
- Estado anterior: `orchestrator.js` se ejecutaba al importarse.
- Estado actual: corregido con guard de ejecucion directa.

3. Hardcode de template
- Estado anterior: path fijo a `madonna_hibrida_template.arc`.
- Estado actual: corregido; usa `template_path` y `template_actual` desde estado con fallback.

4. Runtime versionado en git
- Estado anterior: `runtime/previews/*` tracked.
- Estado actual: hardening de `.gitignore` a `runtime/**` con excepciones `.gitkeep`.
- Estado actual: archivos runtime de preview removidos del indice; se conservan solo en workspace local como output efimero.

5. Cobertura de pruebas y CI
- Estado anterior: sin test del orchestrator y sin workflows.
- Estado actual: `tests/orchestrator_decision_check.mjs`, script `test:orchestrator`, workflow `.github/workflows/test.yml` y `.github/dependabot.yml`.

## Estado de recomendaciones de Proteus

- 1.1 mover estado a runtime: RESUELTO
- 1.2 runtime/previews ignore + limpieza: RESUELTO
- 1.3 estrategia general runtime ignore: RESUELTO
- 2.1 quitar hardcode de template: RESUELTO
- 2.2 evitar autoejecucion por import: RESUELTO
- 2.3 exportar decisiones: RESUELTO
- 2.4 test de decision del orchestrator: RESUELTO
- 3.1 workflow CI minimo: RESUELTO
- 4.1 README menciona orchestrator: RESUELTO
- 4.2 state snapshot desactualizado: RESUELTO por separacion runtime/seed
- 4.3 README interno de orchestrator: RESUELTO
- 4.4 script placeholder parametrizable: RESUELTO
- 5.1 dependabot y gobernanza basica: RESUELTO
- 5.2 contrato observer/orchestrator documentado: RESUELTO

## Nota sobre archivos de contexto

Se encontro `codex_SCRIPTORIUM.txt` en `docs/auditorias/codex_SCRIPTORIUM.txt` y fue considerado como memoria operativa del proceso.