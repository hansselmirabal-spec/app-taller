---
description: >
  Lanza la fase indicada del proyecto con los agentes correctos en paralelo.
  Uso: /fase 1 | 2 | 3 | 4
argument-hint: "<número de fase: 1, 2, 3 o 4>"
---

# Comando /fase

Según el número de fase recibido, HM lanza los subagentes correspondientes:

## /fase 1 — Descubrimiento
Lanzar en PARALELO:
- Task al agente `sa`: "Lee .claude/skills/domain-rules/SKILL.md y genera /docs/spec-funcional.md con todos los CUs numerados para la app de gestión de capacidad de taller automotriz."
- Task al agente `auto-biz`: "Lee .claude/skills/domain-rules/SKILL.md y genera /docs/dominio-taller.md con catálogo de servicios, tiempos estimados y reglas operativas reales."

Al completar ambos: HM revisa, consolida y reporta al usuario. Pide aprobación antes de continuar.

## /fase 2 — Diseño
Lanzar SECUENCIAL:
- Task al agente `arch`: "Lee /docs/spec-funcional.md y /docs/dominio-taller.md. Genera: /docs/schema.sql, /docs/api-contracts.md, y /docs/architecture-decisions.md para el MVP."

Al completar: HM revisa y pide aprobación.

## /fase 3 — Construcción
Lanzar en PARALELO:
- Task al agente `back`: "Lee /docs/api-contracts.md, /docs/schema.sql y .claude/skills/capacity-calculator/SKILL.md. Implementa todos los módulos NestJS del MVP en /backend/src/"
- Task al agente `ux`: "Lee /docs/api-contracts.md y /docs/spec-funcional.md. Implementa las 6 pantallas del MVP en /frontend/src/app/ y componentes en /frontend/src/components/"

Al completar ambos: HM revisa y pide aprobación.

## /fase 4 — Validación
Lanzar SECUENCIAL:
- Task al agente `qa`: "Lee /docs/spec-funcional.md, /docs/api-contracts.md y .claude/skills/capacity-calculator/SKILL.md. Genera /docs/test-plan.md con todos los TCs priorizados del MVP."

Al completar: HM revisa, reporta métricas y pide aprobación final.
