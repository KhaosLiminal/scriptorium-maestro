# Mapa de Continuidad del Orchestrator

Fecha: 2026-04-26
Estado: vigente

## 1) De dónde venimos

### Fase Fundacional (Lotes 1-15)
- Unificación de linajes (`SCRIPTORIUM🜇 0.1` + `scriptorium-arcontico punto cero`).
- Contrato ARC estable (parser/runner) con pruebas.
- Regla de Oro aplicada: `runtime/` fuera de fuente de verdad.
- CI mínima + gobernanza base (`CODEOWNERS`, PR template, branch protection recomendado).

### Fase Orchestrator Inicial (Lotes 16-19)
- `state_schema` e invariantes mínimas.
- Decision Engine declarativo (`decision_table.json`).
- `history.log` como memoria operativa.
- Migración de historia legacy + test de integridad histórica.

## 2) Dónde estamos ahora

### Fase Event-Sourcing Activa (Lotes 20-21)
- `state === fold(history)` validado automáticamente.
- Causalidad explícita en eventos: `correlation_id`, `caused_by`.
- Versionado de eventos: `event_version` + upcasting en lectura.
- `decision_meta` en `decision.made`:
- regla seleccionada
- reglas descartadas
- puntuación usada (`score`)
- Proyecciones múltiples operativas desde historia:
- `analytics`
- `debug`
- `performance`
- Snapshot strategy disponible (`snapshot.json`).

## 3) Qué significa arquitectónicamente

- El sistema dejó de ser solo ejecutor; ahora es auditable y reconstruible.
- El estado runtime es una proyección derivada de una historia de eventos.
- La observabilidad de decisiones ya no depende de memoria humana.

## 4) Riesgos vigentes (reales)

- Complejidad creciente del contrato de eventos.
- Necesidad de disciplina en evolución (`upcasters`, compatibilidad, validaciones).
- Motor de decisión aún determinista (no reflexivo/adaptativo).

## 5) Hacia dónde vamos (próximos lotes)

### Lote 22 — Gobierno de eventos
- Registro formal de tipos de evento y versiones.
- Carpeta `engine/orchestrator/upcasters/` por versión.
- Test de compatibilidad retroactiva por fixture histórico.

### Lote 23 — Proyecciones operativas
- Materialización programada de proyecciones.
- Métricas SLO del Orchestrator (latencia por acción, tasa de fallo, conflictos de reglas).
- Alertas de integridad (desfase `state` vs `fold(history)`).

### Lote 24 — Meta-decisión
- Persistir `candidate_rules` completas por decisión.
- Detectar conflictos frecuentes y reglas dominadas.
- Proponer ajuste de pesos con revisión humana explícita (sin auto-mutación directa).

## 6) Bloque listo para Notion (copiar/pegar)

```md
Origen:
- Lotes 1-15: fundación técnica y gobernanza.
- Lotes 16-19: orchestrator declarativo con memoria.

Ahora:
- Lotes 20-21: event sourcing real, causalidad, versionado, proyecciones.

Siguiente:
- Lote 22: gobierno/versionado de eventos.
- Lote 23: proyecciones + SLO/alertas.
- Lote 24: meta-decisión con supervisión humana.
```
