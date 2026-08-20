# Tasks: Per-user workshop access control

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~180 · PR2 ~150 · PR3 ~80 |
| 400-line budget risk | Low (each PR well under budget) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (hydration + fail-closed + bypass + log + normalize) → PR 2 (guard rollout, 6 controllers) → PR 3 (`GET /workshops` scoping) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

Already resolved by design (not reopened): 3-PR split, stacked-to-main, per-PR line estimates, PR2/PR3 both depend on PR1 merged.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Fresh per-request hydration + fail-closed + `admin_taller` bypass + denial log + `[]`→`null` normalize | PR 1 | `cd apps/api && pnpm test -- jwt.strategy.spec workshop-access.guard.spec users.service.spec` | N/A — auth strategy has no e2e/supertest harness in repo; covered at unit layer (mocked `UsersService`/repo) | `jwt.strategy.ts`, `workshop-access.guard.ts`, `users.service.ts` normalize lines — revert restores guard to no-op default-allow, no data migration to undo |
| 2 | Apply `WorkshopAccessGuard` to 6 controllers | PR 2 | `cd apps/api && pnpm test -- appointments.controller budget-appointments.controller operational-blocks.controller bodyshop-catalog.controller bodyshop-capacity.controller technicians.controller` | N/A — no e2e harness; unit-tested via direct controller invocation, same pattern as `tracking.controller.spec.ts` | Each controller's `@UseGuards(WorkshopAccessGuard)` line is independently revertible per-controller without touching PR1 or the other 5 |
| 3 | `GET /workshops` scoping + `findOne` 403 | PR 3 | `cd apps/api && pnpm test -- workshops.service.spec workshops.controller.spec` | N/A — no e2e harness; unit-tested via mocked repo/service | `workshops.service.ts` `findAll(user)`/`findOne(id, user)` — revert restores unscoped listing, independent of PR1/PR2 |

## Phase 1: PR1 — `UsersService.findAccessContext` (TDD)

- [x] 1.1 RED: in new `apps/api/src/__tests__/users.service.spec.ts`, test `findAccessContext(id)` selects only `id, role, allowedWorkshopIds, active` (mock repo, assert `select` option) and returns `null` when row absent
- [x] 1.2 GREEN: add `UserAccessContext` type + `findAccessContext(id)` to `apps/api/src/modules/users/users.service.ts` per design's `select` shape

## Phase 2: PR1 — `[]` → `null` normalization on write (TDD)

- [x] 2.1 RED: in `users.service.spec.ts`, test `create()` with `allowedWorkshopIds: []` persists `null`; test `update()` with `allowedWorkshopIds: []` sets `null`
- [x] 2.2 GREEN: in `users.service.ts`, change `create()` line 76 and `update()` line 95 from `?? null` to `dto.allowedWorkshopIds?.length ? dto.allowedWorkshopIds : null`

## Phase 3: PR1 — `JwtStrategy` hydration + fail-closed (TDD)

- [x] 3.1 RED: in new `apps/api/src/__tests__/jwt.strategy.spec.ts` (mock `UsersService`), test `validate()` throws `UnauthorizedException` when `findAccessContext` returns `null`
- [x] 3.2 RED: test `validate()` throws `UnauthorizedException` when returned row has `active: false`
- [x] 3.3 RED: test `validate()` returns `role` from the DB row (not the JWT payload) and `permissions` from the payload unchanged
- [x] 3.4 RED: test `validate()` returns `allowedWorkshopIds` from the DB row and calls `findAccessContext` exactly once
- [x] 3.5 GREEN: make `JwtStrategy.validate()` async, inject `UsersService` in the constructor, implement per design's interface — no `auth.module.ts` change needed (already imports `UsersModule`)

## Phase 4: PR1 — `WorkshopAccessGuard` `admin_taller` bypass + denial log (TDD)

- [x] 4.1 RED: in new `apps/api/src/__tests__/workshop-access.guard.spec.ts` (mirror `permissions.guard.spec.ts` context stub), test `admin_taller` role bypasses even with a non-empty `allowedWorkshopIds`
- [x] 4.2 RED: test `admin` role still bypasses (regression)
- [x] 4.3 RED: test `allowedWorkshopIds: null` and `[]` both allow (unrestricted, regression)
- [x] 4.4 RED: test request with no `workshopId` in query/body allows (regression)
- [x] 4.5 RED: test `workshopId` outside the list throws `ForbiddenException` AND asserts `Logger.warn` called with `userId`, `role`, requested `workshopId`, allowed-list count — never the list or email
- [x] 4.6 GREEN: in `workshop-access.guard.ts`, add `|| user.role === 'admin_taller'` to the bypass condition on line 10; inject `Logger` and warn-log before throwing

## Phase 5: PR1 — Verification

- [x] 5.1 `cd apps/api && pnpm test` — full suite green, no regressions in `permissions.guard.spec.ts` or `tracking.controller.spec.ts` (overrides the guard)
- [x] 5.2 `cd apps/api && pnpm typecheck` — clean

## Phase 6: PR2 — Guard rollout to 6 controllers (TDD)

- [x] 6.1 RED: for each of `appointments.controller.ts`, `budget-appointments.controller.ts`, `operational-blocks.controller.ts`, `bodyshop-catalog.controller.ts`, `bodyshop-capacity.controller.ts`, `technicians.controller.ts` — add/extend that controller's spec with a restricted-user-denied-403 case and a restricted-user-allowed case, mirroring `tracking.controller.spec.ts`'s guard test shape
- [x] 6.2 GREEN: add `@UseGuards(WorkshopAccessGuard)` per guarded route in each of the 6 controllers (route-level, same placement pattern as `tracking.controller.ts:54`); confirm each guarded route reads `workshopId` from `query`/`body` — if any reads it from `params` only, flag and extend the guard (open question from design). **Found one**: `bodyshop-catalog.controller.ts`'s `seed-workshop/:workshopId` reads it only from the route param — extended `WorkshopAccessGuard` to fall back to `request.params?.workshopId` (unit-tested in `workshop-access.guard.spec.ts`)
- [x] 6.3 Confirm `service-types`, `specialties`, `work-types` controllers are untouched (no guard added) — regression check per spec's "Global catalogs remain unguarded" — confirmed via `rg -n "WorkshopAccessGuard" service-types specialties work-types` → no matches

## Phase 7: PR2 — Verification

- [x] 7.1 `cd apps/api && pnpm test` — full suite green (32 suites, 339 passed, 2 skipped, 0 failed)
- [x] 7.2 `cd apps/api && pnpm typecheck` — clean

## Phase 8: PR3 — `GET /workshops` scoping (TDD)

- [ ] 8.1 RED: in new `apps/api/src/__tests__/workshops.service.spec.ts`, test `findAll(user)` returns all active workshops for `admin`/`admin_taller`/unrestricted user
- [ ] 8.2 RED: test `findAll(user)` filters to only `allowedWorkshopIds` for a restricted user
- [ ] 8.3 GREEN: change `WorkshopsService.findAll()` to `findAll(user: UserAccessContext)`, add `where: { id: In(user.allowedWorkshopIds) }` branch when restricted

## Phase 9: PR3 — `findOne` 403 on inaccessible workshop (TDD)

- [ ] 9.1 RED: in `workshops.service.spec.ts`, test `findOne(id, user)` throws `ForbiddenException` when a restricted user requests an id outside `allowedWorkshopIds`
- [ ] 9.2 RED: test `findOne(id, user)` succeeds for admin/admin_taller/unrestricted or when id is in the list (regression)
- [ ] 9.3 GREEN: change `WorkshopsService.findOne()` to `findOne(id: string, user: UserAccessContext)`, add the access check before returning
- [ ] 9.4 GREEN: in new `apps/api/src/__tests__/workshops.controller.spec.ts`, wire `@CurrentUser()` into `WorkshopsController.findAll`/`findOne` and pass `user` through to the service calls

## Phase 10: PR3 — Verification

- [ ] 10.1 `cd apps/api && pnpm test` — full suite green
- [ ] 10.2 `cd apps/api && pnpm typecheck` — clean
- [ ] 10.3 Confirm admin user-assignment picker (`settings/users` page) still lists every workshop — `users.controller` stays `@Roles('admin','admin_taller')`, both bypass; no frontend PR needed
