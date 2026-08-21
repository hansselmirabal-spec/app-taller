# Budget Simulator Manual Piece Specification

## Purpose

Let an advisor quote a damaged panel that has no `bodyshop_catalog` match by
entering it manually, per row, for that one budget only — without ever
persisting the manual piece into the catalog.

## Requirements

### Requirement: Per-row catalog/manual toggle with required category

The system MUST let the advisor set a Simulator row's mode to `manual` as an
alternative to `catalog`, per row, in both create and edit mode. A manual row
MUST require an explicit process category (Chapería/BODYWORK,
Preparación/PREP, Pintura/PAINT) selected by the advisor before it is counted
in the estimate.

#### Scenario: Adding a manual row

- GIVEN the advisor is on the Simulator (create or edit mode)
- WHEN they toggle a row to `manual` and enter pieza name, horas, and category
- THEN the row accepts the input without requiring a catalog match

#### Scenario: Manual row missing category is not sent downstream

- GIVEN a manual row has horas entered but no category selected
- WHEN the advisor tries to include it in the estimate
- THEN the system MUST flag the row as incomplete and MUST NOT forward an
  undefined/empty category to the estimate or the save payload

### Requirement: Manual rows excluded from batch estimate, synthesized client-side

The system MUST exclude manual rows from the batch `POST
/budget-simulator/estimate` call and MUST NOT let a manual row silently
resolve to 0 hours or be dropped. Manual rows MUST be synthesized
client-side into a `SimulatorLineResult`-shaped object, with `totalMdo =
horas × tarifa` from `GET /budget-simulator/config`, merged back into
`estimate.lines` in original row order.

#### Scenario: Mixed catalog and manual budget

- GIVEN a budget with 2 catalog rows and 1 manual row
- WHEN the debounced estimate recomputes
- THEN only the 2 catalog rows are sent to `/budget-simulator/estimate`
- AND the manual row appears in `estimate.lines` with its own `totalMdo`,
  never 0 unless horas is 0

#### Scenario: 100% manual budget computes without the estimate endpoint

- GIVEN a budget with only manual rows
- WHEN the estimate recomputes
- THEN no call to `/budget-simulator/estimate` is made
- AND `estimate.lines` and `estimate.total` are computed from the
  synthesized manual lines using the workshop rate

### Requirement: Summary bar renders for manual-only budgets

The system MUST populate `estimate` (and therefore render
`EstimateSummaryBar`) whenever the item list contains at least one manual
row with valid hours and category, even with zero catalog rows present.

#### Scenario: Summary shows totals for a 100% manual budget

- GIVEN the advisor adds only manual rows with valid hours
- WHEN the estimate recomputes
- THEN `EstimateSummaryBar` renders totals instead of returning null

#### Scenario: Empty item list still hides the summary bar

- GIVEN the advisor removes all rows (catalog and manual)
- WHEN the item list becomes empty
- THEN `EstimateSummaryBar` returns null, unchanged from current behavior

### Requirement: PDF and WhatsApp show a generic label for manual rows

`BudgetPdfDocument` and `handleWhatsApp` MUST render a generic label (e.g.
"Manual") for manual rows instead of a `DamageLevel` value, and MUST NOT
print `undefined` or throw when `DAMAGE_LABEL`/`DAMAGE_COLOR` lack a
matching key for a manual row.

#### Scenario: PDF with a mixed budget

- GIVEN a saved budget with 1 manual row and 1 catalog row
- WHEN the advisor generates the PDF
- THEN the manual row shows the generic label with no `undefined` text
- AND the catalog row still shows its `DamageLevel` label unchanged

#### Scenario: WhatsApp message for a 100% manual budget

- GIVEN a 100% manual budget
- WHEN the advisor shares it via WhatsApp
- THEN the generated message lists every manual row with hours, category,
  and the generic label, with no `undefined`/`NaN` in the text

### Requirement: Manual rows persist as free text, never into the catalog

`estimateToBudgetPayload` MUST include manual rows, with their selected
category and horas, inside `BudgetAppointment.processes`/`.pieces` (jsonb,
free text). Under no circumstance MUST saving, approving, or editing a
budget containing manual rows create or update a row in `bodyshop_catalog`
or any other catalog table.

#### Scenario: Save persists manual rows alongside catalog rows

- GIVEN a budget with both catalog and manual rows
- WHEN the advisor saves (create or edit)
- THEN `BudgetAppointment.processes`/`.pieces` contains entries for both,
  each manual entry carrying its selected category and hours

#### Scenario: Catalog table is never mutated

- GIVEN any save, approve, or edit operation involving a manual row
- WHEN the operation completes
- THEN the `bodyshop_catalog` row count is unchanged
