# Delta for Budget Simulator Edit

## ADDED Requirements

### Requirement: `estimate` reflects manual-only budgets everywhere it is consumed

`estimate` MUST be derived from the union of catalog rows (via the batch
call) and manual rows (synthesized client-side), so every UI surface that
reads `estimate` works correctly for a budget with zero catalog rows. This is
not a matter of removing a `disabled` prop from the Save button — neither
page gates Save on `estimate`. The actual failure modes today, before this
fix, are:

- **Create mode** (`/presupuesto/simulador`): `handleSave()` silently skips
  persisting processes/pieces when `estimate` is null — the appointment is
  created with an empty breakdown and no error is shown to the advisor
  (`page.tsx:65-70`, `if (estimate) { ... if (processes.length > 0) { save } }`).
- **Edit mode** (`/presupuesto/simulador/[id]`): `handleSave()` correctly
  refuses to PATCH an empty `processes` array (to avoid wiping a previously
  saved breakdown), but shows the blocking error
  ("Cargá al menos un panel...") for any manual-only budget, because
  `estimate` was never populated for non-catalog rows
  (`[id]/page.tsx:90-102`).
- The WhatsApp button (`disabled={!estimate}`, both pages) and
  `EstimateSummaryBar` (`if (!estimate) return null`) both stay inert for a
  manual-only budget for the same root cause.

Fixing the `estimate` derivation to include manual rows resolves all four
symptoms at once — no separate fix is needed per surface.

#### Scenario: Manual-only budget saves correctly (create mode)

- GIVEN the advisor is on `/presupuesto/simulador`
- WHEN they add only manual rows with valid hours and category
- THEN `estimate` is non-null and reflects those rows
- AND pressing Guardar persists the manual processes/pieces to the created
  appointment instead of silently saving it empty

#### Scenario: Manual-only budget saves correctly (edit mode)

- GIVEN the advisor is on `/presupuesto/simulador/[id]` for a `pending`
  appointment
- WHEN they replace all rows with manual-only rows with valid hours and
  category
- THEN `estimate` is non-null and reflects those rows
- AND pressing Guardar succeeds instead of showing "Cargá al menos un
  panel..."

#### Scenario: WhatsApp and summary bar work for manual-only budgets

- GIVEN a budget with only manual rows, all with valid hours and category
- THEN the WhatsApp button is enabled and the estimate summary bar renders
  the aggregated hours and cost
