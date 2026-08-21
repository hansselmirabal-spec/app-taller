# Workshop Access Control Specification

## Purpose

Define which users may act on which workshops, end to end: how access is
resolved on every request (Part 1 — hydration fix), which roles bypass
restriction, what an empty/null restriction list means, and where the
restriction is enforced across the API and the workshop selector (Part 2 —
rollout). Today `allowedWorkshopIds` is never hydrated into `request.user`,
so the existing `WorkshopAccessGuard` is a no-op everywhere it is applied.

## Requirements

### Requirement: Fresh per-request access hydration

The system MUST resolve the authenticated user's current `role` and
`allowedWorkshopIds` from the database on every authenticated request. The
JWT MUST NOT carry `allowedWorkshopIds` as an embedded claim, so a revoked
grant takes effect without requiring the user to re-login.

#### Scenario: Access revoked mid-session takes effect immediately

- GIVEN a user with an active, still-valid session token
- WHEN an admin removes a workshop from their `allowedWorkshopIds`
- AND the user then requests that workshop
- THEN the request is rejected with 403, with no re-login needed

#### Scenario: Unchanged access still works

- GIVEN a user whose `allowedWorkshopIds` has not changed since login
- WHEN they request a workshop within their list
- THEN the request succeeds

### Requirement: `admin` and `admin_taller` full-access bypass

Users with role `admin` or `admin_taller` MUST bypass workshop-access
restriction entirely, regardless of any value stored in their
`allowedWorkshopIds`.

#### Scenario: admin_taller with a stale restricted list still has full access

- GIVEN a user with role `admin_taller` and a non-empty `allowedWorkshopIds`
- WHEN they request any `workshopId`
- THEN access is granted

#### Scenario: admin role unaffected

- GIVEN a user with role `admin`
- WHEN they request any `workshopId`
- THEN access is granted, unchanged from current behavior

### Requirement: Unrestricted access semantics

`allowedWorkshopIds` of `null`, `undefined`, or an empty array MUST be
treated as "no restriction" (full access to all workshops) — never as
"access to nothing". Admin-facing UI describing this state MUST label it
as full access, not as "no workshops assigned".

#### Scenario: Empty array means unrestricted

- GIVEN a user with `allowedWorkshopIds = []`
- WHEN they request any `workshopId`
- THEN access is granted

#### Scenario: Non-empty list rejects ids outside it

- GIVEN a user with `allowedWorkshopIds = ["A", "B"]`
- WHEN they request `workshopId = "C"`
- THEN the request is rejected with 403

### Requirement: Guarded endpoint enforcement

`WorkshopAccessGuard` MUST be applied to the `appointments`,
`budget-appointments`, `operational-blocks`, `bodyshop-catalog`,
`bodyshop-capacity`, `technicians`, and `bodyshop-schedule` (`simulate`)
controllers, and to `bodyshop`'s `getTechAvailability` route, in addition to
the controllers already guarded today.

#### Scenario: Restricted user requests a disallowed workshop

- GIVEN a restricted user without access to workshop "X"
- WHEN they call any newly guarded endpoint with `workshopId = "X"`
- THEN the response is 403

#### Scenario: Restricted user requests an allowed workshop

- GIVEN a restricted user with access to workshop "Y"
- WHEN they call a newly guarded endpoint with `workshopId = "Y"`
- THEN the request proceeds normally

#### Scenario: Restricted user calls GET /bodyshop/tech-availability for a disallowed workshop

- GIVEN a restricted user without access to workshop "X"
- WHEN they call `GET /bodyshop/tech-availability?workshopId=X`
- THEN the response is 403 and no technician availability data is returned

#### Scenario: Restricted user calls POST /bodyshop/simulate-schedule for a disallowed workshop

- GIVEN a restricted user without access to workshop "X"
- WHEN they call `POST /bodyshop/simulate-schedule` with `workshopId = "X"` in the body
- THEN the response is 403 and no scheduling simulation is returned

### Requirement: Scoped workshop listing

`GET /workshops` MUST return only workshops the requesting user can access:
every workshop for `admin`, `admin_taller`, or unrestricted users; only the
ids in `allowedWorkshopIds` for restricted users.

#### Scenario: Restricted user lists workshops

- GIVEN a restricted user with `allowedWorkshopIds = ["A"]`
- WHEN they call `GET /workshops`
- THEN the response contains only the workshop with id "A"

#### Scenario: Unrestricted or admin user lists workshops

- GIVEN an `admin`, `admin_taller`, or unrestricted user
- WHEN they call `GET /workshops`
- THEN the response contains every active workshop, unchanged from today

### Requirement: Workshop selector reflects accessible workshops only

The workshop selector MUST only offer workshops present in the
`GET /workshops` response. It MUST NOT render inaccessible workshops in a
disabled/greyed-out state.

#### Scenario: Restricted user opens the selector

- GIVEN a restricted user with access to 1 of 3 workshops
- WHEN they open the workshop selector
- THEN only the 1 accessible workshop is listed
- AND no entry for the other 2 workshops appears, disabled or otherwise

#### Scenario: Active workshop loses access mid-session

- GIVEN a user has workshop "X" selected as active
- WHEN access to "X" is revoked and the workshops list is refetched
- THEN "X" no longer appears in the selector
- AND the app falls back to another workshop the user can still access

### Requirement: Global catalogs remain unguarded

`service-types`, `specialties`, and `work-types` endpoints MUST NOT have
`WorkshopAccessGuard` applied. They remain global catalogs, reachable
regardless of a user's `allowedWorkshopIds`.

#### Scenario: Restricted user reads global catalogs

- GIVEN a restricted user with `allowedWorkshopIds = ["A"]`
- WHEN they call `GET` on `service-types`, `specialties`, or `work-types`
- THEN the response succeeds, unaffected by their workshop restriction

### Requirement: Name-based workshop scoping authorization equivalence

`GET /technicians` MUST authorize a request scoped by `workshopName` with
the same restriction check applied to a request scoped by `workshopId`. The
controller MUST resolve `workshopName` to a workshop and re-run the
user-aware access check (`WorkshopsService.findOne` /
`isUnrestrictedWorkshopAccess`) before returning technician data. A
restricted user MUST NOT receive technician data, in any form, for a
workshop outside their `allowedWorkshopIds` regardless of whether the
request used `workshopId` or `workshopName`.

#### Scenario: Restricted user queries by workshopName outside their access

- GIVEN a restricted user with `allowedWorkshopIds = ["A"]`
- WHEN they call `GET /technicians?workshopName=<name of workshop B>`
- THEN the response is 403
- AND no technician records for workshop B are returned

#### Scenario: Restricted user queries by workshopName within their access

- GIVEN a restricted user with `allowedWorkshopIds = ["A"]`
- WHEN they call `GET /technicians?workshopName=<name of workshop A>`
- THEN the request proceeds normally and returns workshop A's technicians

#### Scenario: Unrestricted or admin user queries by workshopName

- GIVEN an `admin`, `admin_taller`, or unrestricted user
- WHEN they call `GET /technicians?workshopName=<any workshop name>`
- THEN the request proceeds normally, unchanged from today

### Requirement: Unscoped-route fail-open remains unchanged

This change MUST NOT alter `WorkshopAccessGuard`'s existing behavior of
allowing a request to proceed when no `workshopId` is present in
query/body/route params. This fail-open path exists for routes with no
workshop scope and remains covered by the existing regression test
`'sin workshopId en query/body permite el paso (regresión)'` in
`apps/api/src/__tests__/workshop-access.guard.spec.ts`, which MUST continue
to pass unmodified.

#### Scenario: Route without any workshop parameter still passes

- GIVEN any authenticated user, restricted or not
- WHEN they call a guarded route that carries no `workshopId` in
  query/body/route params
- THEN the guard allows the request to proceed, unchanged from today

### Requirement: No guard scope creep to other controllers

This change MUST NOT add `WorkshopAccessGuard` to any controller other than
`bodyshop` (`getTechAvailability`) and `bodyshop-schedule` (`simulate`).
Global catalog endpoints (`service-types`, `specialties`, `work-types`)
remain unguarded per the existing "Global catalogs remain unguarded"
requirement, unaffected by this change.

#### Scenario: Global catalogs remain reachable without restriction

- GIVEN a restricted user with `allowedWorkshopIds = ["A"]`
- WHEN they call `GET` on `service-types`, `specialties`, or `work-types`
- THEN the response succeeds, unaffected by this change
