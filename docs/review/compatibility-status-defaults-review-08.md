# Review — compatibility-status-defaults (round 08)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

Three related regressions remain in reviewed HEAD
`2cd1c7fa20b11392705e87142398e0eeecd0df62` (correction `445373d`).
Independent read-only reviews found two Game Info boundary defects. Main
then reproduced a native collection invalidation regression on the exact
deployed bundle. Fix the publication/render contract coherently rather
than accumulating narrower exceptions.

## Gate status

- The correction's local gate and full/no-launch Deck suites were reported
  passed. Its basic mounted Automatic/Verified Game Info transition was
  demonstrated, but the edge cases below were not covered.
- Main verified the deployed bundle SHA-256 matches this correction:
  `cdc1aea206b69d7d81b9b57798d89442c6b507a741afad012f83002dbab5ca4c`.
- Native filter proof:
  `/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/native-filter-regression.json`.
  With Great on Deck continuously mounted, Automatic -> Verified increased
  Verified native shortcuts from 4 to 16, but the collection stayed at 34
  instead of the expected 46.
- Main confirmed the separate-document layout: the local document title is
  SharedJSContext, the bridged document title is Steam Big Picture Mode,
  and they are different documents.
- Main restored global Automatic after the filter check. No per-game
  choices or fixtures were changed for that check. Earlier restoration
  still covers the original 18 shortcuts and 14 metadata records.
- Device connectivity has been intermittent. An unprivileged idle
  inhibitor did not prevent the connection loss; full sleep inhibition
  requires administrator authentication. Main owns power/network recovery
  and the next live verification. Do not make device calls in this round.

## Required changes

### R1 — Protect the actual Game Info render even when its category is unchanged

`routerPatches.ts:116-123` force-updates the current Game Info on every
compatibility revision. For Follow Valve or an explicit per-game choice,
a global default change can leave the current category unchanged.
`applyCompatibilityDefault()` therefore does not arm its render shield,
but the policy change still emits a revision and forceUpdate runs.
After the old shield expires, ordinary `GetPerClientData` /
`BHasRecentlyLaunched` behavior can leave `bypassCounter=4`, and the
unprotected render classifies the shortcut as a mod/non-Steam game again.

Apply the existing scoped rendering protection at the actual native
render/refreshed-instance boundary, not only when packed bits change.
Preserve in-call launch-truth priority. Test an unchanged Follow Valve and
an unchanged explicit choice after prior protection expires, using the
real patched classification path rather than fixing BIsModOrShortcut to
false in a mock.

### R2 — Cover an already-mounted Game Info in the real Big Picture document

`captureMountedGameInfo()` reads `globalThis.document` at
`routerPatches.ts:84-92`. That is the wrong document in this supported
SharedJSContext layout. An instance already mounted before plugin reload
will not run the new componentDidMount hook; the capture then misses it,
and its non-observable category remains stale on later global changes.

Reuse the established SteamUI host/document bridge from
`libraryCompatibilityIndicators.tsx:44-81` if DOM capture remains part of
the design. Do not introduce another conflicting host-resolution scheme.
Prove a Game Info instance mounted before hook installation can receive
the changed category without navigation/remount, while keeping its details.

### R3 — Restore native compatibility-filter invalidation

The identity-preserving update removed the native map publication but only
notifies plugin-owned revision listeners. Steam's cached native filter
membership is now stale. This is observed behavior, not an inference:

- Before: Great on Deck 34, with 4 native shortcuts at category Verified.
- Set global Verified while that collection remains mounted.
- After: 16 native shortcuts at Verified, but Great on Deck still 34.
- Expected after: 46, with existing regular Steam membership unchanged.

Re-establish the native invalidation required after the completed update
batch. Preserve rich Game Info, native AppID/launch identity, baseline
restoration, no-record coverage, and linear batching. Do not use fake
entries, destructive remove/re-add tricks, or mutate an unrelated Steam
game just to provoke refresh.

Consider whether protecting the actual native Game Info render allows
reuse of the previously established native overview publication. That may
be simpler than replacing every native consumer with custom subscriptions.
If keeping identity-preserving mutation, use a real native invalidation
mechanism. Investigate the supported native contract rather than guessing.
Remove obsolete mount/DOM/refresh scaffolding if the chosen clean solution
no longer needs it. Do not introduce a second competing rendering policy.

### Tests and acceptance

- Render an actual test consumer through the patched classification method
  for R1; a forceUpdate spy whose render always returns rich content does
  not defend the boundary.
- Cover pre-mounted instances for R2 in a split-document fixture if
  applicable, and retain actual live evidence as the final oracle.
- Keep the native Great on Deck collection mounted for R3's forward and
  reverse transitions. Compare its visible membership/count with the
  independently read native category change; packed bits alone cannot pass.
- Recheck the original continuously mounted matched Game Info transition,
  a current Follow Valve/explicit exception, and an unchanged ordinary
  Steam title. Re-run the appropriate launch and no-launch smokes when
  Main installs the corrected candidate.
- Keep meaningful regressions. Do not add literal “rich Game Info” objects
  that no tested code changes, source-text assertions, or wiring-only tests.

### Ownership and handoff

This is a local code/test correction round. Main owns device access and will
perform the live cases after network/power recovery; do not deploy, navigate,
change settings, or run device smokes concurrently with Main. Run local
gates, prepare the full ZIP, record its version and truthful local results,
commit, mark the code round complete, and exit. A code-round marker is not
full feature acceptance or permission to merge.

The user additionally requested organized commits after implementation.
Do NOT rewrite history now. Main will consolidate the repeated feature/fix
commits into logical commits after all verification passes, retain the plan
and review audit records, and then integrate into dev. No unrelated history,
remote push, release, or main promotion is authorized.

STATUS: CHANGES_REQUESTED
