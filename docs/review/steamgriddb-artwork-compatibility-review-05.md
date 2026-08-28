# Review — steamgriddb-artwork-compatibility (round 05)

Branch: `feat/steamgriddb-artwork-compatibility`
Reviewed against: `docs/plans/2026-08-27_steamgriddb-artwork-compatibility.md`

## Verdict

The production fix now passes the exact human-reported surface: the user
confirmed the formerly blank Warhammer shortcut icon is visible in Steam Deck
Desktop Mode Library Home with Decky Metadata enabled. The remaining failure is
an invalid permanent-smoke oracle—direct `GetIconURLForApp` polling stayed null
for 15 seconds even while the actual sidebar icon rendered.

## Gate status

- Reviewed commit: `5f2260956b6de13785fec660a9c78bb82b6c7936`.
- Library Home route/identity is correct (`BIsShortcut=true`,
  `BIsModOrShortcut=true`); six artwork-file hashes and all custom-art
  candidate hashes remain unchanged.
- The exact Desktop Library Home left sidebar was checked by the user on the
  Steam Deck, and the affected Warhammer icon is visible.
- The bounded direct icon API returned no error but remained unresolved after
  59 attempts / 15 seconds. Gaming Library artwork also remained visibly
  rendered. The API hydration result is therefore not equivalent to the user
  surface and cannot remain a mandatory pass condition.
- Production artwork, Game Info, rerender, quick-links, route conflicts, and
  authorized launch/termination gates have passed.

## Required changes

1. Make `iconResolved`/`iconValueHash` diagnostic output rather than a mandatory
   success condition. Keep `iconRequestError` fatal. Automated pass must still
   require Library Home native shortcut identity, exact shortcut/matched IDs,
   unchanged six-file hash set, valid custom-art candidate hashes/counts, and
   bounded polling with no raw URL/path output.
2. Add executable tests where bounded polling remains null without error and
   the identity/file/candidate contract passes, while request errors, false
   shortcut identity, changed/missing files, malformed hashes, or wrong route
   still fail. Mutating unresolved-without-error back to mandatory failure must
   fail the new fixture.
3. Update the runbook/session record to separate automated identity/file
   evidence from the required human visual oracle. Record the user's exact
   Steam Deck Desktop Library Home confirmation and retain the screenshot/API
   diagnostics without claiming the direct icon API resolved.
4. Rerun the standalone smoke once on Library Home, focused verifier tests,
   syntax checks, mutation, and full quality/review-note gates. No production
   redeploy or additional launch is required. Commit the durable record and
   recreate the marker.

STATUS: CHANGES_REQUESTED
