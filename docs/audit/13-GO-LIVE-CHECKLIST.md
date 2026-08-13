# 13 — Checklist de Gate Final (Go-Live) — App Taller (Grupo Cóndor)

Basado en la sección 23 ("Gate final") del pedido original de auditoría. Estado real ya conocido por los 9 informes de dominio (`docs/audit/02` a `docs/audit/11`) — nada de esto se re-ejecutó en esta pasada de consolidación.

**Actualización 2026-08-13:** los 4 bloqueantes P0 de código (BE-01/A-3, BE-02/A-4, A-2, ID-02, FE-16) ya se corrigieron y desplegaron a QAS el mismo día (PR #50, #51, #52) — ver detalle en `12-REMEDIATION-PLAN.md`. Los 4 P0 de infraestructura/decisión de negocio (TLS, SMTP, backup/restore, deriva de PROD) siguen pendientes.

---

## Gate técnico

| Ítem | Estado | Evidencia |
|---|---|---|
| Build frontend (`next build`, apps/web) | ✅ Pasa | 42 rutas generadas, sin `force-dynamic` forzado — `07-QA-AUDIT.md` |
| Build backend (`nest build`, apps/api) | ✅ Pasa | `07-QA-AUDIT.md` |
| Lint backend (`eslint src`, apps/api) | ✅ Pasa | 0 errores, 17 warnings `no-unused-vars` — `07-QA-AUDIT.md` |
| Lint frontend (`next lint`, apps/web) | ❌ Roto | Next.js 16.2.3 eliminó el subcomando `lint`; `apps/web` no tiene `eslint` como dependencia ni config propia; CI no tiene job `lint-web` (QA-01) |
| Lint raíz (`pnpm lint`) | ❌ Roto | Loop de invocación recursiva de turbo — pnpm no reconoce `apps/*` como workspaces reales (falta `pnpm-workspace.yaml`) (QA-02). No bloquea CI real (que lintea por app). |
| Typecheck backend (`tsc --noEmit`) | ✅ Pasa | 0 errores — `07-QA-AUDIT.md` |
| Typecheck frontend (`tsc --noEmit`) | ✅ Pasa | 0 errores — `07-QA-AUDIT.md` |
| Unit tests | ✅ 375/377 pasando | Backend 294/296 (22 suites, 2 skipped), Frontend 81/81 (8 suites) — `07-QA-AUDIT.md` |
| Integration tests | ✅ Cubiertos como parte de la suite Jest arriba | Cobertura sólida en cálculo de capacidad y transiciones de `TrackingLog`; gaps puntuales en duplicidad de vehículo (QA-03) y `RolesGuard` (QA-04) — `07-QA-AUDIT.md` |
| E2E críticos | ⚠️ Parcial | Existe `apps/web/e2e/auth.spec.ts` (Playwright) pero no se ejecutó en esta auditoría (requiere servidor vivo, fuera del alcance de `pnpm test`) — `07-QA-AUDIT.md`. Ver los 10 casos E2E de negocio abajo, ninguno ejecutado en esta pasada. |
| Migraciones desde base de datos limpia | ⚠️ No probado | No se ejecutó "correr todas las migraciones desde Postgres vacío" en esta auditoría; migraciones existen y están numeradas secuencialmente (001-010) pero su reproducibilidad end-to-end no tiene evidencia directa (DEVOPS-07) |
| Prueba de backup/restore | ❌ Nunca ejecutado | Directorio de backups en el servidor vacío (solo el script `backup.sh`, cero `.sql`); sin cron ni systemd timer; pipeline real de deploy no tiene step de `pg_dump`. Backup = **NO VALIDADO** por criterio explícito del pedido de auditoría (DEVOPS-02) |
| Smoke test del deployment | ⚠️ Parcial | El pipeline de PROD sí tiene rollback automático a última imagen sana si el healthcheck post-deploy falla (DEVOPS-05, aspecto positivo), pero no cubre incompatibilidad de schema tras rollback de imagen. No hay evidencia de un smoke test manual explícito post-deploy en esta pasada. |
| Estado real de PROD vs. QAS | ❌ Divergente | PROD 5 migraciones atrás, 0 filas en todas las tablas operativas, imagen ~3 semanas más vieja que QAS (A-1) — contradice la premisa de "producción activa"; requiere aclarar con el equipo si este es el ambiente productivo real |
| TLS en el compose real de producción | ❌ No configurado | `docker-compose.portainer.yml` (el que efectivamente se despliega) sirve por HTTP plano; `docker-compose.prod.yml` (con TLS/certbot) existe en el repo pero nunca se usa (SEC-01, DEVOPS-01) |
| SMTP en producción | ❌ No configurado | `SMTP_HOST=""` en el compose real de PROD; passwords temporales y tokens de reset se loguean en texto plano (SEC-02, DEVOPS-03) |

---

## Los 10 casos E2E obligatorios del pedido original

Ninguno se ejecutó en esta pasada de auditoría estática — todos requieren credenciales y un ambiente vivo (QAS) para correrse de punta a punta.

| # | Caso | Estado |
|---|---|---|
| 1 | Crear agenda válida | ⏸ Pendiente — requiere credenciales de QAS para ejecución E2E en vivo, no se probó en esta pasada de auditoría estática |
| 2 | Agenda sin capacidad | ⏸ Pendiente — requiere credenciales de QAS para ejecución E2E en vivo, no se probó en esta pasada de auditoría estática |
| 3 | Sobrecargar técnico | ⏸ Pendiente — requiere credenciales de QAS para ejecución E2E en vivo, no se probó en esta pasada de auditoría estática |
| 4 | Duplicar vehículo activo | ⏸ Pendiente — requiere credenciales de QAS para ejecución E2E en vivo, no se probó en esta pasada de auditoría estática. **Nota:** la regla existe en código (`bodyshop.service.ts:212-222`, `appointments.service.ts:185`) y B-4/B-5 de `05-DATABASE-AUDIT.md` confirmaron 0 violaciones en los datos actuales de QAS, pero sin protección a nivel DB (A-4) y sin test automatizado (QA-03) — ver bloqueante P0 #6 en `12-REMEDIATION-PLAN.md`. |
| 5 | Trabajo bodyshop multi-día | ⏸ Pendiente — requiere credenciales de QAS para ejecución E2E en vivo, no se probó en esta pasada de auditoría estática |
| 6 | Proceso paralelo bloqueante | ⏸ Pendiente — requiere credenciales de QAS para ejecución E2E en vivo, no se probó en esta pasada de auditoría estática. **Nota:** el mecanismo MOTHER/PARALLEL (pausa automática) está confirmado presente en código y cubierto por test unitario (`tracking.service.spec.ts:551,582`) — ver `02-FUNCTIONAL-AUDIT.md` y `07-QA-AUDIT.md`. |
| 7 | Atraso | ⏸ Pendiente — requiere credenciales de QAS para ejecución E2E en vivo, no se probó en esta pasada de auditoría estática. **Nota:** el cálculo de `deviationTotal`/`overdueHours`/`isDelayed` está confirmado en código (`tracking.service.ts:832-853`, `bodyshop.service.ts:1211-1248`) — ver `02-FUNCTIONAL-AUDIT.md`. |
| 8 | Adelanto | ⏸ Pendiente — requiere credenciales de QAS para ejecución E2E en vivo, no se probó en esta pasada de auditoría estática |
| 9 | Fecha vencida | ⏸ Pendiente — requiere credenciales de QAS para ejecución E2E en vivo, no se probó en esta pasada de auditoría estática |
| 10 | Usuario sin permiso | ⏸ Pendiente — requiere credenciales de QAS para ejecución E2E en vivo, no se probó en esta pasada de auditoría estática. **Nota:** RBAC confirmado consistente en la mayoría de módulos (`06-SECURITY-AUDIT.md`), con excepciones puntuales conocidas: `budget-appointments` sin `PermissionsGuard` (SEC-03) y acceso cross-taller en `bodyshop` (SEC-04) — ambos P1, ver `12-REMEDIATION-PLAN.md`. |

---

## Resumen del gate

- **Gate de código (build/lint/typecheck/tests unitarios):** mayormente ✅, con 2 excepciones no bloqueantes (lint frontend roto, lint raíz roto).
- **Gate de infraestructura (TLS/SMTP/backup/estado de PROD):** ❌ — 4 de los 9 bloqueantes P0 del plan de remediación viven exactamente acá.
- **Gate de E2E de negocio:** ⏸ completamente pendiente de ejecución en vivo — no ejecutable desde una auditoría estática de código. Recomendación: ejecutar los 10 casos contra QAS **después** de cerrar los P0 de `12-REMEDIATION-PLAN.md`, como último paso antes de dar luz verde definitiva.

Ver `01-EXECUTIVE-SUMMARY.md` para el veredicto global y `12-REMEDIATION-PLAN.md` para el detalle accionable de cada bloqueante.
