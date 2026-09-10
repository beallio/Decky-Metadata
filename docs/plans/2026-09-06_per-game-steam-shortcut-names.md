# Plan: Rename individual shortcuts to matched Steam titles (per-game-steam-shortcut-names)

> **Historical plan — implementation is on `dev` (`73bb7f2`).**
> Do not relaunch it. Integration does not imply verification on every device;
> retain the recorded platform and UI limitations below.
> Use the [current workflow](../runbooks/agent-workflow.md).

## Context

Decky Metadata already resolves a non-Steam shortcut to a Steam app ID and
fetches Steam appdetails, but it does not offer to replace the shortcut's
library name with Steam's title. The user wants a per-game MVP: an explicit,
previewed action inside the existing `Decky metadata...` editor, with a safe
restore path. This plan does not add a global toggle, bulk rename, automatic
renaming, or a second top-level context-menu entry.

The prerequisite title-normalization fix is already on `dev` in commit
`a286dbe`: frontend title comparisons strip `™`, `®`, and `©` consistently.
Live read-only and reversible probes on Steam Deck and Legion Go S established
that `SteamClient.Apps.SetShortcutName(shortcutAppId, name)` updates
`appStore`, persists to `shortcuts.vdf`, keeps the shortcut app ID stable, and
preserves a custom `sort_as`. The native method returns `undefined`, so the
feature must poll the native overview and must not report success merely because
the call returned.

The official rename target must be stored separately from editable/provider
metadata. `backend/providers/steam.py::steam_appdetails_for_appid` currently
maps Steam's `data.name` into `title`; later IGN/manual saves can replace that
field. Add `steam_store_name` to the metadata contract and populate it only from
a successful Steam appdetails response. Sanitize it with
`matching.clean_game_title`: decode HTML, preserve Steam's case and punctuation,
remove only `™`, `®`, and `©`, collapse whitespace, and trim. Do not derive it
from IGN, the editable `title`, a store-search candidate, or a saved Steam URL.
If appdetails returns no usable name, no rename proposal exists.

Existing installations already have positive `steam_appid` records without the
new field, and the normal missing-metadata scan can consider those records
complete. On the first editor load for such a record, call the existing
`enrichSteamApp(appId)` once to fetch and persist appdetails before declaring
the proposal unavailable. Show `Loading Steam name...` during that request.
A network/appdetails failure leaves metadata editing and restore available,
shows `Steam did not return an official name`, and must not retry on each render.
It never renames automatically.

Restore history must survive `remove_metadata` and `clear_metadata_cache`.
Store it in a new top-level `shortcut_names` map in `decky_metadata.json`, keyed
by the native shortcut app ID, not inside `metadata`. Each value has this shape:

```text
{
  "original_name": string,   # exact native display_name before first rename
  "applied_name": string,    # exact name last requested by this plugin
  "steam_appid": number,     # matched Steam app used for that request
  "updated_at": number
}
```

The backend must preserve the first non-empty `original_name` until the state is
explicitly cleared. A later Steam-name refresh may update `applied_name` and
`steam_appid`, but never the original. Loading an older settings file adds an
empty `shortcut_names` map without rewriting unrelated data. Metadata deletion
and cache clearing leave this map intact.

Only shortcuts with an explicit positive `appid` field in `shortcuts.vdf` are
eligible. `backend/shortcuts_vdf.py` already exposes `appid_raw`; a missing raw
ID triggers the name-derived CRC fallback, which would change when the name
changes. A management-context RPC must therefore find the shortcut in
`_read_steam_shortcuts` and return:

```text
{
  "eligible": boolean,
  "reason": "ready" | "shortcut_not_found" | "derived_shortcut_id",
  "state": ShortcutNameState | null
}
```

Do not expose `shortcut_file`, executable paths, or Steam user IDs through this
RPC. The matched `steam_appid` and `steam_store_name` remain in the metadata
record already loaded by the editor.

Frontend state is classified from the exact native `display_name`; never use
`appName(appId)` for the original because `appName` deliberately cleans
trademark marks. The states are:

- `unmanaged`: no saved rename state;
- `managed`: current name exactly equals `applied_name`;
- `restored`: current name exactly equals `original_name` while a state record
  still exists, such as after a failed rename or failed state cleanup;
- `diverged`: current name equals neither saved value, meaning Steam or the user
  changed it outside this feature.

`unmanaged` and `restored` may show `Use Steam name` when a valid proposal
exists. `managed` shows `Restore original name`; if Steam later changes the
official name, restore first before applying the new proposal. `diverged` must
disable rename and restore and show `Forget saved name history`, which clears
only the plugin record after confirmation and never changes Steam.

The write sequence is state-first so a process crash cannot lose the original
name:

1. Read the exact current native name and re-check native-shortcut eligibility.
2. Persist `original_name`, proposed `applied_name`, and the current positive
   `steam_appid`; the backend preserves any existing original.
3. Call `SetShortcutName`.
4. Poll the same native shortcut overview until `display_name` exactly equals
   the requested name or a bounded timeout expires.
5. On success, update the editor state and report success. On timeout/error,
   retain the saved state and report failure; on the next load, exact-name
   classification reconciles whether Steam applied the write.

Restore performs the native write and poll first, then clears the saved state.
If state clearing fails after the native restore, report the partial failure;
the remaining record classifies as `restored` and cannot overwrite the restored
name. No code in this plan writes `shortcuts.vdf` directly.

Place a `Shortcut name` panel immediately after the existing `Steam App ID`
panel in `src/MetadataPage.tsx`. It shows the exact current shortcut name and
the cleaned Steam proposal, uses `ConfirmModal` for every persistent action,
uses the existing editor focus class on all buttons, and shares the page's
`busy` exclusion. The section must remain available for restore when metadata
has been removed. Reuse the existing context-menu entry and route unchanged.

Relevant implementation files are `backend/providers/steam.py`,
`backend/storage.py`, `main.py`, `src/types.ts`, `src/backend.ts`,
`src/steam/core.ts`, a focused `src/steam/shortcutNames.ts`,
`src/steam.ts`, `src/MetadataPage.tsx`, their tests, reversible device-smoke
helpers under `scripts/deck/`, `docs/runbooks/on-device-verification.md`,
`README.md`, `CHANGELOG.md`, `dist/index.js`, `dist/index.js.map`, and a dated
session record. Do not change matching scores, metadata auto-scan behavior,
context-menu patching, controller-layout logic, artwork, updater behavior, or
Steam's on-disk VDF directly.

**Intended user-visible outcome.** A user opens `Decky metadata...`, reviews
`Current` and `Steam` names, confirms `Use Steam name`, sees the library name
change only after Steam reports it, and can later restore the exact original.
Incorrect, missing, derived-ID, or externally changed states fail closed with a
specific explanation.

**Slug used throughout this plan:** `per-game-steam-shortcut-names`

---

## Orchestration Contract

**Slug:** `per-game-steam-shortcut-names`

**Plan file:**

```text
docs/plans/2026-09-06_per-game-steam-shortcut-names.md
```

**Implementation branch:**

```text
feat/per-game-steam-shortcut-names
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/per-game-steam-shortcut-names_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/per-game-steam-shortcut-names_finalized
```

**Review notes:**

```text
docs/review/per-game-steam-shortcut-names-review-*.md
```

Each review note ends with exactly one status trailer:

```text
STATUS: CHANGES_REQUESTED
```

or:

```text
STATUS: APPROVED
```

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. Branch from `dev`.
4. Commit this plan as the first commit on the implementation branch.
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review.
8. Do not create files under `docs/review/`.
9. Do not delete files under `docs/review/`.
10. Review notes are durable audit records and must be committed.
11. Resolving a review note means:
    - implement the requested changes;
    - run quality gates;
    - commit the code/docs changes;
    - commit the review note itself if it is not already committed;
    - recreate the round-complete marker.
12. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units the plan lists. Do not modify files outside the plan's scope.
- Do not change runtime behavior beyond what the plan specifies. A `refactor` or
  `cleanup` commit must preserve observable behavior.
- Never edit a test's expected value to make a behavior change pass. If a test
  legitimately must change, that change must be required by the plan or a review
  note, and you must record the rationale in the session log.
- If you spot an unrelated improvement, do not make it here — note it in the
  session log for a separate plan.

---

## Setup

Start from `dev`:

```bash
git checkout dev
# ORCH_LOCAL_ONLY: local trial branch, skipping origin pull
git checkout -b feat/per-game-steam-shortcut-names
```

Commit this plan first:

```bash
git add docs/plans/2026-09-06_per-game-steam-shortcut-names.md
git commit -m "docs(plan): add per-game-steam-shortcut-names implementation plan"
```

---

## Implementation Tasks

1. Route the change and establish red contracts before production edits.
   - Run the required entry checks from `AGENTS.md`:
     `scripts/decky doctor`, then
     `scripts/decky verify-change dev --explain`. Do not use `--device` or
     `--allow-launch` during this preflight.
   - Record `git status --short --branch` verbatim. The plan file is expected;
     stop for any other unexplained working-tree change.
   - Build once with `./run.sh npm run build`, then require
     `git diff --exit-code -- dist/index.js dist/index.js.map` to exit `0`.
     A non-zero exit is pre-existing bundle drift; stop rather than absorbing it.
   - Before editing production code, add the backend and frontend tests named
     in tasks 2-5. Run:
     `./run.sh uv run --with pytest -- pytest -q tests/test_steam_appdetails.py tests/test_shortcut_name_state.py`
     and
     `./run.sh npx vitest run src/steam/shortcutNames.test.ts src/MetadataPage.test.tsx`.
   - Record each red test and its assertion. Valid red failures are missing
     `steam_store_name`, missing state/capability RPC behavior, missing native
     rename/poll behavior, and missing editor actions. Import, fixture, mock, or
     syntax errors do not establish the baseline.

2. Preserve a Steam-owned rename target independently from editable metadata.
   - Extend `MetadataRecord` in `main.py` and `MetadataData` in `src/types.ts`
     with optional `steam_store_name`.
   - In `backend/providers/steam.py::steam_appdetails_for_appid`, set
     `steam_store_name` from the same successful `data.name` that supplies
     `title`. Use `matching.clean_game_title` for the new field so Steam
     punctuation/case remain and only HTML entities, `™`, `®`, `©`, duplicate
     whitespace, and edge whitespace are cleaned.
   - Extend `main.py::_sanitize_metadata` to retain the cleaned
     `steam_store_name`; an absent, non-string, empty, NUL-containing, or
     greater-than-512-code-point source becomes `""`. Do not truncate and do
     not synthesize it from `title`.
   - Add `steam_store_name` to the pinned Steam-field preservation list in
     `_merge_fetched_metadata`. A later IGN/manual metadata refresh must not
     erase an existing Steam-owned name while the same positive Steam match is
     pinned.
   - In `MetadataPage.applySteamAppId`, clear `steam_store_name` before saving
     whenever the parsed Steam app ID differs from the saved one, including a
     clear-to-null action. Only the subsequent successful `enrichSteamApp` may
     populate the new match's name; a failed enrichment must not leave the old
     app's proposal attached to the new app ID.
   - Extend `tests/test_steam_appdetails.py` to prove a payload named
     `STAR WARS™: The Force Unleashed™ II` yields the cleaned
     `steam_store_name` `STAR WARS: The Force Unleashed II`, while preserving
     the existing `title` behavior and returning no store name for unusable
     appdetails payloads. Add an enrichment-path test that uses the real
     appdetails provider with a stubbed HTTP response and asserts the sanitized
     metadata record persists that same field; do not mock
     `_steam_appdetails_for_appid` in that integration case.
   - Extend the existing merge tests in `tests/test_community_fallback.py` and
     Steam-ID editor tests in `src/MetadataPage.test.tsx` to prove same-match
     preservation and different/cleared-ID invalidation. The invalidation test
     must cover enrichment failure so a stale proposal cannot reappear.

3. Add durable, isolated shortcut-name state and eligibility RPCs.
   - Add `shortcut_names: {}` to `backend/storage.py::default_data` and merge
     that top-level map in `load_data`, preserving existing metadata, settings,
     and updater blobs. Do not add a schema rewrite or third-party dependency.
   - Define `ShortcutNameState` and `ShortcutNameManagement` TypedDicts in
     `main.py`, with the exact Context shapes and reason values.
   - Add async backend methods exposed through Decky RPC:
     `get_shortcut_name_management(app_id)`,
     `save_shortcut_name_state(app_id, original_name, applied_name, steam_appid)`,
     and `clear_shortcut_name_state(app_id)`.
   - `get_shortcut_name_management` must run VDF discovery off the event loop,
     match the exact unsigned shortcut app ID, and report eligible only when
     `appid_raw` is an explicit positive integer equal to the normalized app ID.
     Never return filesystem/user/executable fields.
   - `save_shortcut_name_state` must re-run explicit-ID eligibility off the
     event loop before taking `_data_guard`, then require that the current
     metadata record has the same positive `steam_appid` and exact
     `steam_store_name` as the requested `applied_name`. It must reject
     non-positive IDs, empty names, names containing NUL, names longer than 512
     Unicode code points, derived/missing shortcuts, and metadata mismatches
     without changing state. Preserve an existing non-empty `original_name`,
     update `applied_name`, `steam_appid`, and `updated_at`, and use the atomic
     `_save_data` path. Log app IDs and outcome only; do not log names.
   - `clear_shortcut_name_state` removes only that shortcut's name record and is
     idempotent. `remove_metadata` and `clear_metadata_cache` must not touch it.
   - Add the matching frontend types and typed callables to `src/types.ts` and
     `src/backend.ts`.
   - Add `tests/test_shortcut_name_state.py`. Cover legacy-file migration,
     preservation across metadata remove/cache clear, explicit-ID eligibility,
     missing shortcut, derived-ID rejection, original-name immutability,
     applied-name/Steam-ID updates, invalid input, metadata/app-ID/name
     mismatches leaving state unchanged, idempotent clear, atomic round-trip,
     invalid top-level `shortcut_names` input, and absence of sensitive fields
     in the management response.

4. Implement a typed, fail-closed Steam shortcut-name boundary.
   - Add a minimal `SteamAppsBoundary` to `src/types.ts` with optional
     `SetShortcutName(appId: number, name: string): void`, and type
     `SteamInternals.SteamClient.Apps` with it. Do not widen unrelated Steam
     internals.
   - Add `src/steam/shortcutNames.ts` and export its public functions through
     `src/steam.ts`.
   - Provide `nativeShortcutName(appId)` that reads
     `getNativeOverview(appId).display_name` verbatim except edge whitespace.
     It must require `isNativeNonSteamShortcut`; do not call `appName`, which
     strips symbols.
   - Provide a pure state classifier returning `unmanaged`, `managed`,
     `restored`, or `diverged` with the exact semantics in Context.
   - Provide `setShortcutNameAndWait(appId, expectedCurrent, target)` that
     rejects an invalid app ID, empty target, missing native shortcut, changed
     current name, or unavailable native API before mutation. Call
     `SetShortcutName`, then poll the exact native overview for at most three
     seconds. Resolve only with the observed target; reject with a specific
     timeout/API/state error otherwise.
   - Do not optimistically mutate `display_name`, write VDF, change `sort_as`,
     retry the native write, or treat the native method's `undefined` return as
     success.
   - Add `src/steam/shortcutNames.test.ts` with fake timers and native-store
     fixtures. Cover all four classifications, verbatim original-name capture,
     missing API, official app, current-name race, empty target, delayed
     observed success, timeout without an overview update, and exactly one
     native call. The negative cases must assert that `SetShortcutName` was not
     called.

5. Add the explicit per-game editor workflow without changing the context menu.
   - In `src/MetadataPage.tsx`, load metadata and
     `getShortcutNameManagement(appId)` with independent error handling
     (`Promise.allSettled` or equivalent), not one rejecting `Promise.all`.
     Maintain the exact current native name and management state separately
     from the editable metadata form. A state-load failure shows an unavailable
     status and disables name actions; it must not block ordinary metadata
     editing.
   - When loaded metadata has a positive `steam_appid` but no
     `steam_store_name`, invoke the existing `enrichSteamApp(appId)` exactly
     once for that editor entry, update the form/cache from a successful result,
     and expose the resulting proposal. Show `Loading Steam name...` while it
     runs. A failed or empty enrichment shows
     `Steam did not return an official name`, does not loop or toast success,
     and leaves metadata save plus any existing restore action usable.
   - Render `PanelSection title="Shortcut name"` immediately after the existing
     Steam App ID panel. Show `Current` and, when present, `Steam` values. Keep
     exact names visible to the user, but do not put them in logs.
   - For `unmanaged` or `restored`, show `Use Steam name` only when management
     eligibility is `ready`, `steam_appid` is positive, and
     `steam_store_name` is non-empty and differs exactly from the current name.
     If names are equal, show `Shortcut name already matches Steam`.
   - `Use Steam name` opens `ConfirmModal` titled `Use Steam name?` with the
     current-to-proposed change and `strOKButtonText="Use Steam name"`. On
     confirmation, re-read the native current name, save the state first, call
     `setShortcutNameAndWait`, update the local state/name only after observed
     success, and show the existing success/error toast style.
   - For `managed`, show `Restore original name`. Its modal title is
     `Restore original shortcut name?`; after confirmation, require the current
     name still equals `applied_name`, call and observe the restore, then clear
     backend state. If state clearing fails after the restore, show an accurate
     partial-failure message and reload management state.
   - For `diverged`, show that the shortcut changed outside Decky Metadata,
     disable rename/restore, and offer `Forget saved name history`. Confirming
     it clears only plugin state and leaves the current Steam name untouched.
   - Keep the section visible in a managed/diverged state even when metadata is
     absent, so `Remove metadata` cannot strand the user without recovery.
     Missing Steam name, missing shortcut, derived ID, and unavailable API each
     get a specific non-success status.
   - Reuse `busy` to prevent overlapping save, rename, restore, search, and
     remove operations. Every new control uses
     `editorFocusTargetClassName`. Do not add timers that call DOM `focus()`.
   - Extend `src/MetadataPage.test.tsx` and its existing hook harness/mocks.
     Prove panel placement, no second context-menu behavior change, proposal
     eligibility, equal-name no-op, one-time legacy backfill success, no
     render-loop retry after backfill failure, state-first call order, observed
     success, rename failure, guarded restore, clear-after-restore, clear
     failure, diverged fail-closed behavior, forget-without-Steam-write,
     metadata removal preserving restore UI, unavailable management or
     appdetails not blocking metadata save/restore, and busy-state exclusion.

6. Add a reversible on-device smoke for the actual editor controls.
   - Add `scripts/deck/verify/smoke_shortcut_name.sh` plus the minimum
     parameterized JS under `scripts/deck/js/` needed to read an exact native
     shortcut name and perform emergency cleanup. Drive normal rename and
     restore through `/decky-metadata/$SHORTCUT_APPID` and the visible
     `Use Steam name` / `Restore original name` confirmation controls using the
     committed navigation and click helpers; do not prove the feature by calling
     `SetShortcutName` directly.
   - Require explicit shortcut app ID and expected cleaned Steam name arguments.
     Preflight a native shortcut, no running game, explicit backend eligibility,
     non-empty/different target, and an initially unmanaged state. Any missing
     precondition is a loud failure, not a skip.
   - Capture the original exact name and `sort_as` before mutation. Install a
     shell `trap` before the first UI action that restores the original through
     the native API if any later assertion fails, then verifies the exact name.
     Serialize cleanup names through base64 or JSON; never interpolate raw user
     text into JavaScript.
   - After the UI rename, require the exact target in `appStore`, hard-reload
     SteamUI, wait for `READY`, and require the same target again to prove
     persistence. Reopen the editor, drive the UI restore, require the exact
     original name, hard-reload again, and require the original name and
     original `sort_as`. Verify the page has returned to the unmanaged state.
   - Store evidence only below `/tmp/Decky-Metadata`. Machine-readable evidence
     may contain app IDs, booleans, status values, timing, and hashes, but not
     raw names, executable paths, Steam user IDs, or unredacted settings.
     User-approved screenshots may show only the two known fixture titles and
     must exclude account identifiers and unrelated library entries.
   - Add shell-level fixture checks that prove the smoke fails loudly when the
     app ID is absent, the expected target is empty, the target equals current,
     or the editor never exposes the expected control. Put all assertions
     before the script's final pass/fail guard.
   - Document the smoke, its persistent-but-reverted mutation, cleanup
     guarantees, approval requirement, and commands in
     `docs/runbooks/on-device-verification.md`. Do not add it to default
     `run_all.sh`; it requires explicit per-device authorization and fixture
     arguments.

7. Complete user and implementation records.
   - Update `README.md` under `## Get started`: after saving a valid Steam match,
     the game's existing `Decky metadata...` editor can preview, apply, and
     restore Steam's cleaned shortcut name. State that names never change
     automatically.
   - Add an Unreleased `### Added` entry to `CHANGELOG.md` describing per-game,
     confirmed Steam-name application and exact original-name restore.
   - Record data shapes, persistence ordering, failure reconciliation, red/green
     and mutation evidence, quality-gate counts, package/install results, both
     device results, cleanup results, and any explicit deferral in
     `docs/agent_conversations/2026-09-06_per-game-steam-shortcut-names.md`.
   - Run `./run.sh npm run build` and commit regenerated `dist/index.js` and
     `dist/index.js.map`. Do not commit ZIP files, caches, screenshots, raw
     settings, or `/tmp` evidence.

---

## Quality Gates

Run before marking any round complete:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless:

1. all requested implementation work is done;
2. all relevant tests pass;
3. build/typecheck gates pass;
4. review notes have not been deleted;
5. the working tree is clean;
6. all code/docs changes are committed.

---

## Verification

Follow
`skill://orchestration-plan-author/references/verification-standards.md`.

1. Prove the focused contracts are red before production edits.
   - Run the two focused commands from implementation task 1.
   - Record each failing test name and assertion. Require failures in the
     missing behaviors, not test setup.

2. Turn the focused contracts green and report exact tallies.
   - Run:
     `./run.sh uv run --with pytest -- pytest -q tests/test_steam_appdetails.py tests/test_shortcut_name_state.py`
     and
     `./run.sh npx vitest run src/steam/shortcutNames.test.ts src/MetadataPage.test.tsx`.
   - Record file/test pass and fail counts. Then run the full backend and
     frontend suites and record their counts:
     `./run.sh uv run --with pytest -- pytest -q` and
     `./run.sh npm test`.

3. Run four isolated mutation controls after the green focused checks. Revert
   each mutation before the next.
   - Remove only the provider assignment of `steam_store_name`; require the
     direct appdetails mapping test and the backend enrichment-preservation test
     to fail.
   - Make `setShortcutNameAndWait` resolve immediately after the native call;
     require the no-overview-update timeout test to fail.
   - Make `save_shortcut_name_state` overwrite an existing `original_name`;
     require the original-name immutability test to fail.
   - Treat `diverged` as renameable; require the classifier and editor
     fail-closed tests to fail.
   - After restoring all four implementations, rerun both focused commands and
     require them to return to the step-2 green tallies.

4. Prove negative controls before the positive UI path.
   - Frontend tests must show that official apps, missing API, current-name
     races, empty targets, derived IDs, missing appdetails names, and diverged
     histories produce no native write and no success toast.
   - Backend tests must show `remove_metadata` and `clear_metadata_cache` leave
     name history intact and that management responses omit filesystem/user
     fields.
   - Device smoke fixture tests must produce their named `FAIL:` output and
     non-zero exit for missing app ID, empty/equal target, and absent UI
     control. Exit 127 or missing output is not an acceptable negative result.

5. Run the repository gates before any device mutation.
   - Run:

     ```bash
     scripts/orchestration/run-quality-gates
     scripts/orchestration/check-review-notes-not-deleted
     git diff --check
     ```

   - Record TypeScript, build, Vitest, Python byte-compile, and pytest output.
     A generated-bundle diff is expected; any unrelated generated or cache file
     is a failure.

6. Install the full local package on both devices because `main.py` and
   `backend/` change.
   - Obtain explicit authorization for each device before package installation
     and for any controller-cache query or game launch. Run
     `scripts/decky doctor --deck` with `DECKY_DECK_HOST=steamdeck`, then with
     `DECKY_DECK_HOST=steamdeck-legos`; either unavailable host is deferred
     verification and must be reported by name.
   - Build and send the ZIP to each device:

     ```bash
     DECKY_DECK_HOST=steamdeck scripts/decky package-push --build --push
     DECKY_DECK_HOST=steamdeck-legos scripts/decky package-push --build --push
     ```

     Install `/home/deck/Downloads/Decky-Metadata.zip` through Decky Loader's
     QAM **Install Plugin from ZIP File** workflow on each device; do not put a
     local path in the URL field. Use the `decky-local-zip-gui-install` skill
     for this step.
   - After each install, run `scripts/decky capture` and fail unless the
     installed manifest/version is the just-built local commit.

7. Run the persistent-and-restored UI smoke on each installed device. Run the
   negative UI control first, then the positive path.
   - For the known delisted fixture `3497159354`, open
     `/decky-metadata/3497159354` and require the absence of `Use Steam name`
     with the exact disabled/explanation state. Do not mutate its name.
   - For the known listed fixture `2312439508`, require the preflight metadata
     `steam_appid=15100` and cleaned proposal
     `Assassin's Creed: Director's Cut Edition`, then run:

     ```bash
     DECKY_DECK_HOST=steamdeck CDP_PORT=18083 \
       scripts/deck/verify/smoke_shortcut_name.sh \
       2312439508 "Assassin's Creed: Director's Cut Edition"

     DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 \
       scripts/deck/verify/smoke_shortcut_name.sh \
       2312439508 "Assassin's Creed: Director's Cut Edition"
     ```

   - Record each smoke's real pass/fail result and redacted evidence path.
     Success requires both post-reload persistence and final restoration of the
     original exact name and `sort_as`; a pass before cleanup is invalid.
   - Open the editor fresh, capture a screenshot below
     `/tmp/Decky-Metadata/per-game-steam-shortcut-names/`, and use
     `gpfocus_dump.js` plus D-pad input to prove initial focus, visual order,
     confirmation-modal focus, cancellation without mutation, and focus return
     to the launching control. Store no raw names in JSON evidence.

8. Prove existing Steam surfaces remain isolated after the restored smoke.
   - With per-device approval, run
     `scripts/deck/verify/run_all.sh --no-launch` on each device and record every
     sub-check result.
   - With each device already on the correct Warhammer controller chooser,
     run the existing bounded controller-tab smoke using the established
     fixtures:

     ```bash
     DECKY_DECK_HOST=steamdeck CDP_PORT=18083 \
       scripts/deck/verify/smoke_controller_tab_persistence.sh \
       2155012430 55150 4 \
       /tmp/Decky-Metadata/per-game-steam-shortcut-names/steamdeck-controller.json

     DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 \
       scripts/deck/verify/smoke_controller_tab_persistence.sh \
       3213262460 55150 102 \
       /tmp/Decky-Metadata/per-game-steam-shortcut-names/legos-controller.json
     ```

   - Never select, preview, apply, export, or save a controller layout. Close
     both dedicated tunnels and require `tunnel.sh status` to report `down`.

9. Route the final committed change through the project dispatcher.
   - Run `scripts/decky verify-change dev --explain`. Record its classification
     and required checks.
   - Run `scripts/decky verify-change dev --device` only with current
     Steam Deck authorization. If it reports an outstanding launch check, do
     not add `--allow-launch` without separate explicit authorization and an
     explicit `MATCHED_APPID`; record the exact deferred check.
   - Device unavailability, missing GUI installation, absent controller route,
     or unapproved launch is unverified work, not a pass. Do not mark the round
     complete unless all required verification is complete or the orchestrator
     records an explicit user-approved deferral.

10. Finish with the positive proof and clean state.
    - After all negative controls, mutations, and device failure-path checks,
      rerun the focused backend/frontend commands and the reversible positive
      UI smoke. Record their exact green tallies and the smoke's final restored
      state.
    - Run the Quality Gates section exactly, commit all in-scope files, and
      require `git status --short` to be empty.
    - State explicitly that bulk rename, automatic rename, global settings,
      second context-menu entries, direct VDF writes, and unapproved game launch
      were not implemented or exercised.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished per-game-steam-shortcut-names
```

This writes:

```text
/tmp/Decky-Metadata/per-game-steam-shortcut-names_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer per-game-steam-shortcut-names`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/per-game-steam-shortcut-names-review-*.md
```

When a review note exists or a new review note appears:

1. Read the full review note.
2. If the note ends with:

   ```text
   STATUS: CHANGES_REQUESTED
   ```

   then resume work.

3. Clear the round-complete marker:

   ```bash
   scripts/orchestration/clear-finished per-game-steam-shortcut-names
   ```

4. Address every requested change.
5. Run quality gates:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   ```

6. Commit code/docs fixes.
7. Commit the review-note file itself if it is not already committed:

   ```bash
   git add docs/review/per-game-steam-shortcut-names-review-*.md
   git commit -m "docs(review): record per-game-steam-shortcut-names review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished per-game-steam-shortcut-names
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer per-game-steam-shortcut-names` after the next review note is created.

---

## Approval Handling

If the latest review note ends with:

```text
STATUS: APPROVED
```

then:

1. Confirm every previous review item has been addressed.
2. Confirm all review notes are committed:

   ```bash
   scripts/orchestration/check-review-notes-committed per-game-steam-shortcut-names
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize per-game-steam-shortcut-names
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/per-game-steam-shortcut-names_finalized
   ```

6. Stop polling and exit cleanly.

---

## Review Rules

Do not write your own review.

Do not create files under:

```text
docs/review/
```

Do not delete files under:

```text
docs/review/
```

Only the orchestrator writes review notes. Your job is to read them, resolve them, commit them as audit records, and continue the loop.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize per-game-steam-shortcut-names
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/per-game-steam-shortcut-names_finished
/tmp/Decky-Metadata/per-game-steam-shortcut-names_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
