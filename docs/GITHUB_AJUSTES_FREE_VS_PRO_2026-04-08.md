# GitHub: Ajustes Free vs Pro (y cuando entra Team/Enterprise)

Fecha: 2026-04-08
Repo objetivo: `KhaosLiminal/scriptorium-maestro`

## Contexto rapido

Este documento aterriza que puedes exigir hoy con plan `Free` y que solo aplica al pasar a `Pro` o `Team/Enterprise`.

Clave operativa:
- En `Free`, un repo **publico** tiene mas controles que un repo privado.
- Si vuelves el repo a **privado**, varias reglas fuertes de rama y `CODEOWNERS` pueden dejar de aplicar en `Free`.

## Matriz de decisiones

| Ajuste / Feature | Free (repo publico) | Free (repo privado) | Pro (repo privado personal) | Team/Enterprise |
|---|---|---|---|---|
| Branch protection (PR obligatorio, approvals, checks, linear history, no force push, no deletions) | Si | Limitado / no completo | Si | Si |
| CODEOWNERS + `Require review from Code Owners` | Si | No (en Free) | Si | Si |
| Required status checks (`test`) | Si | Limitado / no completo | Si | Si |
| GitHub Actions (CI) | Si (minutos gratis en public) | Si (cuota mensual de plan) | Si (mayor cuota) | Si (mayor cuota) |
| Dependabot alerts + security/version updates | Si | Si | Si | Si |
| Advanced Security completo en privados (Code Security / Secret Protection) | No | No | No (sin add-on) | Si (con add-on/licencia) |
| Code scanning + secret scanning en repo publico | Si (subset gratuito) | N/A | N/A | Si |

## Recomendacion para tu estado actual (repo publico)

Mantener activos:
1. `Require a pull request before merging`
2. `Require approvals` = `1`
3. `Dismiss stale pull request approvals when new commits are pushed`
4. `Require status checks to pass before merging` con check `test`
5. `Require conversation resolution before merging`
6. `Require linear history`
7. `Do not allow bypassing the above settings`
8. Dejar desmarcado: `Allow force pushes`
9. Dejar desmarcado: `Allow deletions`

## Ajuste critico para evitar bloqueo (solo maintainer)

Si eres la unica persona revisora, este combo puede bloquear merges:
- `Require approvals` = ON
- `Require review from Code Owners` = ON
- y solo hay 1 mantenedor real

En ese caso, usa una de estas dos rutas:
1. Mantener `Require approvals: 1` y poner `Require review from Code Owners: OFF` (recomendado para solo-maintainer).
2. O agregar un segundo revisor real con permisos de escritura que pueda aprobar PRs.

## Si decides volver el repo a privado

Sin `Pro`, perderas parte de enforcement de rama/codigo propietario.

Opciones:
1. Mantener repo publico para conservar enforcement fuerte en `Free`.
2. Pasar a `Pro` si quieres repo privado con branch protection + CODEOWNERS efectivos.
3. Si crece a equipo, pasar a `Team` y evaluar add-on de seguridad avanzada.

## Checklist minimo Free (operable hoy)

1. `main` protegido con PR + checks + no force push + no deletions.
2. Workflow `test` visible en Actions (al menos 1 corrida reciente para seleccionarlo como required check).
3. Ejecutar local antes de PR:

```powershell
npm run health:check
```

4. Usar PR template (`.github/pull_request_template.md`) en cada cambio.

## Nota sobre pantallas de "Security and quality"

En UI nueva puede verse como `Security and quality` o `Advanced Security`.
No todo lo de esa seccion requiere pago:
- Dependabot base: utilizable en Free.
- Parte de scanning/secret en public: utilizable sin costo.
- Suite avanzada completa para privados: requiere Team/Enterprise + licencia/add-on.

## Fuentes oficiales consultadas

- Planes/precios: https://github.com/pricing
- Protected branches (docs): https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- Branch protection (API note de disponibilidad por plan): https://docs.github.com/en/rest/branches/branch-protection
- GitHub Advanced Security billing/licensing: https://docs.github.com/en/billing/concepts/product-billing/github-advanced-security
- About GitHub Advanced Security: https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security
- Setting repository visibility (impacto al pasar a privado): https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
