# Tasks: Close remaining cross-workshop exposure on 3 unguarded endpoints

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180-220 (2 decorators ~3, controller+service ~45, frontend ~2, 2 new spec files ~90, 1 extended spec ~35) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (not needed — risk is Low) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | All 3 endpoints guarded + tests | PR 1 (single) | `npx jest __tests__/bodyshop-tech-availability.controller.guard.spec.ts __tests__/bodyshop-schedule.controller.guard.spec.ts __tests__/technicians.controller.guard.spec.ts --runInBand` (apps/api) | N/A — pure unit/HTTP-supertest specs, no live server/DB needed | `git revert` the single commit; each of the 3 endpoint fixes is decorator/authz-only, no schema/migration |

## Phase 1: Slice 1 — decorator fixes (bodyshop)

- [x] 1.1 `bodyshop.controller.ts:108` — add `@UseGuards(WorkshopAccessGuard)` above `getTechAvailability`. Import already present (line 12).
- [x] 1.2 `bodyshop-schedule.controller.ts` — add `import { WorkshopAccessGuard } from '../../common/guards/workshop-access.guard';`; add `@UseGuards(WorkshopAccessGuard)` above `simulate` (line 14).

## Phase 2: Slice 2 — technicians name authorization + frontend

- [x] 2.1 `technicians.controller.ts` — add `import { CurrentUser } from '../../common/decorators/current-user.decorator';`, `import type { UserAccessContext } from '../users/users.service';`, `import { isUnrestrictedWorkshopAccess } from '../../common/guards/workshop-access.util';`.
- [x] 2.2 `technicians.controller.ts:findAll` — add `@CurrentUser() user: UserAccessContext` as the **first** param (before the optional `@Query` params, per TS param-ordering rule).
- [x] 2.3 `technicians.controller.ts` — rewrite `resolveWorkshopName`: if `workshopName`, call new `assertWorkshopNameAllowed(workshopName, user)` then return it (even with `workshopId` present); else if `workshopId`, call `this.workshopsService.findOne(workshopId, user)` and return `.name`.
- [x] 2.4 `technicians.controller.ts` — add private `assertWorkshopNameAllowed(name, user)`: no-op if `isUnrestrictedWorkshopAccess(user)`; else fetch `findAll(user)`, throw `ForbiddenException('No tenés acceso a este taller')` if no entry matches `name`.
- [x] 2.5 `apps/web/src/lib/api.ts:165-168` — in `getTechnicians`, add `if (workshopId) params.set('workshopId', workshopId);`.
- [x] 2.6 `workshops.service.ts:47-54` — drop `bodyshop.controller.ts`, `bodyshop-schedule.controller.ts`, `technicians.controller.ts` from the pending-debt comment's "NO lo están" list.

## Phase 3: Testing

- [x] 3.1 Create `bodyshop-tech-availability.controller.guard.spec.ts` (`buildGuardTestApp(BodyshopController, ...)`): restricted user + disallowed `workshopId` → 403; admin → 200.
- [x] 3.2 Create `bodyshop-schedule.controller.guard.spec.ts` (`buildGuardTestApp(BodyshopScheduleController, ...)`): restricted user, disallowed `workshopId` in POST body → 403; admin → 200.
- [x] 3.3 Extend `technicians.controller.guard.spec.ts`: add `findAll` mock to `WorkshopsService`.
- [x] 3.4 Add case: restricted user queries disallowed `workshopName` → 403.
- [x] 3.5 Add case: allowed `workshopId` + disallowed `workshopName` together → 403 (name precedence).
- [x] 3.6 Add case: admin queries by `workshopName` → 200.
- [x] 3.7 Confirm `workshop-access.guard.spec.ts` fail-open regression test still passes unmodified.

## Phase 4: Verification

- [x] 4.1 Grep `apps/web/src` for other `getTechnicians(` callers besides `use-technicians.ts:11` — confirm none broke by the added `workshopId` param.
- [x] 4.2 Run full `apps/api` test suite once to confirm no other guard/spec regressed.
