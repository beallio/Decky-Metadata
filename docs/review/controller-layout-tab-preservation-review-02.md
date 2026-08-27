# Review — controller-layout-tab-preservation (round 02)

Branch: `feat/controller-layout-tab-preservation`
Reviewed against: `docs/plans/2026-08-26_controller-layout-tab-preservation.md`

## Verdict

The round-01 source and permanent-verifier findings are resolved, and the
corrected branch passes the full local gate. Integration remains blocked only
by the plan's mandatory post-change hardware proof: both configured devices are
currently offline, so the corrected bundle has not been deployed or exercised
on the live Steam webpack/UI surface.

## Gate status

- Reviewed commit: `0072d16f8f3b48a78eaefaebe7917e02741486e2`.
- Store-driven initial queries now install the Tabs wrapper before selection;
  direct queries preserve exact composite-key memory, and the stateful
  integration plus mutation tests discriminate the lifecycle.
- The probe waits for displayed-cache replacement and settled chooser state;
  the smoke requires an expected controller type and explicitly validates
  restoration before PASS; payload/privacy tests inspect serialized objects.
- Reviewer reran `scripts/orchestration/run-quality-gates`: TypeScript/build,
  20 Vitest files / 250 tests, Python byte-compilation, and 400 pytest tests
  passed with `quality-gates: OK`. Review notes were intact and the tree stayed
  clean.
- Reviewer reran both device doctors. `steamdeck` and `steamdeck-legos` each
  reported `deck-reachability: Optional Deck is offline`.

## Required changes

1. When both devices are reachable, deploy commit `0072d16` through dedicated
   ports and run the corrected standalone smoke:
   - `steamdeck-legos`: shortcut `3213262460`, source `55150`, expected type
     `102`; the **first** direct false-filter query after fresh chooser entry
     must preserve Community, rendered/getter counts and hashes must agree, and
     the original filter/tab must be restored.
   - `steamdeck`: shortcut `2155012430`, source `55150`, expected type `4`; the
     wrapper must remain native while the same count/hash/restoration checks
     pass.
2. Capture before/after screenshots with Community visibly selected and the
   complete current list rendered. Run `run_all.sh --no-launch` on both hosts,
   record every PASS/FAIL line, and close both tunnels.
3. Update the durable session record with commands, artifact paths, actual
   smoke counts/hashes, screenshots, no-launch results, and final tunnel status.
   Remove the blocked/unverified hardware statements only after the evidence
   exists.
4. Rerun focused/mutation controls and the full quality/review-note gates after
   any change, commit the generated artifacts/session evidence, and create the
   round-complete marker only when both device sequences pass.

STATUS: CHANGES_REQUESTED
