# Review — controller-layout-tab-preservation (round 05)

Branch: `feat/controller-layout-tab-preservation`
Reviewed against: `docs/plans/2026-08-26_controller-layout-tab-preservation.md`

## Verdict

The corrected production bundle and Legion type-102 smoke pass. Steam Deck also
preserves Community, expands/restores the getter correctly, and visibly renders
Community cards, but the permanent smoke still rejects it because the plan
assumed every layout would be mounted in the DOM. Steam Deck virtualizes the
list (24 mounted panels for 52 getter records), so exact DOM/getter equality is
not a valid or safe acceptance oracle.

## Gate status

- Reviewed commit: `a3e301d2026b7af1b5f2297e17b70acd52aebc26`.
- Legion corrected smoke: type `102`, Community retained, getter/DOM expanded
  15 -> 52, hashes preserved, filter/tab restored.
- Steam Deck corrected query: type `4`, Community retained, getter expanded
  33 -> 52 with stable hashes and filter restored; current markup mounted 24
  visible virtualized cards and no `Focusable` marker.
- The committed no-query screenshot visibly confirms Community cards on Steam
  Deck. The evidence remains honestly `pending-validation`.
- Current recorded gates: 20 Vitest files / 258 tests and 411 pytest tests.

## Required changes

1. Replace exact `getter_count == rendered_after` with a virtualization-safe
   contract:
   - Community must be selected before and after;
   - rendered Community rows must be positive and must not exceed getter count;
   - the getter must reach the query-specific expanded/stable result;
   - required hashes/filter/tab restoration remain mandatory;
   - zero/blank content, wrong selected tab, or rendered rows greater than the
     getter must fail.
   Record whether coverage is complete (`rendered == getter`) or virtualized
   (`rendered < getter`) in passed evidence; do not scroll or enumerate
   framework/MobX state to force equality.
2. Add discriminating verifier tests for `52 getter / 24 rendered` passing as
   virtualized, plus wrong-tab, zero-rendered, and rendered-greater-than-getter
   failures. Mutating the safe inequality back to equality must fail the
   Steam-Deck fixture.
3. Rerun the typed smoke on both still-current chooser routes. Require passed
   evidence, screenshots, original filter/tab restoration, and final tunnel
   down status. Update the session log to replace the outstanding boundary with
   the actual final Legion and Steam Deck results.
4. Rerun focused tests, syntax checks, the virtualization mutation, full quality
   gate, and full pytest. Commit the verifier/session evidence and recreate the
   round-complete marker only after both typed evidence files report
   `status: passed`.

STATUS: CHANGES_REQUESTED
