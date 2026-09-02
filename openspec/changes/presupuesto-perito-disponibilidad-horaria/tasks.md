# Tasks: Perito hourly availability on budget appointments

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~630 (PR1 ~150, PR2 ~320, PR3 ~160) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (write-path lock) → PR2 (read-path service+endpoint) → PR3 (frontend) |
| Delivery strategy | ask-on-risk (default; confirm with user) |
| Chain strategy | pending — user to pick |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Overlap guard in `create()` | PR1 | `npx jest budget-appointments.service.spec.ts` | N/A — unit-mocked repos, no live DB scenario exists for this service | Revert `create()` diff + spec diff; no schema, no migration |
| 2 | `perito-availability` service + endpoint | PR2 | `npx jest perito-availability.service.spec.ts budget-appointments.controller.guard.spec.ts` | Manual `curl GET /budget-appointments/perito-availability` against QAS with Juan Jose's peritoId | Revert new files + controller/module diff independently of PR1 |
| 3 | Grid component + `nueva-cita` wiring | PR3 | `npm run build -w apps/web` (no FE test harness for this page today) | Manual: open `nueva-cita`, pick date+perito, confirm blocks render and click fills times | Revert new component/hook + page.tsx diff; backend unaffected |

## Phase 1: Write-path overlap guard (PR1, base=main)

- [ ] 1.1 `budget-appointments.service.ts`: hoist `peritoId = dto.peritoId ?? userId` before the transaction; add `timeEnd <= timeStart` precondition (`BadRequestException`) before `dataSource.transaction`.
- [ ] 1.2 `budget-appointments.service.ts`: after the plate check, acquire perito lock `pg_advisory_xact_lock(hashtext('${workshopId}:${date}:${peritoId}'))` — ALWAYS after the plate lock (fixed order = deadlock-freedom) — then overlap query (`workshopId`+`date`+`peritoId`, status NOT IN rejected/cancelled, strict `timeStart < :timeEnd` / `timeEnd > :timeStart`), throw with conflicting appt's time+customer.
- [ ] 1.3 `budget-appointments.service.ts`: `manager.create(...)` insert uses the hoisted `peritoId`, not an inline `dto.peritoId ?? userId`.
- [ ] 1.4 `__tests__/budget-appointments.service.spec.ts`: fix `makeQb`/`createQueryBuilder` mock — `mockReturnValueOnce(plateQb).mockReturnValueOnce(overlapQb)` (create() now calls it twice).
- [ ] 1.5 Add tests: overlap rejected (09-11 vs 10-12); contiguous accepted (09-10 vs 10-11, asserts strict `<`/`>`); cancelled/rejected excluded; `peritoId` defaulting reflected in 2nd lock key; lock-order invariant (plate lock = 1st `manager.query` call, perito lock = 2nd, explicit test not just a comment); `timeEnd<=timeStart` rejected before transaction opens.

## Phase 2: Read-path service + endpoint (PR2, base=main or PR1)

- [ ] 2.1 Create `perito-availability.service.ts`: `getPeritoAvailability(workshopId, workshopName, peritoId, date)` — `techRepo.findOne` (userId/isPerito/active), 403 on `workshopName` mismatch, 404 if not found, absence lookup, booked appts (`Not(In(['rejected','cancelled']))`), `hhmm()` normalizer for Postgres `HH:MM:SS`, `floor(dailyHours)` blocks, `half`-absence = afternoon closed.
- [ ] 2.2 `budget-appointments.controller.ts`: add `@Get('perito-availability')` BEFORE `@Get(':id')` (route-order-critical), `@UseGuards(WorkshopAccessGuard)`, resolve `workshop.name` via injected `WorkshopsService.findOne`, perito self-scoping 403, delegate to service.
- [ ] 2.3 `budget-appointments.module.ts`: `TypeOrmModule.forFeature([..., Technician, TechnicianAbsence])`, import `WorkshopsModule`, register/export `PeritoAvailabilityService`, inject `WorkshopsService` into controller.
- [ ] 2.4 Create `__tests__/perito-availability.service.spec.ts`: free day (8 blocks); full/holiday absence (0 available); half absence (08-11 open, PM `absence`); existing 10-11 booking (only that block `booked`, proves `hhmm()` + strict boundaries); cancelled booking ignored (`Not(In(...))` asserted); cross-workshop perito → 403, no downstream repo calls; unknown perito → 404.
- [ ] 2.5 `__tests__/budget-appointments.controller.guard.spec.ts`: add `describe` for the new route mirroring the existing block (403 cross-workshop, 200 unrestricted), `WorkshopsService` mocked.

## Phase 3: Frontend grid + wiring (PR3, base=main or PR2)

- [ ] 3.1 `apps/web/src/lib/api.ts`: add `getPeritoAvailability(workshopId, peritoId, date)`.
- [ ] 3.2 Create `apps/web/src/hooks/use-perito-availability.ts`: React Query, `enabled: !!workshopId && !!effectivePeritoId && !!date`, `staleTime: 30_000`, invalidate on create-appointment success.
- [ ] 3.3 Create `apps/web/src/components/ui/perito-availability-grid.tsx`: props `{ blocks, absence, isLoading, selectedHour, onSelect(hour) }` — borrow only `AlternativeDatesPanel`'s visual language, NOT its `checkOverlap`/lunch/past-time client logic.
- [ ] 3.4 `nueva-cita/page.tsx`: track `currentUserId` (from `getStoredUser()`), compute `effectivePeritoId` (self by default, admin's `selectedPeritoId` override), wire hook+grid, click on available block fills `timeStart`/`timeEnd` (inputs stay editable/authoritative).

## Phase 4: Documented out-of-scope risks (no code)

- [ ] 4.1 PR2 description note: `create()` still accepts out-of-workday/full-absence times — only overlap is blocked; grid is advisory for those two cases (accepted gap).
- [ ] 4.2 PR2 description note: perito covering two workshops not modeled (lock/query scoped by `workshopId`); accepted residual limitation.
- [ ] 4.3 Before PROD deploy: verify no active perito has `Technician.workshopName IS NULL` (would 403 here). QAS checked clean (Juan Jose, workshopName set) — re-verify PROD data as a pre-deploy step, not a code fix.
