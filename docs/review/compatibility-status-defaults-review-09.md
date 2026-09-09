# Review — compatibility-status-defaults (round 09)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

Local correction review is complete for code commit `1bc0a43` and handoff
HEAD `fecaf95e7353af610bd4eadb0b76b12359bc452f`. The requested source
changes and local regressions are present: unchanged-choice Game Info
refresh protection, shared Big Picture document lookup, and restored
native compatibility publication.

Final feature acceptance remains blocked. On 2026-09-08 the user selected
**Pause device work**. Do not perform Deck operations, resume an implementer
for device work, merge into dev, push, promote main, or release until the
user resumes the required validation. This is not an APPROVED review.

## Gate status

- Main independently ran `./run.sh scripts/orchestration-hooks/quality-gates`
  on this final local tree. Exit 0: TypeScript checking, Rollup, 27 Vitest
  files / 460 tests, Python compilation, pytest, and version guard passed.
  Existing npm configuration warnings did not fail the gate.
- No known temporary compatibility debug globals remained in `src/`.
- The external implementer exited with a valid local round-complete marker.
  No supervised implementation, browser, tunnel, or inhibitor process is
  active. Saved device power settings were never changed.
- Earlier device suites and behavior checks are recorded in the session log
  and prior review notes. They do not prove the latest native publication
  correction on hardware.
- The latest local ZIP before history organization was
  `0.3.14+1bc0a43`; it was not delivered or installed by this local-only
  correction round. Rebuild after organizing history so package provenance
  matches the new local HEAD.

## Required changes

### Resume only the remaining device validation

When the user explicitly resumes device work:

1. Re-establish the authorized Deck connection and confirm its current
   state before making changes. Do not assume the old IP or debugger
   target suffix remains valid.
2. Install the complete newly packaged ZIP through Decky's GUI and verify
   the installed version and bundle against the intended local tree.
3. Keep Great on Deck continuously mounted while changing Automatic ->
   Verified -> Automatic. The previously observed fixture expected native
   Verified shortcuts `4 -> 16 -> 4` and collection count `34 -> 46 -> 34`.
   Recompute expectations from the current library if it has changed;
   packed values alone cannot prove native membership.
4. Keep matched Game Info mounted and verify its rich fields and visible
   category survive both directions. Repeat with an unchanged Follow Valve
   choice and an unchanged fixed per-game category after old render
   protection expires.
5. Reload the plugin with Game Info already mounted; verify the correct
   Big Picture instance receives updates without navigation/remount.
6. Retain ordinary Steam identity, no-record inheritance, controller
   select/cancel/fresh-entry focus, and the real 64-bit launch safeguards.
   Run the applicable complete and no-launch device smokes.
7. Restore only the settings/fixtures changed by that validation, verify
   restoration, and close the dedicated connections before integration.

The original disposable shortcut `3168609012` was removed, and the three
edited per-game overrides were restored to null/null/2. The last global
action after the native-filter test selected Automatic. Verify current
state on resume rather than blindly replacing the saved settings file.
The restricted original baseline and evidence remain under
`/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/`.

### Requested local history organization

The user requested that the repeated fixes be organized after implementation,
then chose to pause device work while reachable local work is finished.
Main will consolidate this unpublished local feature history now, retaining
the plan first, grouping the final implementation and its tests together,
and retaining user documentation and durable review records separately.

Preserve the original chain under
`refs/backup/compatibility-status-defaults/pre-organize-20260908` before
rewriting. Preserve the complete final tree, do not alter prior review
contents or their historical commit references, and do not touch dev,
unrelated branches, or remote history. Restamp the local completion marker
only after the organized tree is clean. History organization is not device
acceptance or permission to integrate.

STATUS: CHANGES_REQUESTED
