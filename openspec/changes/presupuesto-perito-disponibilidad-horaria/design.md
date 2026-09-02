# Design: Perito hourly availability on budget appointments

Engram mirror: `sdd/presupuesto-perito-disponibilidad-horaria/design`

## Technical Approach

Two independent server-side surfaces, no schema change:

1. **Write path** — a second range check inside the existing `create()` transaction of
   `budget-appointments.service.ts`, guarded by a second `pg_advisory_xact_lock`.
2. **Read path** — a new `PeritoAvailabilityService` + `GET /budget-appointments/perito-availability`
   that composes `Technician.dailyHours` + `TechnicianAbsence` + booked `BudgetAppointment`
   into 1-hour blocks. The UI renders that array; it computes nothing.

The two paths are deliberately not shared code: the write path must run against the
transaction `manager` with a narrow single-row `getOne()`, the read path is a
non-transactional projection over three tables.

## Architecture Decisions

### Decision: Second advisory lock, acquired after the plate lock

**Choice**: `pg_advisory_xact_lock(hashtext('{workshopId}:{date}:{peritoId}'))`, always acquired
*after* the existing plate lock, both inside the same `dataSource.transaction`.
**Alternatives**: `EXCLUDE USING gist` + `btree_gist` (rejected in proposal); one combined lock key;
lock acquired before the plate lock.
**Rationale**: A fixed global acquisition order (plate → perito) makes deadlock between two
concurrent creates impossible. A combined key would not serialize two different plates booking
the same perito. Keeping plate-first preserves the existing error message precedence and the
existing tests verbatim.

### Decision: Overlap query scoped by `workshopId`

**Choice**: The range query filters `workshopId` as well as `peritoId` + `date`, matching the
lock key from the closed decision.
**Alternatives**: Global per-perito scoping (a perito physically cannot be in two workshops).
**Rationale**: Lock key and query predicate must cover the same rows or the lock is decorative.
Peritos are workshop-scoped via `Technician.workshopName`, so cross-workshop double-booking is
not a modeled case. Recorded as an accepted residual limitation, not an oversight.

### Decision: Separate `perito-availability.service.ts`

**Choice**: New service in the same module, not a method on `BudgetAppointmentsService`.
**Alternatives**: Add the method to `BudgetAppointmentsService`.
**Rationale**: The computation needs two repositories (`Technician`, `TechnicianAbsence`) that no
other method in `BudgetAppointmentsService` touches — adding them widens the constructor of the
booking/approval service for one read. A separate provider keeps the injection surface honest and
gets its own spec file.

### Decision: Blocks are always emitted, availability carries a reason

**Choice**: Emit `dailyHours` blocks always; unavailable ones carry `reason: 'booked' | 'absence'`.
**Alternatives**: Return only available blocks (empty array on a full absence).
**Rationale**: An empty grid is indistinguishable from a loading/error state. The reason lets the
UI explain *why* a block is dead without a second request.

### Decision: `Technician` ↔ perito join and workshop scoping

**Choice**: `technicianRepo.findOne({ where: { userId: peritoId, isPerito: true, active: true } })`,
then reject unless `technician.workshopName === workshop.name`, where `workshop.name` comes from
`WorkshopsService.findOne(workshopId, user)`.
**Alternatives**: Scope by `workshopId` (the column does not exist on `Technician`); skip the check
and rely on `WorkshopAccessGuard` alone.
**Rationale**: `Technician` is workshop-scoped by **name**, exactly as `technicians.controller.ts`
`resolveWorkshopName()` already handles. `WorkshopAccessGuard` only validates the *requested*
`workshopId`, never the perito — without the name equality check, a user scoped to workshop A could
read a workshop-B perito's absences, which the spec forbids (403).

## Data Flow

    nueva-cita (date + effective peritoId)
        │  GET /budget-appointments/perito-availability
        ▼
    JwtAuthGuard → WorkshopAccessGuard → controller (perito self-scoping)
        │  workshopId → WorkshopsService.findOne(user) → workshop.name
        ▼
    PeritoAvailabilityService
        ├── Technician        (userId = peritoId, isPerito, active, workshopName)
        ├── TechnicianAbsence (technicianId, date)
        └── BudgetAppointment (workshopId, peritoId, date, status active)
        ▼
    AvailabilityBlock[]  ──→  grid; click fills timeStart/timeEnd

    POST /budget-appointments
        └── transaction: lock(plate) → lock(perito) → plate check → overlap check → insert

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/modules/budget-appointments/budget-appointments.service.ts` | Modify | Perito lock + overlap check in `create()`; hoist `peritoId`; `timeEnd > timeStart` precondition |
| `apps/api/src/modules/budget-appointments/perito-availability.service.ts` | Create | Availability computation |
| `apps/api/src/modules/budget-appointments/budget-appointments.controller.ts` | Modify | `GET perito-availability`, declared **before** `@Get(':id')` |
| `apps/api/src/modules/budget-appointments/budget-appointments.module.ts` | Modify | `forFeature([BudgetAppointment, Technician, TechnicianAbsence])`, `WorkshopsModule`, new provider |
| `apps/web/src/lib/api.ts` | Modify | `getPeritoAvailability()` |
| `apps/web/src/hooks/use-perito-availability.ts` | Create | `usePeritoAvailability(workshopId, peritoId, date)` |
| `apps/web/src/components/ui/perito-availability-grid.tsx` | Create | 1h block grid |
| `apps/web/src/app/(dashboard)/presupuesto/nueva-cita/page.tsx` | Modify | Track `currentUserId`, render grid, click → time inputs |
| `apps/api/src/__tests__/perito-availability.service.spec.ts` | Create | Availability unit tests |
| `apps/api/src/__tests__/budget-appointments.service.spec.ts` | Modify | Overlap tests appended |
| `apps/api/src/__tests__/budget-appointments.controller.guard.spec.ts` | Modify | Guard test for the new route |

## Interfaces / Contracts

### 1. Overlap block in `create()`

Insert **after** the existing plate check, inside the same transaction. Helper at module scope:
`const hhmm = (t: string) => t.slice(0, 5);` (Postgres `time` returns `HH:MM:SS`).

```ts
async create(dto: CreateBudgetAppointmentDto, userId: string): Promise<BudgetAppointment> {
  const plate    = dto.plate.toUpperCase().trim();
  const peritoId = dto.peritoId ?? userId;          // hoisted: needed by the lock key
  if (dto.timeEnd <= dto.timeStart) {
    throw new BadRequestException('La hora de fin debe ser posterior a la hora de inicio.');
  }
  // ... dataSource.transaction(async manager => {
  //   lock #1 (existing, unchanged): `${workshopId}:${date}:${timeStart}:${plate}`
  //   ... existing plate check, unchanged ...

  // lock #2 — SIEMPRE después del lock de patente. El orden global fijo de
  // adquisición es lo que hace imposible el deadlock entre dos create()
  // concurrentes; no invertirlo.
  await manager.query(
    'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
    [`${dto.workshopId}:${dto.date}:${peritoId}`],
  );

  const overlapping = await manager.createQueryBuilder(BudgetAppointment, 'b')
    .where('b.workshopId = :wsId', { wsId: dto.workshopId })
    .andWhere('b.date = :date', { date: dto.date })
    .andWhere('b.peritoId = :peritoId', { peritoId })
    .andWhere('b.status NOT IN (:...statuses)', { statuses: ['rejected', 'cancelled'] })
    // Rangos que se tocan en el borde (10:00 fin / 10:00 inicio) NO solapan:
    // por eso son `<` y `>` estrictos, nunca `<=` / `>=`.
    .andWhere('b.timeStart < :timeEnd', { timeEnd: dto.timeEnd })
    .andWhere('b.timeEnd > :timeStart', { timeStart: dto.timeStart })
    .getOne();

  if (overlapping) {
    throw new BadRequestException(
      `El perito ya tiene una cita de ${hhmm(overlapping.timeStart)} a ${hhmm(overlapping.timeEnd)} ` +
      `ese día (${overlapping.customerName}). Elegí un bloque libre.`,
    );
  }
  // ... manager.create(BudgetAppointment, { ..., peritoId, ... })
}
```

`peritoId` in the insert payload now reads the hoisted constant instead of
`dto.peritoId ?? userId`, so the locked key and the stored row can never diverge.

### 2. Endpoint

`GET /budget-appointments/perito-availability?workshopId=&date=&peritoId=`

- `peritoId` optional; defaults to the caller (`user.id`) — the perito self-service case.
- Guards: `JwtAuthGuard` (controller-level → 401) + `@UseGuards(WorkshopAccessGuard)` (→ 403 on a
  workshop the caller cannot access) + in-handler perito self-scoping + `workshopName` equality in
  the service (→ 403 on a cross-workshop perito).
- **No `RolesGuard`**: admin, receptionist and perito all legitimately call this. A role allowlist
  would break perito self-service without adding containment beyond the three checks above.
- Route MUST be declared above `@Get(':id')` or Nest resolves `id = 'perito-availability'`.

```ts
@Get('perito-availability')
@UseGuards(WorkshopAccessGuard)
async peritoAvailability(
  @Query('workshopId') workshopId: string,
  @Query('date') date: string,
  @Query('peritoId') peritoId: string | undefined,
  @CurrentUser() user: any,
) {
  if (!workshopId) throw new BadRequestException('workshopId es requerido');
  if (!date || !DATE_RE.test(date)) throw new BadRequestException('Formato de fecha inválido (YYYY-MM-DD)');
  const targetPeritoId = peritoId || user.id;
  // Mismo scoping de rol que findByDate/findByRange: un perito nunca lee la agenda de otro.
  if (user.role === 'perito' && targetPeritoId !== user.id) {
    throw new ForbiddenException('Solo podés consultar tu propia disponibilidad');
  }
  const ws = await this.workshopsService.findOne(workshopId, user); // resuelve y autoriza el nombre
  return wrap(await this.availability.getPeritoAvailability(workshopId, ws.name, targetPeritoId, date));
}
```

Response (inside the standard `{ data, meta }` wrapper):

```ts
export interface AvailabilityBlock {
  hour: string;                                  // 'HH:00', bloque de 1h [hour, hour+1h)
  available: boolean;
  reason: 'booked' | 'absence' | null;           // null cuando available === true
}
export interface PeritoAvailability {
  peritoId: string;
  date: string;                                  // YYYY-MM-DD
  dailyHours: number;                            // Technician.dailyHours crudo (puede ser 8.5)
  absence: 'full' | 'half' | 'holiday' | null;
  blocks: AvailabilityBlock[];                   // 08:00 … 08:00 + floor(dailyHours)
}
```

### 3. `PeritoAvailabilityService.getPeritoAvailability()`

```ts
const DAY_START_HOUR = 8;   // mismo 08:00 hardcodeado del resto del repo; unificarlo es out of scope

async getPeritoAvailability(
  workshopId: string, workshopName: string, peritoId: string, date: string,
): Promise<PeritoAvailability> {
  const tech = await this.techRepo.findOne({
    where: { userId: peritoId, isPerito: true, active: true },
  });
  if (!tech) throw new NotFoundException('Perito no encontrado');
  if (tech.workshopName !== workshopName) {
    throw new ForbiddenException('No tenés acceso a este perito');
  }

  const absence = await this.absenceRepo.findOne({ where: { technicianId: tech.id, date } });
  const booked  = await this.apptRepo.find({
    where: { workshopId, peritoId, date, status: Not(In(['rejected', 'cancelled'])) },
  });

  const dailyHours  = Number(tech.dailyHours);
  const totalBlocks = Math.floor(dailyHours);          // 8.5h → 8 bloques enteros
  // Convención de producto: 'half' = SIEMPRE tarde libre-de-trabajo. TechnicianAbsence
  // no guarda rango horario, así que no hay forma de derivarlo; ver proposal.
  const openBlocks =
    absence?.type === 'full' || absence?.type === 'holiday' ? 0
    : absence?.type === 'half' ? Math.floor(dailyHours / 2)
    : totalBlocks;

  const blocks: AvailabilityBlock[] = [];
  for (let i = 0; i < totalBlocks; i++) {
    const hour = `${String(DAY_START_HOUR + i).padStart(2, '0')}:00`;
    const next = `${String(DAY_START_HOUR + i + 1).padStart(2, '0')}:00`;
    if (i >= openBlocks) { blocks.push({ hour, available: false, reason: 'absence' }); continue; }
    // hhmm(): las columnas `time` de Postgres vuelven 'HH:MM:SS'; comparar sin
    // normalizar rompe el orden lexicográfico contra 'HH:MM'.
    const clash = booked.some(b => hhmm(b.timeStart) < next && hhmm(b.timeEnd) > hour);
    blocks.push({ hour, available: !clash, reason: clash ? 'booked' : null });
  }

  return { peritoId, date, dailyHours, absence: absence?.type ?? null, blocks };
}
```

### 4. Frontend

**Trigger**: `usePeritoAvailability(workshopId, effectivePeritoId, date)`, a React Query hook with
`enabled: !!workshopId && !!effectivePeritoId && !!date` and `staleTime: 30_000`, matching
`use-budget-appointments.ts`. `effectivePeritoId = isAdmin && selectedPeritoId ? selectedPeritoId : currentUserId`.
`currentUserId` is new state, read from the existing `getStoredUser()` effect (today only `role` and
`name` are kept). The query key includes `effectivePeritoId`, so an admin switching perito refetches
with no extra wiring. Invalidate on `useCreateBudgetAppointment` success.

**Component**: new `perito-availability-grid.tsx`, **not** a reuse of `AlternativeDatesPanel`.
That panel models multi-day alternatives with 30-min slots and client-side conflict logic
(`checkOverlap`, lunch break, past-time filtering) — none of which applies here, since these are
1h blocks for a single day already resolved server-side. Only the visual language (compact button
grid, green available / grey unavailable) is borrowed. Props:
`{ blocks, absence, isLoading, selectedHour, onSelect(hour) }`.

**Interaction**: clicking an available block sets `timeStart = hour` and `timeEnd = hour + 1h`; the
existing `timeStart`/`timeEnd` inputs stay editable and remain the submitted source of truth, since
real appointments are sometimes 30 min or 2 h and the grid only covers whole hours. The block whose
range contains the current `timeStart` is highlighted. Unavailable blocks are `disabled`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `getPeritoAvailability` | New `perito-availability.service.spec.ts`, plain mocked repos (no Nest DI), following `budget-appointments.service.spec.ts` |
| Unit | `create()` overlap | Append a `describe` to `budget-appointments.service.spec.ts`, reusing `makeDataSource`/`makeQb` |
| Integration | Route guard | Append to `budget-appointments.controller.guard.spec.ts` via `buildGuardTestApp` + supertest |
| E2E | — | None; the repo has no E2E harness for this surface |

`makeQb` currently returns one shared query-builder mock. The overlap tests need `createQueryBuilder`
to answer **twice** per `create()` (plate, then overlap), so the spec helper must be extended with
`mockReturnValueOnce(plateQb).mockReturnValueOnce(overlapQb)` — this is the only test-infra change.

**`perito-availability.service.spec.ts`**

1. Full free workday — `dailyHours: 8`, no absence, no bookings → 8 blocks `08:00`…`15:00`, all
   `available: true`, all `reason: null`.
2. `full` absence → 8 blocks, all `available: false`, all `reason: 'absence'`.
3. `half` absence → `08:00`–`11:00` available (4 blocks), `12:00`–`15:00` unavailable with
   `reason: 'absence'`.
4. Existing `10:00:00`–`11:00:00` `pending` booking → only the `10:00` block is
   `available: false, reason: 'booked'`; the other 7 stay available (proves the `HH:MM:SS`
   normalization and the strict-boundary comparison).
5. Existing `10:00`–`11:00` booking with `status: 'cancelled'` → every block available. Asserted at
   the repo level: the `find` call must carry a `Not(In([...]))` status filter.
6. Cross-workshop perito (`tech.workshopName !== workshopName`) → `ForbiddenException`, and no
   absence/appointment repo call is made.
7. Unknown / non-perito `peritoId` → `NotFoundException`.

**`budget-appointments.service.spec.ts` — `create()` overlap**

1. Overlapping (existing `09:00`–`11:00`, new `10:00`–`12:00`) → rejects with
   `BadRequestException`, message matches `/09:00.*11:00/`, `repo.save` not called.
2. Contiguous (existing `09:00`–`10:00`, new `10:00`–`11:00`) → the overlap query returns `null`;
   the appointment is created. Assert the query was built with `b.timeStart < :timeEnd` /
   `b.timeEnd > :timeStart` (strict), not `<=` / `>=`.
3. Existing cancelled appointment at the same range → created; assert the `status NOT IN` predicate
   was applied with `['rejected', 'cancelled']`.
4. `peritoId` defaulting: with `dto.peritoId` absent, the perito advisory-lock key must contain
   `userId` — asserted on the second `manager.query` call.
5. Lock ordering: the plate lock key is the first `manager.query` argument and the perito lock key
   the second (deadlock-freedom invariant).
6. `timeEnd <= timeStart` → `BadRequestException` before any transaction is opened.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. The change's only security surface is HTTP authorization, covered by
the guard tests above and by the spec's "Availability endpoint access control" requirement.

## Migration / Rollout

No migration required. No schema change, no backfill, no feature flag. Pre-existing overlapping
rows are untouched and will simply render as multiple `booked` blocks. Rollback = revert the commit.

## Open Questions

- [ ] `create()` still accepts a time outside the workday or on a full-absence day (only overlap is
      blocked, per the proposal's scope). Accepted gap: the grid is advisory for those two cases.
      Promote to a hard block only if it is observed in production.
- [ ] Peritos whose `Technician.workshopName` is `null` will get a 403 from the workshop-name
      equality check. Verify no active perito is in that state before deploying, or the endpoint
      silently degrades for them.
