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

**Post-review fixes (before merge)**: full 4R came back with 0 CRITICAL, 1 WARNING (risk, pre-existing/out-of-scope — see follow-up below), 2 WARNING (readability + reliability, both fixed), 2 WARNING (reliability, test-coverage gaps, both fixed), 1 SUGGESTION each (resilience, readability — left as-is, not load-bearing today). Fixed directly:
- `resolveWorkshopName`/`assertWorkshopNameAllowed` had no comment explaining they're the *actual* authorization boundary for `workshopName` (the guard never inspects it) — added, so a future refactor can't silently reopen the gap this change closes.
- `workshops.service.ts:47-50`'s comment on `findOne()` still claimed only `GET /workshops/:id` passes `user`, contradicting the code this same diff added (`technicians.controller.ts` now passes `user` too) — corrected.
- No frontend regression test existed for the `getTechnicians()` `workshopId` fix — added 2 cases to `apps/web/src/__tests__/api-http.spec.ts`.
- `assertWorkshopNameAllowed`'s admin-bypass branch was only tested for `role: 'admin'`, never `admin_taller` (both are treated as unrestricted by `isUnrestrictedWorkshopAccess`) — added the missing case.

**Follow-up (real gap, out of scope for this change — risk lens finding, causal_disposition: pre-existing)**: `GET /technicians` called with **no** `workshopId` and **no** `workshopName` bypasses both `WorkshopAccessGuard`'s fail-open and `assertWorkshopNameAllowed` (which only runs when a name is present) — `TechniciansService.findAll(undefined)`/`findAllIncludingInactive(undefined)` return **every** technician across **every** workshop, including inactive ones, to any authenticated user regardless of `allowedWorkshopIds`. This is broader than the 3 endpoints this change was scoped to close and needs its own change — the fix likely means `findAll` defaulting to the caller's allowed-workshop set instead of "everything" when no explicit scope is given, but that's a real design decision (does the technicians list screen currently rely on the unscoped call anywhere?) that needs its own explore/propose cycle, not a quick patch here.
