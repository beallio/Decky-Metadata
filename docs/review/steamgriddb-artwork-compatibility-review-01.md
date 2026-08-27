# Review — steamgriddb-artwork-compatibility (round 01)

Branch: `feat/steamgriddb-artwork-compatibility`
Reviewed against: `docs/plans/2026-08-27_steamgriddb-artwork-compatibility.md`

## Verdict

Changes are required. The core outside-detail pass-through is directionally
correct and locally test-green, but ambiguous joined route contexts can still
classify Library Home as the current detail page. The branch was also marked
complete without either mandatory user-visible artwork proof or the
launch-sensitive device smoke.

## Gate status

- Reviewed commit: `b3f6e42a5e9689472ca27949bc402c2c39edbb6b`.
- Reviewer reran `scripts/orchestration/run-quality-gates`: TypeScript/build,
  22 Vitest files / 281 tests, Python byte-compilation, and the full pytest
  collection passed with `quality-gates: OK`.
- Route-scoped spoof precedence, non-consumption budgets, receiver/unpatch
  wiring, and the failure-first mutations are otherwise consistent.
- Baseline live evidence confirms the issue, but the session record explicitly
  says post-change Library Home artwork and real launch verification were not
  run. The existing finished marker is therefore not accepted.
- The user has now explicitly authorized the current-run real launch smoke and
  has left the Steam Deck on Library Home. The verifier may safely locate/scroll
  the affected sidebar item without navigating away or reapplying artwork.

## Required changes

1. **Fail native on conflicting/stale route signals.**
   `isCurrentGameDetailRoute` returns true if any of the first eight joined
   route tokens matches the app detail. `currentRoutePath` deliberately joins
   Router and browser locations, so a stale detail token plus an authoritative
   `/library/home`, controller-configurator, or different-app token can still
   apply the false identity and reproduce issue #5 during navigation. Parse all
   bounded authoritative path tokens and return true only when they consistently
   identify the current app detail; any recognized Home/controller/other-app
   conflict must fail closed to native shortcut identity. Add both token-order
   conflict tests, consistent duplicate detail tokens, and metadata-patch
   integration coverage proving an armed shield/counter survives an ambiguous
   Home transition.

2. **Use the captured artwork files as the oracle.**
   The baseline probe recorded zero vertical/landscape/hero/logo candidate URLs
   while the separate filesystem audit recorded six intact custom-art files.
   Requiring every candidate count to be positive makes the permanent smoke
   impossible on the exact issue fixture; accepting one arbitrary candidate per
   category also would not prove preservation. Compare the exact baseline
   custom-art file count/hash set before and after, and treat candidate URL
   counts/hashes as diagnostics that may legitimately remain zero. Keep the
   resolved shortcut icon and visual sidebar result as mandatory behavior.
   Add fixtures for zero candidates plus six unchanged files passing, and
   missing/changed file hashes failing.

3. **Reject an invalid alias fixture.**
   Fail before CDP when shortcut appid equals matched appid. Otherwise a typo
   trivially makes both overview lookups the same object and falsely passes the
   alias assertion. Add a shell/static regression for equal IDs.

4. **Complete the Library Home/SteamGridDB device proof.**
   The user has confirmed Library Home is open; locate or scroll the affected
   non-Steam sidebar item without navigating away, launching, or reapplying
   artwork. Deploy the corrected commit and run `smoke_artwork_identity.sh` for
   shortcut `2155012430` / matched app `55150`. Require
   `BIsShortcut=true`, `BIsModOrShortcut=true`, non-null bounded icon
   resolution, exact unchanged six-file hash baseline, and a screenshot showing
   the formerly blank sidebar icon. Inspect Capsule, Wide Capsule, Hero, Logo,
   logo positioning, and square-capsule presentation. Record raw-path-free
   evidence and final tunnel shutdown.

5. **Run the authorized launch gate.**
   The user explicitly authorized the current-run committed real launch smoke
   for `MATCHED_APPID=2155012430`. Run the plan's
   `verify-change --device --allow-launch` flow and record the 64-bit gameid
   launch plus committed-tool termination result. Also rerun quick-links,
   rerender, and the no-launch suite; record stale unrelated fixture failures
   separately rather than calling them passes.

6. Rerun focused tests, route/precedence mutations, probe/shell safety tests, and
   the full quality/review-note gates. Update the durable session log with the
   exact commands, actual tallies, screenshots/evidence, matched-alias status,
   artwork hash comparison, and only the plan's explicit exclusions. Recreate
   the round-complete marker only after both the artwork and launch gates pass.

STATUS: CHANGES_REQUESTED
