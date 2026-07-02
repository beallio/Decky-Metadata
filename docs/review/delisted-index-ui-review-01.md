# Review: delisted-index-ui

## Scope reviewed
Diff `dev..feat/delisted-index-ui` — `src/backend.ts`, `src/components.tsx`.

## Findings
- **Bindings**: `refreshDelistedIndex` / `getDelistedIndexStatus` callables added, matching the
  existing `callable<...>` pattern and the backend return shapes.
- **UI in `Content`**: `delistedStatus`/`delistedBusy` state; status loaded on mount via
  `useEffect` + `getDelistedIndexStatus` (try/catch, `log.warn` on failure); a "Refresh delisted
  index" `FocusableButton` (disabled + "Refreshing…" while busy) that calls `refreshDelistedIndex`,
  toasts success/failure, and reloads status in `finally`.
- **Last-refreshed line** (as requested): `` `${count} delisted apps · updated ${epochToDate(fetched_at)}` ``
  when populated, else "Delisted index not downloaded yet". Reuses `epochToDate`, `Spinner`,
  `FocusableButton`, and existing style constants.
- **No i18n reintroduced** — literal English strings only; residue check clean.

## Scope discipline
Two bindings + the button/status block only; no backend change, no scan/matching change, no
npm deps.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
tree clean.

Auto-approved for `dev` per project workflow (dev merges auto-approve; only dev → main is a
human gate).

STATUS: APPROVED
