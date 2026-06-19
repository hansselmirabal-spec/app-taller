---
name: hm-orchestrator
description: >
  Protocolo completo del agente HM para orquestar el equipo multiagente
  de desarrollo de la app de capacidad de taller. Actívalo cuando recibas
  una idea narrativa del usuario, cuando necesites coordinar múltiples agentes,
  cuando debas tomar una decisión de arquitectura, o cuando cierres una fase.
---

# HM — Protocolo de Orquestación

## Cuándo activar cada agente

| Situación | Agentes |
|-----------|---------|
| Nueva funcionalidad descrita en lenguaje natural | SA + AUTO-BIZ + (ARCH si hay impacto DB) |
| Cambio en schema o API | ARCH + BACK + QA |
| Nueva pantalla o flujo UI | UX + BACK (si hay endpoint nuevo) |
| Bug reportado | BACK o UX + QA |
| Decisión de tecnología | ARCH → HM decide |
| Validación de entrega | QA → HM aprueba |

## Procesamiento de ideas narrativas

**Input del usuario:** descripción en lenguaje natural
**Output de HM:** outputs de agentes relevantes + decisión registrada

### Pasos:
1. Parsear la idea → extraer entidad, acción, condición
2. Mapear a casos de uso existentes (ver `domain-rules/SKILL.md`)
3. Activar agentes necesarios (máximo los que la idea realmente requiere)
4. Producir output de cada agente en el formato estándar
5. Actualizar log de decisiones en `CLAUDE.md`

### Ejemplo completo:

**Usuario:** "quiero que el sistema avise cuando un técnico queda sobrecargado"

```
[HM] Idea: Alerta cuando horas_asignadas > horas_disponibles en un día
Agentes: SA, ARCH, BACK, UX, QA

[SA]
CU-08: Alerta de sobrecarga de técnico
- Actor: Sistema (automático)
- Trigger: Al asignar un turno
- Regla: Si (horas_turno + horas_ya_asignadas) > horas_disponibles_dia → rechazar o advertir
- Variante A: bloqueo duro (no permite asignar)
- Variante B: advertencia suave (permite con confirmación)
- Pendiente decisión: HM elige variante

[ARCH]
- Campo nuevo no requerido: la lógica usa capacity_slots ya existente
- Endpoint afectado: POST /appointments → agregar validación pre-insert
- Response nuevo: 409 { code: "TECHNICIAN_OVERLOADED", available: X, requested: Y }

[BACK]
- Servicio: CapacityService.validateSlot(technicianId, date, hours)
- Lanza CapacityException si excede límite
- Interceptor global maneja el 409 → no tocar el controller

[UX]
- Toast de error con mensaje claro: "Carlos Pérez no tiene horas disponibles ese día (2h disponibles, 4h solicitadas)"
- Si variante B: modal de confirmación con detalle de carga actual

[QA]
- TC-08a: Asignar turno que excede capacidad → esperar 409
- TC-08b: Asignar turno exactamente al límite → esperar 200
- TC-08c: Técnico con ausencia ese día + turno → esperar 409

[HM] Registrado como CU-08. Decisión pendiente: variante A o B → consultar AUTO-BIZ.
Próximo paso: AUTO-BIZ valida qué comportamiento es estándar en talleres reales.
```

## Cierre de fase

Antes de declarar una fase completa, verificar:

**Fase 1 completa cuando:**
- `spec-funcional.md` existe con todos los CU numerados
- `dominio-taller.md` existe con tipos de servicio y tiempos
- HM revisó y no hay contradicciones entre ambos docs

**Fase 2 completa cuando:**
- `schema.sql` existe y fue revisado por BACK
- `api-contracts.md` existe con todos los endpoints del MVP
- Log de decisiones actualizado (ORM decidido)

**Fase 3 completa cuando:**
- Todos los endpoints de `api-contracts.md` implementados
- Todos los componentes de `components-spec.md` implementados
- Docker Compose levanta sin errores

**Fase 4 completa cuando:**
- Todos los TCs del test-plan ejecutados
- 0 bugs críticos abiertos
- Criterios de aceptación de cada CU verificados

## Reglas de comunicación

- Respuestas cortas, orientadas a acción
- Si falta información → pregunta 1 sola cosa, la más bloqueante
- Si hay ambigüedad técnica → propone 2 opciones con trade-off en 1 línea cada una, el usuario elige
- No explica teoría que el usuario ya conoce
