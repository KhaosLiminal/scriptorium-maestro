# Security Policy

## Alcance

Este repositorio prioriza seguridad de gobernanza y trazabilidad tecnica:

- estado mutable fuera de `engine/`
- outputs efimeros fuera de versionado
- validacion automatizada en CI para rutas criticas

## Reporte de vulnerabilidades

Si detectas una vulnerabilidad:

1. No la publiques en un issue abierto.
2. Reportala por canal privado al propietario del repositorio.
3. Incluye reproduccion minima, impacto y propuesta de mitigacion.

## SLA sugerido

- Confirmacion de recepcion: 72h
- Evaluacion inicial: 7 dias
- Mitigacion o plan publico: 30 dias

## Dependencias

Dependabot esta habilitado en `.github/dependabot.yml` para npm.
