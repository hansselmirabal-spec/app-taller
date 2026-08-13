# 05 — Auditoría de Base de Datos — App Taller (Grupo Cóndor)

**Fecha:** 2026-08-13
**Alcance:** PostgreSQL + TypeORM (NestJS). Migraciones en `apps/api/src/database/migrations/`, entidades en `apps/api/src/modules/**/*.entity.ts`.
**Método:** revisión estática de schema/migraciones (Parte A) + acceso SSH de solo lectura a los contenedores Postgres de QAS (`app-taller-qas-postgres-1`) y PROD (`app-taller-postgres-1`) en `53.103.13.238` (Parte B). Todas las queries ejecutadas fueron `SELECT` / introspección de catálogo (`pg_constraint`, `pg_indexes`, `information_schema`). No se modificó código ni datos.

**Nota de completitud:** la conexión SSH al servidor se cortó a mitad de la Parte B (aparentemente por rate-limiting tras varias sesiones `psql` en paralelo) y no se logró restablecer en esta pasada. Los chequeos ya ejecutados están documentados con su evidencia real. Los que no llegaron a correr están marcados explícitamente como **"NO EJECUTADO en esta pasada"**, con la query exacta lista para reproducir en la próxima sesión.

---

## PARTE A — Revisión estática de schema y migraciones

### Inventario

10 migraciones (`001_fix_schema.sql` … `010_technicians_add_perito_link.ts`) + `synchronize` de TypeORM habilitado solo en `NODE_ENV=development` (`app.module.ts`); QAS/PROD corren con `migrationsRun: true`. 27 entidades, 30 tablas vivas en QAS (una de ellas, `dms_snapshots`, sin entidad TypeORM asociada — ver A-11).

### Hallazgos

**A-1 (P0) — Deriva de schema en PROD: 5 migraciones atrasado respecto a QAS/repo.**
La tabla `migrations` en PROD tiene 5 filas (hasta `RenameDmsOtRowsChasisToPlate1752100000000`, migración 006 del repo); QAS tiene las 10. Faltan en PROD: `007_budget_appointments_add_pieces`, `008_bodyshop_seed_final_control`, `009_budget_appointments_add_insurance_company`, `010_technicians_add_perito_link`. Confirmado a nivel de columnas: `technicians` en PROD no tiene `email`/`is_perito`/`user_id`; `budget_appointments` no tiene `insurance_company`. La imagen `app-taller-api:prod` fue creada 2026-07-15, la de `app-taller-api:qas` 2026-08-06 (~3 semanas de diferencia). Además, `bodyshop_processes` en PROD tiene solo 4 filas (falta `FINAL_CONTROL`, sembrado por la migración 008) y **todas las tablas operativas de PROD están en 0 filas** (`appointments`, `bodyshop_entries`, `tracking_logs`, `technicians`, `workshops`, `users`=1). Esto contradice la premisa de CLAUDE.md ("QAS y PROD desplegados y en uso real") y es un bloqueante para certificar go-live: no está claro si este contenedor es el PROD real en producción activa o una instancia obsoleta/no promovida.

**A-2 (P0) — `tracking_logs` no tiene NINGUNA foreign key.**
Confirmado vía `pg_constraint`: la tabla solo tiene su PK. `source_type`/`source_id` (referencia polimórfica a `appointments` o `bodyshop_entries`) y `technician_id` (referencia a `technicians`) se validan exclusivamente en código de aplicación. No hay protección de integridad referencial real.

**A-3 (P0) — "Un técnico no puede estar en dos procesos in_progress a la vez" es 100% aplicación, con condición de carrera documentada en el propio código.**
`tracking.service.ts::startProcess` hace `SELECT ... WHERE technician_id = X AND status = 'in_progress'` antes de escribir. No existe índice único parcial que lo garantice a nivel DB. El comentario en el código (líneas 154-159 y 318-326) documenta explícitamente que esta regla estuvo rota en QA ("6 vehículos simultáneos al mismo técnico, ninguno rechazado") y que la corrección es solo de aplicación — sigue expuesta a TOCTOU bajo concurrencia real (dos requests simultáneos pueden pasar el SELECT antes de que cualquiera confirme el UPDATE).
Recomendación: `CREATE UNIQUE INDEX ON tracking_logs(technician_id) WHERE status = 'in_progress' AND technician_id IS NOT NULL;`

**A-4 (P1) — "No permitir dos trabajos activos del mismo vehículo" sin protección DB.**
No hay índice único ni exclusion constraint sobre `plate` (+status) en `appointments`, `bodyshop_entries` ni `budget_appointments`. Confirmado vía `pg_indexes`: esas tres tablas solo tienen el índice de PK. Depende 100% de que el código de aplicación lo valide (no se encontró tal validación explícita en `appointments.service.ts` ni `bodyshop.service.ts`).

**A-5 (P1) — Solapamiento de horarios de turnos (`appointments`) solo a nivel aplicación.**
`appointments.service.ts::checkOverlap` es un `SELECT` seguido de `INSERT`/`UPDATE`, sin exclusion constraint (`EXCLUDE USING gist` con `btree_gist`). Vulnerable a doble reserva bajo concurrencia.

**A-6 (P2) — `budget_appointments` (agenda de peritos) no tiene ninguna validación de solapamiento.**
No se encontró chequeo de conflicto de horario para `peritoId` ni en `budget-appointments.service.ts` ni en el schema. Un mismo perito puede quedar doble-agendado sin ningún rechazo.

**A-7 (P2) — Sin índice en `plate` en las tres tablas que lo usan como campo de búsqueda frecuente** (`appointments`, `bodyshop_entries`, `budget_appointments`). Confirmado vía `pg_indexes` en QAS: únicamente existe el índice de PK.

**A-8 (P2) — Ausencia casi total de CHECK constraints.**
En todo el schema solo existe un CHECK (`budget_config.singleton = true`, migración 002). Los campos `status` (enums de TypeScript) y las columnas `decimal` de horas no tienen `CHECK IN (...)` ni `CHECK >= 0` a nivel DB — un bug o un `UPDATE` manual podría insertar un estado inexistente o una hora negativa sin que Postgres lo rechace.

**A-9 (P3) — `bodyshop_work_matrix`: unique constraint con columna nullable puede permitir duplicados "globales".**
`@Unique(['pieceId','processId','gradeId','workshopId'])` con `workshopId` nullable (NULL = override global). Postgres trata cada NULL como distinto a efectos de unicidad, por lo que podrían insertarse múltiples filas globales duplicadas para la misma combinación pieza/proceso/grado sin violar el constraint, generando ambigüedad en la búsqueda de `suggestedHours`.

**A-10 (P3/informativo) — FKs a `technicians` sin `ON DELETE` explícito (default RESTRICT).**
Consistente con el patrón de soft-delete (`technician.active`), pero implica que un DELETE físico de técnico con historial fallará siempre — comportamiento probablemente intencional, documentado acá para que quede explícito.

**A-11 (informativo) — Tabla `dms_snapshots` viva en QAS y PROD sin entidad TypeORM asociada** (0 filas en ambas). Deriva de schema / tabla huérfana, bajo riesgo pero vale limpieza.

**A-12 (informativo) — `synchronize` correctamente deshabilitado fuera de development**, `migrationsRun: true` en QAS/PROD — el patrón es correcto; A-1 muestra que igual hubo deriva, probablemente por falta de redeploy de PROD, no por falla del migration runner (fuera del alcance de esta auditoría de datos confirmarlo con certeza).

---

## PARTE B — Integridad de datos en vivo (SOLO LECTURA)

Ejecutado contra **QAS** (`app_taller_qas`, único ambiente con datos operativos reales — PROD está en 0 filas, ver A-1). Credenciales obtenidas vía `docker inspect ... POSTGRES_USER/DB/PASSWORD`, queries vía `docker exec app-taller-qas-postgres-1 psql -U taller_qas_user -d app_taller_qas -c "<SELECT>"`.

### Chequeos ejecutados

**B-1. Constraints reales en tablas clave** (`pg_constraint`):
```sql
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text IN ('tracking_logs','appointments','bodyshop_entries',
    'bodyshop_entry_process_slots','bodyshop_process_techs','technicians');
```
Resultado: confirma A-2 (tracking_logs sin FK) y A-3/A-4/A-5 (sin unique/exclusion constraints de negocio). 16 constraints totales, todas PK/FK simples + 1 UNIQUE(`entry_id`,`process`) en `bodyshop_process_techs`.

**B-2. Índices en tablas de alta escritura** (`pg_indexes` sobre `appointments`, `bodyshop_entries`, `budget_appointments`, `tracking_logs`):
Resultado: confirma A-7 — solo índices de PK en las tres primeras; `tracking_logs` tiene índices en `status` y `(source_type, source_id)` pero ninguno en `technician_id`.

**B-3. Distribución de estados por tabla:**
```sql
SELECT 'appointments' t, status, count(*) FROM appointments GROUP BY status
UNION ALL SELECT 'bodyshop_entries', status, count(*) FROM bodyshop_entries GROUP BY status
UNION ALL SELECT 'tracking_logs', status, count(*) FROM tracking_logs GROUP BY status
ORDER BY 1,2;
```
Resultado: `appointments` (in_progress=1, scheduled=1), `bodyshop_entries` (in_progress=3, paused=1, scheduled=20), `tracking_logs` (blocked=1, completed=60, in_progress=17, pending=40). Volumen bajo — dataset de prueba, no representativo de carga productiva.

**B-4. Mismo `plate` con más de un trabajo activo simultáneo (appointments):**
```sql
SELECT plate, count(*) FROM appointments WHERE status NOT IN ('done','cancelled')
GROUP BY plate HAVING count(*) > 1;
```
**Resultado: 0 filas.**

**B-5. Mismo `plate` con más de un ingreso bodyshop activo simultáneo:**
```sql
SELECT plate, count(*) FROM bodyshop_entries WHERE status NOT IN ('done','cancelled')
GROUP BY plate HAVING count(*) > 1;
```
**Resultado: 0 filas.**

**B-6. Comparación de migraciones aplicadas PROD vs QAS** (`SELECT id, name, timestamp FROM migrations ORDER BY id`): ver evidencia completa en A-1.

**B-7. Conteo de filas por tabla en PROD** (`pg_stat_user_tables.n_live_tup`): ver evidencia completa en A-1 (todas las tablas operativas en 0, solo catálogos/seeds con datos).

**B-8. Columnas reales de `budget_appointments` y `technicians` en PROD** (`\d <tabla>`): confirma ausencia de `insurance_company`, `email`, `is_perito`, `user_id` — ver A-1.

### Chequeos NO EJECUTADOS en esta pasada (conexión SSH caída antes de correrlos)

La conexión se cortó (rate-limit/firewall tras las consultas en paralelo) y no se recuperó dentro de esta sesión. Quedan pendientes para la próxima pasada, con la query exacta lista para reproducir:

**B-9. Mismo plate activo cruzando appointments + bodyshop_entries a la vez:**
```sql
SELECT plate, count(*) FROM (
  SELECT plate FROM appointments WHERE status NOT IN ('done','cancelled')
  UNION ALL
  SELECT plate FROM bodyshop_entries WHERE status NOT IN ('done','cancelled')
) x GROUP BY plate HAVING count(*) > 1;
```

**B-10. Appointments/entries sin tracking_log que debería existir** (activos, no cancelados, sin fila en tracking_logs):
```sql
SELECT a.id, a.plate FROM appointments a
WHERE a.status NOT IN ('cancelled')
  AND NOT EXISTS (SELECT 1 FROM tracking_logs tl WHERE tl.source_type='mechanic' AND tl.source_id = a.id::text);

SELECT e.id, e.plate FROM bodyshop_entries e
WHERE e.status NOT IN ('cancelled')
  AND NOT EXISTS (SELECT 1 FROM tracking_logs tl WHERE tl.source_type='bodyshop' AND tl.source_id = e.id::text);
```
(Nota: el kanban inicializa logs de forma perezosa en `getBoard()`, así que filas aquí no son necesariamente un bug — pueden ser trabajos nunca vistos en el tablero. Igual vale cuantificarlo.)

**B-11. tracking_logs sin appointment/entry padre válido (FK rota, dado que no existe FK real — A-2):**
```sql
SELECT tl.id, tl.source_type, tl.source_id FROM tracking_logs tl
WHERE tl.source_type = 'mechanic'
  AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id::text = tl.source_id);

SELECT tl.id, tl.source_type, tl.source_id FROM tracking_logs tl
WHERE tl.source_type = 'bodyshop'
  AND NOT EXISTS (SELECT 1 FROM bodyshop_entries e WHERE e.id::text = tl.source_id);
```

**B-12. `tracking_logs.technician_id` apuntando a técnicos inactivos o inexistentes** (columna sin FK real — A-2):
```sql
SELECT tl.id, tl.technician_id, tl.technician_name FROM tracking_logs tl
WHERE tl.technician_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM technicians t WHERE t.id::text = tl.technician_id AND t.active);
```

**B-13. Horarios de citas superpuestos para el mismo técnico:**
```sql
SELECT a1.id, a2.id, a1.technician_id, a1.date FROM appointments a1
JOIN appointments a2 ON a1.technician_id = a2.technician_id AND a1.date = a2.date AND a1.id < a2.id
WHERE a1.status != 'cancelled' AND a2.status != 'cancelled'
  AND a1.time_start < a2.time_end AND a1.time_end > a2.time_start;
```

**B-14. Horas planificadas negativas o excesivas:**
```sql
SELECT id, source_type, source_id, process_code, planned_hours FROM tracking_logs
WHERE planned_hours < 0 OR planned_hours > 24;
```

**B-15. Estados imposibles** (completed sin completedAt/startedAt; in_progress sin startedAt):
```sql
SELECT id, status, started_at, completed_at FROM tracking_logs
WHERE (status = 'completed' AND (completed_at IS NULL OR started_at IS NULL))
   OR (status = 'in_progress' AND started_at IS NULL);
```

**B-16. Duplicados exactos: mismo source_id+process_code con múltiples logs activos (no completed/skipped):**
```sql
SELECT source_id, process_code, count(*) FROM tracking_logs
WHERE status NOT IN ('completed','skipped')
GROUP BY source_id, process_code HAVING count(*) > 1;
```

---

## Tabla de hallazgos

| ID | Módulo | Descripción | Evidencia | Cómo reproducir | Impacto | Severidad | Recomendación | Esfuerzo | Bloquea prod |
|---|---|---|---|---|---|---|---|---|---|
| A-1 | Infra/DB | PROD 5 migraciones atrasado, 0 filas operativas, imagen 3 semanas más vieja que QAS | Ver B-6/B-7/B-8 | `SELECT * FROM migrations` en ambos contenedores + `\d technicians` | Estado de PROD incierto para el go-live; posibles fallas de columna faltante si se promueve código nuevo sin migrar | **P0** | Correr migraciones pendientes en PROD y confirmar con el equipo si este contenedor es el PROD real en uso | S | Sí |
| A-2 | tracking | `tracking_logs` sin ninguna FK (source polimórfico + technician_id) | `pg_constraint` → 0 FKs | Query B-1 | Datos huérfanos posibles sin que Postgres lo detecte | **P0** | Agregar FK a `technicians(id)`; validar `source_id` en app (polimórfico no soporta FK directa, documentar la limitación) | M | Sí |
| A-3 | tracking | Regla "1 técnico = 1 in_progress" solo en app, con TOCTOU documentado en el propio código y bug ya visto en QA | `startProcess()` líneas 313-346 | Código + comentario inline | Doble asignación de técnico bajo concurrencia real (KPIs de productividad corruptos) | **P0** | Índice único parcial `WHERE status='in_progress'` | S | Sí |
| A-4 | appointments/bodyshop | Sin protección DB para "1 vehículo = 1 trabajo activo" | `pg_indexes` → solo PK en `plate` | Query B-2 + B-4/B-5 (0 violaciones hoy, pero sin barrera) | Vehículo podría quedar en dos flujos activos a la vez sin rechazo | **P1** | Índice único parcial sobre `plate` + status activo, o constraint a nivel app con lock | M | Condicional |
| A-5 | appointments | Solapamiento de turnos de técnico solo en app (`checkOverlap`) | `appointments.service.ts:290-308` | Código | Doble reserva bajo carga concurrente | **P1** | Exclusion constraint (`btree_gist`) sobre (technician_id, date, [time_start,time_end)) | M | Condicional |
| A-6 | budget-appointments | Sin ninguna validación de solapamiento de horario de perito | Búsqueda en `budget-appointments.service.ts` sin match | grep del servicio | Perito doble-agendado | **P2** | Agregar `checkOverlap` equivalente + índice/constraint | S | No |
| A-7 | appointments/bodyshop/budget | Sin índice en `plate` | `pg_indexes` QAS | Query B-2 | Búsquedas por matrícula (lookup de vehículo, duplicados) hacen seq scan | **P2** | `CREATE INDEX ON <tabla>(plate)` | S | No |
| A-8 | schema global | Solo 1 CHECK constraint en todo el schema | grep de migraciones/entidades | Búsqueda `@Check`/`CHECK` | Estados/horas inválidas posibles vía bug o acceso directo | **P2** | CHECK constraints para status enums y horas >= 0 | M | No |
| A-9 | bodyshop_work_matrix | Unique constraint con columna nullable permite duplicados "globales" | Definición de entidad + semántica NULL en Postgres | Insertar 2 filas globales iguales | Ambigüedad en horas sugeridas del catálogo | **P3** | Unique index parcial con `COALESCE(workshop_id,'')` o `WHERE workshop_id IS NULL` | S | No |
| A-11 | dms_snapshots | Tabla huérfana sin entidad, 0 filas en ambos ambientes | `pg_tables` QAS/PROD | `\dt` | Ninguno (deuda técnica menor) | **P3** | Confirmar si se puede dropear | S | No |

---

## Resumen de completitud

- **Parte A:** completa — 10 migraciones y 27 entidades revisadas en su totalidad.
- **Parte B:** parcialmente ejecutada. Completados: B-1 a B-8 (constraints, índices, distribución de estados, duplicados de plate en cada tabla por separado, comparación de migraciones PROD/QAS, conteo de filas y columnas reales en PROD). **No ejecutados** por corte de conectividad SSH: B-9 a B-16 (plate cruzado entre flujos, huérfanos tracking_logs↔padre, técnico inactivo en tracking_logs, solapamiento real de horarios, horas negativas/excesivas, estados imposibles, duplicados activos por source+proceso). Las queries quedan listas para correr en la próxima sesión.

## Score — Base de Datos: **48/100**

## Veredicto: **NO-GO**

**Razón principal:** el estado real de PROD es la señal más grave — 5 migraciones atrasado, 0 filas en todas las tablas operativas, e imagen ~3 semanas más vieja que QAS, lo cual contradice la premisa de "producción activa" del proyecto y no permite certificar que el ambiente productivo esté en condiciones de recibir tráfico real con el schema actual (A-1). A esto se suma que dos reglas de negocio críticas para la operación del taller —"un técnico no puede estar en dos procesos a la vez" y la ausencia total de FKs en `tracking_logs`— dependen 100% de código de aplicación, con una condición de carrera ya confirmada por el propio equipo en QA (A-2, A-3). Antes de dar luz verde hay que: (1) aclarar y resolver el estado de PROD, (2) blindar A-3 con un índice único parcial, y (3) completar los chequeos B-9 a B-16 pendientes por el corte de conectividad.
