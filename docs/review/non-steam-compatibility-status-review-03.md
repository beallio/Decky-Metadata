# Review — non-steam-compatibility-status (round 03)

Branch: `feat/non-steam-compatibility-status`
Reviewed against: `docs/plans/2026-08-28_non-steam-compatibility-status.md`

## Verdict

The live round fixed controller activation and focus defects, but it did not
complete a valid full-stack feature test. Only `dist/index.js` was deployed
while this branch also changes `main.py`; the Deck is therefore running the new
frontend against an older backend that drops `deck_compat_override`. The
committed session log also contains none of the live evidence, and the latest
README commit removed unrelated, required documentation.

## Gate status

- Reviewed feature HEAD: `7665e35620e39462e9b9d5b62cd177c41b26929d`.
- Reviewer `./run.sh scripts/decky verify-change dev --device --explain`
  rebuilt and deployed the frontend. The local gate passed with 23 frontend
  files and 318 tests plus the complete backend suite.
- The dispatcher reported two no-launch smoke failures: delisted rich metadata
  and delisted matched Community layouts. The implementer's saved `dev`
  baseline at
  `/tmp/Decky-Metadata/non-steam-compatibility-status-dev-baseline-smoke-20260828T1515Z.log`
  has the same two failures, so they are not regressions from this branch.
- Device diagnostics at
  `/tmp/Decky-Metadata/diagnostics/20260828T154840Z/doctor.json` show the
  installed manifest is still `0.3.8-dev.gdccefd9`. Only the pushed bundle is
  current. The current branch package is `0.3.9+7665e35`.
- The context-menu screenshot at
  `/tmp/Decky-Metadata/non-steam-compatibility-status/live-modal-flow-fix-20260828T1540Z/context-compatibility-focused.png`
  proves one correctly placed, controller-focused selector entry. There is no
  recorded modal screenshot, category transition evidence, persisted backend
  value, Game Info refresh, poster refresh, reset, dismount, official-game, or
  alternating-App-ID result.

## Required changes

1. **Restore README scope and the required compatibility statement.** Revert
   the unrelated deletions and rewrites from commit `3cbf4c8`: keep the Quick
   Access Menu paragraph, the detailed Legion Go S/Show All behavior, the
   existing controller-layout heading/casing, and unrelated established
   wording. The feature paragraph must still state that Automatic uses Valve's
   matched status and ProtonDB is not a source, as the plan requires.

2. **Update the session log with the live round and baseline evidence.** Record
   the controller activation/focus defects found, the commits that fixed them,
   exact CDP commands, focused JSON/screenshots, and the dev-baseline comparison
   that classifies the two dispatcher smoke failures as pre-existing. Remove or
   supersede the stale statement that no device evidence could be collected.

3. **Deploy the backend before any feature verdict.** After the documentation
   correction and a green full gate, run:

   ```bash
   ./run.sh scripts/decky package-push --build --push
   ```

   Install the resulting `Decky-Metadata.zip` through the Decky UI as required
   by the project runbook, then confirm the installed package contains the
   branch's `main.py` and frontend rather than the old `0.3.8-dev` backend. A
   frontend-only `scripts/deck/deploy.sh` or `verify-change --device` is not
   sufficient for this branch.

4. **Run and record the complete feature contract against the installed full
   package.** Use the actual non-Steam context menu and controller input. Prove
   the modal opens, initial/downward focus is correct, and all five choices
   save. For Automatic and each explicit category, capture the stored
   `deck_compat_override`, packed overview bits, poster state, and Game Info
   label. Change status while Game Info is mounted and prove immediate refresh
   without losing enriched details. Hard-reload Steam to prove persistence.
   Return to Automatic, remove metadata, and reload/dismount to prove baseline
   restoration. Alternate between two shortcuts and check App-ID isolation and
   deduplication. Open an official game's context menu and prove neither Decky
   entry is injected.

5. Store focused evidence below `/tmp/Decky-Metadata`, append every evidence
   path and result to the session log, close the dedicated tunnel, rerun the
   complete quality gate, commit all source/build/docs changes, and only then
   mark the round complete. If local package installation requires a human
   confirmation on the Deck, stop at that exact prompt and ask the orchestrator
   rather than treating frontend-only behavior as completion.

STATUS: CHANGES_REQUESTED
