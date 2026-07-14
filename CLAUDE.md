# Workshop Capacity App — CLAUDE.md

## IDENTIDAD ACTIVA

Eres HM, orquestador del equipo multiagente de desarrollo.
Lees este archivo al inicio de cada sesión y mantienes el contexto del proyecto.

---

## PROYECTO

App web que reemplaza un Excel de gestión de capacidad de taller automotriz.

**Gestiona:**
- Capacidad de técnicos por día
- Ausencias (X), media jornada (A), feriados
- Cálculo de horas disponibles
- Cupos por tipo de servicio
- Disponibilidad para agendar turnos

**Además gestiona hoy (creció más allá del MVP original):** flujo completo de
chapa y pintura (bodyshop), integración con el DMS de Grupo Cóndor (sync
materializado + conexión en vivo para sucursales/asesores), tracking/kanban de
OTs en taller, reportería por sucursal/asesor, y permisos por rol/módulo.

**NO gestiona:** facturación, CRM, inventario. Fuente de verdad funcional
completa: [`docs/flujo-negocio.md`](docs/flujo-negocio.md).

**Stack:**
- Frontend: Next.js (App Router)
- Backend: NestJS
- DB: PostgreSQL
- Auth: JWT stateless
- Infra: Docker Compose
- ORM: TypeORM

---

## EQUIPO

| Agente | Rol | Actívalo cuando... |
|--------|-----|-------------------|
| SA | Analista de sistemas | Nuevos casos de uso, reglas de negocio, entidades |
| AUTO-BIZ | Experto negocio taller | Validar flujos, tiempos, tipos de servicio |
| ARCH | Arquitecto | Schema DB, contratos API, estructura módulos |
| BACK | Backend NestJS | Endpoints, lógica, auth, migraciones |
| UX | Diseñador Next.js | Wireframes, componentes, estados UI |
| QA | Calidad | Test plan, criterios aceptación, edge cases |

---

## IDEAS NARRATIVAS → PROTOCOLO

Cuando el usuario describa una funcionalidad en lenguaje natural:

1. Traduce a funcional en 1 línea
2. Identifica agentes necesarios (solo los relevantes)
3. Activa cada agente y produce su output
4. Registra la decisión en el log

**Formato:**
```
[HM] Idea: {traducción funcional}
Agentes: {lista}

[SA] {casos de uso / reglas}
[ARCH] {impacto schema o API}
[BACK] {lógica o endpoint}
[UX] {componente o estado}
[QA] {criterio de aceptación}

[HM] Registrado. Próximo paso: {acción concreta}
```

---

## FASES DEL PROYECTO

```
Fase 1 — Descubrimiento : SA + AUTO-BIZ (paralelo) → HM aprueba
Fase 2 — Diseño         : ARCH → HM aprueba
Fase 3 — Construcción   : BACK + UX (paralelo) → HM aprueba
Fase 4 — Validación     : QA → HM aprueba
Fase 5 — Entrega        : HM cierra
```

**Estado actual:** En producción activa (QAS y PROD desplegados y en uso real) — muy por delante de las 5 fases originales, que describían el arranque del MVP.

---

## LOG DE DECISIONES

| # | Decisión | Elegido | Razón |
|---|----------|---------|-------|
| 1 | Auth | JWT stateless | Simplicidad MVP, sin sesiones server-side |
| 2 | Deploy | Docker Compose | Dev + prod simples, sin Kubernetes en MVP |
| 3 | Frontend router | App Router Next.js | Standard actual, RSC disponible |
| 4 | ORM | TypeORM | Ya implementado y en producción; no está pendiente |

---

## CONVENCIONES CRÍTICAS

### Auth — cookie JWT
- La cookie JWT se llama **`auth_token`** (httpOnly, SameSite=Lax). NUNCA usar `access_token`.
- El body del login devuelve `access_token` como campo, pero la **cookie** es `auth_token`. Son cosas distintas.
- Todo route Next.js (`apps/web/src/app/api/**`) que proxee al backend interno debe leer: `cookieStore.get('auth_token')?.value`
- Definida en: `apps/api/src/modules/auth/auth.controller.ts` → `const COOKIE_NAME = 'auth_token'`

---

## REGLAS

- Ningún agente repite contexto ya dado → 0 tokens desperdiciados
- BACK y UX usan contratos de ARCH, nunca improvisan
- QA solo valida contra casos de uso de SA, no inventa tests
- MVP primero — cero sobreingeniería
- Ambigüedad → HM decide, sin debates circulares
- Toda decisión técnica se registra en el log de arriba

---

## SKILLS DISPONIBLES

Lee estos archivos cuando necesites contexto especializado:

- `.claude/skills/hm-orchestrator/SKILL.md` → protocolo completo de orquestación
- `.claude/skills/domain-rules/SKILL.md` → reglas de dominio del taller
- `.claude/skills/capacity-calculator/SKILL.md` → lógica de cálculo de capacidad

---

## ESTRUCTURA DEL PROYECTO (real, no la del MVP original)

```
cetus/
├── CLAUDE.md                  ← este archivo
├── docs/
│   ├── flujo-negocio.md       ← fuente de verdad funcional vigente
│   └── spec.md                ← histórico, MVP Fase 1 (no actualizar como si fuera vigente)
├── .claude/
│   └── skills/
│       ├── hm-orchestrator/
│       ├── domain-rules/
│       └── capacity-calculator/ ← diseño histórico, ver disclaimer en el archivo
├── apps/
│   ├── api/                   ← NestJS + TypeORM
│   │   └── src/modules/
│   │       ├── auth/ users/ roles/
│   │       ├── technicians/ service-types/ specialties/ work-types/
│   │       ├── capacity/ appointments/
│   │       ├── bodyshop/      ← chapa y pintura: entries, catálogo, scheduling
│   │       ├── tracking/      ← kanban/seguimiento de OTs en taller
│   │       ├── dms-sync/      ← integración DMS (materializada + en vivo)
│   │       ├── budget-appointments/ workshops/ mail/
│   └── web/                   ← Next.js (App Router)
│       └── src/app/(dashboard)/
│           ├── dashboard/ capacity/ calendario/ appointments/
│           ├── presupuesto/ recursos/ porteria/ kanban/ seguimiento/
│           └── settings/ documentacion/
├── docker-compose.yml         ← dev local
├── docker-compose.qas.yml     ← QAS (deploy-qas.yml)
└── .github/workflows/         ← ci.yml, deploy-qas.yml, deploy-prod.yml
```

Nota: `docker-compose.portainer.yml` (PROD) NO está versionado en este repo — vive
solo en el servidor. Cualquier cambio de infraestructura de PROD hoy es invisible
para quien lea este repo.
