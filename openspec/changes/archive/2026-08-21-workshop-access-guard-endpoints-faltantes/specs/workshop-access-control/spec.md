# Delta for workshop-access-control

## MODIFIED Requirements

### Requirement: Guarded endpoint enforcement

`WorkshopAccessGuard` MUST be applied to the `appointments`,
`budget-appointments`, `operational-blocks`, `bodyshop-catalog`,
`bodyshop-capacity`, `technicians`, and `bodyshop-schedule` (`simulate`)
controllers, and to `bodyshop`'s `getTechAvailability` route, in addition to
the controllers already guarded today.

(Previously: did not cover `bodyshop.getTechAvailability` or
`bodyshop-schedule.simulate` — these 2 routes shipped without the guard
despite requiring `workshopId`.)

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

## ADDED Requirements

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
