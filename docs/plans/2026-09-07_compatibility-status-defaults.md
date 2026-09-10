# Plan: Add global compatibility defaults and Follow Valve (compatibility-status-defaults)

> **Historical plan — implementation is on `dev` (`ae29f34`).**
> Do not launch this completed plan again. Global-scope behavior was extended
> by the four-scope implementation in `34e52a5`.
> See the [current compatibility contract](../specs/compatibility-status.md);
> the instructions below describe the original task.

## Context

Implement [issue #12](https://github.com/beallio/Decky-Metadata/issues/12):
let users select one compatibility default for their non-Steam library instead
of editing each shortcut. The policy covers **existing and new shortcuts,
matched and unmatched**, with a separate per-game **Follow Valve** option.
It is not a creation-time default or a bulk metadata edit. On 2026-09-08,
the user approved deferring the active game's compatibility update until
they leave Game Info. This timing rule supersedes the earlier immediate
active-Game-Info refresh requirement.

### Agreed user interface and behavior

In the QAM Metadata section, add **Default compatibility status**, with these
options in order:

1. **Automatic — use matched Steam status**
2. **Verified**
3. **Playable**
4. **Unsupported**
5. **Unknown**

Automatic is the initial global setting. Help text must state that this
setting applies to existing and new non-Steam shortcuts, including games with
a Steam match, and that per-game choices take priority.

Save the policy immediately after a successful backend write. Apply it to
other eligible shortcuts immediately. If the current game's **Game Info**
view is active, retain that game's currently applied compatibility state
and rich view until the user leaves Game Info. A different tab, a different
page/game, or opening the metadata editor ends that protection. Opening or
closing QAM or a context-menu overlay alone does not.

The active game's badge/filter state can therefore remain temporarily old.
Apply the latest effective policy after the exit, and show it when the user
returns. The context-menu **Decky metadata...** entry opens a separate editor
route; an ordinary editor Save still applies its choice normally. Explain
this distinction in QAM help, the README, and the scenario specification.

In the existing per-game metadata editor, replace the old Automatic option.
The **Compatibility status** options, in order, become:

1. **Use global default**
2. **Follow Valve**
3. **Verified**
4. **Playable**
5. **Unsupported**
6. **Unknown**

Resolve a native non-Steam shortcut as follows:

| Per-game choice | Resolution |
| --- | --- |
| Verified, Playable, Unsupported, or Unknown | Use that exact category, regardless of the global default or Valve data. |
| Follow Valve | Use the available category for the matched Steam game. Ignore the global default completely. If no matched category is available, restore/leave the original Steam shortcut status. |
| Use global default, with a numeric global choice | Use the global choice even when a matched Steam game has a different status. |
| Use global default, with global Automatic | Use the available matched category; otherwise restore/leave the original Steam shortcut status. |

Valve category **Unknown (0)** is an available category, not missing data.
Never use truthiness to distinguish Unknown from an unset value. Missing
Valve data and an explicit Unknown choice are different states.

"Original Steam status" means the shortcut's native status before this
plugin's compatibility mutation, not a previously applied global value.
Preserve native status when no policy category resolves; normally it is
Unknown. Unknown uses Steam's native no-badge presentation on Home/grid;
do not invent an Unknown icon. A manually selected status does not represent
Valve certification or establish emulator performance.

### Public interfaces and stored data

Use the existing JSON settings and per-game metadata stores; do not add a
second per-game preferences store, redundant mode field, or provider.

- `settings.deck_compat_default: 0 | 1 | 2 | 3 | null`.
  Missing or null means global Automatic. Category mapping remains
  0=Unknown, 1=Unsupported, 2=Playable, 3=Verified.
- Extend existing `MetadataData.deck_compat_override` and Python
  `MetadataRecord.deck_compat_override` to
  `0 | 1 | 2 | 3 | "valve" | null`.
  The exact string `"valve"` means Follow Valve; null or absent means
  Use global default. Define a shared TypeScript `DeckCompatibilityOverride`
  type rather than repeating unions in the editor.
- Keep `deck_compat_category` provider-owned and numeric-or-null. Never write
  the global default or `"valve"` into that field.
- Add `get_compatibility_default()` and
  `set_compatibility_default(category)` RPCs, each returning the persisted
  numeric-or-null global value, with typed `getCompatibilityDefault` and
  `setCompatibilityDefault` bridges in `src/backend.ts`. Reject invalid
  setter arguments without changing settings; errors propagate as failed RPCs.
  In Python, reject booleans as category arguments despite `bool` being an
  `int` subclass. Sanitize an invalid persisted global value to Automatic on
  load. Keep unrelated metadata coercion rules unchanged.
- Preserve existing numeric per-game choices, including 0. Existing
  null/absent Automatic records become Use global default, not Follow Valve.
  With the initial global Automatic setting, their visible behavior stays
  unchanged. Later opting into a numeric default intentionally affects them.
  No eager rewrite of every metadata record is required.
- Per-game omitted fields retain their previous choice during normal
  save/merge flows; explicit null resets to inheritance; `"valve"` selects
  the bypass. Metadata refresh, enrichment, and Steam-match changes must
  preserve these choices. Removing a metadata record removes its per-game
  choice under existing semantics; the shortcut then inherits the global
  setting. Clearing metadata must not reset the global setting.

### Current architecture and evidence

- `backend/storage.py` provides defaults, settings merge, and atomic JSON
  replacement. `main.py` owns locked settings RPCs, metadata sanitization,
  save/merge, enrichment, and cache removal.
- `src/steam/metadataPatch.ts` currently resolves explicit numeric override
  before fetched category, writes the packed compatibility low nibble,
  captures/restores original values, handles overview replacement, and
  publishes compatibility revisions. Startup/cache paths mainly process
  metadata IDs; they currently miss shortcuts without records.
- `src/steam/core.ts` contains native shortcut guards and compatibility
  state. `getNativeOverview()` scans the app list. Repeating it once per
  shortcut during a global update would give quadratic work.
- `src/steam/libraryCompatibilityIndicators.tsx` installs native Home/grid
  indicators. `src/steam/routerPatches.ts` and `src/steam/activity.ts` apply
  refreshed metadata. All must use the same policy.
- `src/ContentPanel.tsx` and
  `src/components/qam/MetadataSection.tsx` own the QAM settings surface;
  `src/MetadataPage.tsx` owns per-game editing.
- Read-only Deck research on 2026-09-07 found 18 native non-Steam shortcuts,
  four without metadata records. An unmatched shortcut with a manual
  Verified override already had native packed value 15. This establishes
  the existing mechanism, not proof of the unimplemented global feature.
  Evidence was saved under
  `/tmp/Decky-Metadata/issue12-compatibility-evidence.json` and
  `/tmp/Decky-Metadata/diagnostics/20260907T175849Z/`.
  These are temporary research artifacts, not required future fixtures.

### Scope and dependencies

Scope includes the frontend/backend files above, `src/types.ts`,
`src/backend.ts`, `src/steam.ts`, `src/index.tsx`, their affected tests,
`README.md`, `CHANGELOG.md`, the existing on-device runbook, a new durable
compatibility specification, and the implementation session log described
below. Regenerate committed `dist/index.js` when the frontend changes.
Change other callsites only where needed to consume the changed contract.

Use existing TypeScript/React, Decky UI/API, Python standard-library storage,
and Steam patch mechanisms. No new npm or Python dependency is needed.
Do not add emulator detection, ProtonDB support, a per-game bulk writer,
background polling infrastructure, unrelated settings refactors, release
version changes, or automatic publishing.

This document authorizes no immediate implementation, device mutation, or
external implementer launch. At execution time, inspect orchestration
ownership before starting: the planning-time status report included older
IMPLEMENTING/FINALIZING entries. Their age, branch, or missing session does
not prove they are closed. Resolve ownership through read-only `status` /
`recover` and the prescribed lifecycle; never mix external and native writers.

**Slug used throughout this plan:** `compatibility-status-defaults`

---

## Orchestration Contract

**Slug:** `compatibility-status-defaults`

**Plan file:**

```text
docs/plans/2026-09-07_compatibility-status-defaults.md
```

**Implementation branch:**

```text
feat/compatibility-status-defaults
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/compatibility-status-defaults_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/compatibility-status-defaults_finalized
```

**Review notes:**

```text
docs/review/compatibility-status-defaults-review-*.md
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
git checkout -b feat/compatibility-status-defaults
```

Commit this plan first:

```bash
git add docs/plans/2026-09-07_compatibility-status-defaults.md
git commit -m "docs(plan): add compatibility-status-defaults implementation plan"
```

---

## Implementation Tasks

### 1. Establish the stored contract and preservation rules

1. Before implementation, run `scripts/decky doctor` and
   `scripts/decky verify-change dev --explain` using the normal wrapper/cache
   policy. Capture actual failures; do not replace device requirements with
   static-only checks. Check symbol references with LSP when available
   (none was configured during plan authoring); otherwise inspect all
   affected callers explicitly.
2. Extend the types, defaults/load sanitation, Python metadata sanitizer,
   RPCs, and typed frontend bridges to the public contract above. Reuse
   `_data_guard`, `_load_data`, `_save_data`, and atomic storage.
3. Make a failed global save leave the previous persisted and in-memory
   setting authoritative. Do not publish the requested value into runtime
   compatibility state until the backend confirms the write. Handle a
   failed initial settings load as an error, not a successful saved
   Automatic value; prevent the QAM from overwriting an unknown setting.
4. Preserve `"valve"` exactly as a user choice through editor saves,
   provider merge, enrichment, scans, and Steam App ID reassignment. An
   absent override field must not erase it. An explicit null must erase it.
   Do not retain a fetched category from a previous match as current Valve
   data after a match changes or is removed.
5. Keep no-record inheritance lightweight: selecting a global default must
   not create metadata records or change metadata counts. Selecting a
   per-game mode for a shortcut without a record may use the existing
   sanitized metadata-shell save path.

Acceptance: an old settings file loads with global Automatic, legacy numeric
choices remain exact, `"valve"` survives a save/reload and provider refresh,
and a failed/invalid global setter does not change the prior value.

### 2. Use one policy across startup, mutation, and rendering

1. Extend the existing effective-category helper to take both per-game
   metadata and the current global default. Migrate every caller and test;
   do not keep a legacy resolver with different semantics. It must work
   when metadata is undefined. Return the existing unresolved sentinel for
   native-baseline restoration rather than treating unresolved as numeric 0.
2. Load global policy as part of plugin startup, not only when QAM opens.
   Keep one shared, confirmed setting for Steam patches, cards, and both
   editors. Integrate with existing cache/bootstrap and compatibility
   revision lifecycles. Handle settings and metadata arriving in either
   order, and late results after a successful save or plugin dismount:
   stale async results must not overwrite a newer choice or reapply status
   after teardown. Do not add an independent endless polling loop.
3. Add a compatibility-only, linear pass over exact native shortcut
   overviews for startup and confirmed global changes. Reuse entry-based
   application with already-resolved native objects; do not call the
   full-library-scanning `getNativeOverview()` for each entry. Do not
   perform enrichment, network requests, full metadata application, or
   detail/activity mutations merely to change a global status.
4. Apply the same policy through existing new/replacement overview hooks.
   A shortcut added after bootstrap inherits the default when its native
   overview exists. Preserve an active Game Info view's held compatibility
   state through native overview replacement until its pending update is
   released. VDF-only IDs wait for a real native overview; never fabricate
   Steam overview objects or metadata records to cover them.
5. Restructure the missing-metadata early return in `applyMetadata()` so
   it still clears removed Activity data but applies inherited
   compatibility. Retain metadata-dependent enrichment guards. Cache
   removal/clear removes per-game choices and recomputes inheritance,
   rather than always forcing baseline restoration.
6. Preserve exact native AppID/shortcut guards in every path. Do not write
   through a matched official-AppID alias or affect regular Steam games.
   Preserve packed bits above the low nibble; capture the native baseline
   before mutation and reuse the established safe native publication path.
   Do not replace the current system with plain-object clones or broad
   store replacement based on superseded historical plans.
7. For eligible, non-deferred entries, apply changed packed values before
   publishing the shared revision. Notify once per batch, not per shortcut.
   Keep no-op updates from causing write/publication churn. Home/grid and
   native compatibility filters must reflect the applied state; a protected
   active game's state changes only when its deferred update is released.
8. Returning to Automatic or following Valve without a resolved category
   ultimately restores the native baseline, not a prior global category.
   While Game Info is active, that change follows the same deferral rule.
   Real plugin dismount is different: clear pending work and restore every
   touched baseline immediately. Late callbacks must not reapply it.
   Preserve the existing safe in-place reload handoff and linear restoration.
   Never enumerate MobX store instances within a render-phase tree walk.

Acceptance: existing/no-record/new shortcuts receive the policy without
metadata creation; per-game exceptions remain authoritative; ordinary Steam
games remain unchanged. Other games and their native filters update
immediately. The active Game Info view stays intact and keeps its applied
status until exit, then receives the latest policy without a manual reload.

### 2a. Defer active Game Info changes until the view exits

1. Use the authoritative main-window route/tab state to identify the exact
   active Game Info app. Do not mistake a QAM/context-menu overlay for an
   exit, or defer every subsection merely because it belongs to the same
   game. Reuse the current history/navigation subscription patterns.
2. Keep pending work in memory, keyed by the exact native shortcut App ID.
   Retain the currently applied compatibility nibble while that view is
   protected. Do not overwrite it with the newly desired category just to
   delay a later publication. Preserve unrelated packed bits.
3. Queue only the need to recompute/apply; do not make an old captured
   category authoritative. Repeated global changes collapse to the latest
   effective policy. A later fixed per-game choice, Follow Valve selection,
   match change, or removal must win when pending work is released.
4. On leaving Game Info, resolve the current native overview and current
   policy, release eligible pending updates in a bounded batch, and invalidate
   native collections normally. If a different game's Game Info is entered,
   do not transfer the old game's pending state to the new game.
5. Native overview replacement while pending must retain the held state and
   App ID. A deleted shortcut must not be recreated. On actual teardown,
   clear the queue and cancel callbacks; an in-place reload must preserve or
   reconstruct the pending intent from the saved policy and held native state
   without forcing an active-view refresh.
6. Remove live Game Info force-refresh, renderer-discovery, and timing
   machinery that is no longer needed by this policy. Do not leave a second
   immediate-update path alongside the deferred one. Retain ordinary metadata
   rendering, safe launch classification, library badges, native publication,
   and reload cleanup.
7. Test the user-visible transition and latest-policy precedence, not private
   queue length or callback counts. Confirm both same-game tab exit and opening
   the metadata editor release the update, while closing QAM alone does not.

### 3. Add the QAM default and per-game Follow Valve option

1. Add the global dropdown to the existing QAM Metadata section before
   the Metadata cache subsection. Keep the current initial summary focus
   and D-pad order. Use the native `DropdownItem` pattern already in the
   metadata editor; do not introduce another settings page.
2. Show the exact global and per-game option lists in Context. Keep the
   global list numeric-or-Automatic: Follow Valve is a per-game bypass,
   not a redundant extra global option.
3. Disable the global control while initial loading or a save is pending.
   On save failure, retain the previous confirmed choice and status and
   show an error. Avoid overlapping saves and late-load reversion.
4. Preserve the editor's existing Save behavior: selecting a per-game
   option edits the draft; compatibility changes only after a successful
   Save. An unrelated metadata edit must not reset the compatibility
   choice. A global-policy revision may update effective display text
   while preserving an unsaved per-game draft.
5. Show the resolved result without disguising its source, for example:
   - `Use global default (Verified)`
   - `Use global default (Playable — from Valve)`
   - `Follow Valve (Playable)`
   - `Follow Valve (unavailable — original Steam status)`
   - `Use global default (Automatic — original Steam status)`
   - `Unsupported` for a numeric per-game choice.
   Use original/Unknown wording truthfully; do not label a nonzero native
   baseline Unknown merely because provider metadata is missing.
6. Include help text explaining Follow Valve bypass and its no-data
   behavior, and that manual/global categories are user-selected rather
   than Valve certification. Keep the controls usable with controller
   navigation and prevent helper text from clipping.

Acceptance: a user can set a global Verified default, save Follow Valve
for one matched shortcut, and see that shortcut follow Valve while another
inherits Verified. Both selections persist across plugin restart.

### 4. Protect the meaningful behavior boundaries

Extend existing tests rather than adding parallel test infrastructure:

- `tests/test_deck_compat.py` and
  `tests/test_steam_appid_override.py`: union sanitation, null versus 0
  versus `"valve"`, preservation through save/merge/enrichment, and match
  removal/reassignment. Use the current storage/settings test patterns
  for absent global keys, save/reload, invalid setter input, unrelated
  settings preservation, and failed writes.
- `src/steam/metadataPatch.test.ts`: policy precedence, no-record
  application, startup without opening QAM, a shortcut arriving after
  bootstrap, incoming/native overview replacement, baseline restoration,
  explicit Unknown, official/alias exclusion, metadata removal, and
  stale async settings completions including dismount.
- `src/steam/libraryCompatibilityIndicators.test.tsx`: visible
  transitions for inherited/default, Follow Valve, numeric Unknown, and
  late metadata, including a mounted no-record card. Test visible status
  and cleanup, not internal listener counts or exact component wiring.
- `src/MetadataPage.test.tsx` and
  `src/ContentPanel.updateSettings.test.tsx`: persisted user choices,
  global/per-game isolation, Save/cancel/failure behavior, late settings
  load, and preservation of unsaved drafts. Update affected activity and
  router tests only for changed observable contracts.

Use the scenario matrix below to select distinct boundaries, not as an
instruction to create a repetitive full Cartesian-product test suite.
Remove in-scope tests that pin only option wording/order or implementation
wiring; replace them only where a real behavioral boundary needs coverage.
Prove option presentation and controller order on the actual UI.

### 5. Update user documentation and the durable behavior specification

This documentation is a required deliverable, not a follow-up:

1. Update `README.md` under **Set the compatibility status**. Show both
   dropdowns and explain existing/new and matched/unmatched coverage.
   Document save-now/apply-on-exit behavior for the active Game Info view,
   immediate updates for other games, what counts as leaving the view, and
   the context-menu-to-editor flow. Explain Follow Valve, fixed exceptions,
   Unknown, no-data fallback, and the user-selected-status caveat.
2. Add `docs/specs/compatibility-status.md` as the durable behavior
   reference. Include the stored data contract, upgrade mapping, exact
   resolution rules, lifecycle/cache-removal behavior, and **every row**
   of the scenario matrix below. Link it from the README. Use plain
   language for the user-facing section and a separate technical section
   for category values and persistence details.
3. Put a concise scenario subset directly in the README: inherited Verified
   on matched/unmatched games; Follow Valve with available/missing/Unknown
   data; fixed exceptions; Automatic; and active-view deferral, including
   multiple changes before exit and opening the metadata editor.
4. Update the on-device runbook with deferred active-view, latest-policy,
   native replacement/reload, no-record, native filter, and controller checks.
   State mutation approval, fixture baseline/restore, full-package install,
   and evidence requirements. Do not retain instructions that require the
   active Game Info view to update immediately.
5. Add the behavior to the existing `CHANGELOG.md` Unreleased section;
   do not roll a release or change package/plugin versions.
6. After verification, record the implementation decisions, actual
   commands/results, screenshots/evidence paths, and unresolved checks in
   `docs/agent_conversations/<execution-date>_compatibility-status-defaults.md`.
   If existing screenshots are replaced, update their README
   `cacheBuster` values. Do not claim older screenshots show the new
   options. Remove throwaway test scripts and mutation copies when done,
   while retaining required evidence under `/tmp/Decky-Metadata`.

Acceptance: the README answers "does this affect existing and matched
games?" without requiring code inspection, and the linked specification
contains both dropdowns and the complete scenario matrix.

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
Record actual command exit codes and test tallies. Do not hide failing
producer commands behind pipelines or successful outer commands.

### Scenario matrix: required behavior and documentation

`Original` means the untouched native shortcut status, normally Unknown.
Rows apply to native non-Steam shortcuts unless they say otherwise. S01-S32
describe the resolved outcome after an update is eligible to apply. The
active-view timing and lifecycle rules in S33-S40 also apply; they supersede
older expectations of an immediate active Game Info refresh.

| ID | Global setting | Per-game choice / condition | Expected result |
| --- | --- | --- | --- |
| S01 | Automatic | Legacy null/absent override; matched Valve Playable | Playable; editor selects Use global default. |
| S02 | Verified | Existing unmatched shortcut; Use global default | Verified. |
| S03 | Verified | Existing matched shortcut; Valve Unsupported; Use global default | Verified, not Unsupported. |
| S04 | Verified | Native shortcut has no metadata record | Verified; no record or metadata-count increase. |
| S05 | Verified | Shortcut added after startup/bootstrap; matched or unmatched | Verified when its native overview appears, without opening the editor. |
| S06 | Playable | Use global default; Valve Verified | Playable. |
| S07 | Unsupported | Use global default; Valve Verified | Unsupported. |
| S08 | Unknown | Use global default; Valve Verified | Unknown; remove any previous positive badge. |
| S09 | Unsupported | Per-game Verified | Verified. |
| S10 | Verified | Per-game Playable | Playable. |
| S11 | Verified | Per-game Unsupported | Unsupported. |
| S12 | Verified | Per-game Unknown (0) | Unknown; no fallback to global or Valve. |
| S13 | Verified | Follow Valve; matched Valve Playable | Playable; global is ignored. |
| S14 | Verified | Follow Valve; matched Valve Unknown (0) | Unknown; 0 is available data, not a missing result. |
| S15 | Verified | Follow Valve; no Steam match | Original, never inherited Verified. |
| S16 | Verified | Follow Valve; match exists but no category is available | Original, never inherited Verified. |
| S17 | Any | Follow Valve; fetched category changes Playable to Verified | Changes to Verified after normal successful refresh; mode stays Follow Valve. |
| S18 | Verified | Follow Valve; previously unavailable category later becomes Playable | Changes from Original to Playable; mode stays Follow Valve. |
| S19 | Verified to Unsupported | One inheriting game, one Follow Valve game, one numeric exception | Only inheriting games follow the global change; the active Game Info game's update waits for exit. |
| S20 | Verified to Automatic | Inheriting game has Valve Playable | Returns to Playable when eligible; wait for exit if its Game Info is active. |
| S21 | Verified to Automatic | Inheriting game has no Valve category | Restores Original when eligible; do not retain the old global value after exit. |
| S22 | Verified | Per-game switches Follow Valve to Use global default | Changes from Valve/Original to Verified after Save. |
| S23 | Verified | Per-game switches Use global default to Follow Valve | Changes to Valve/Original after Save. |
| S24 | Any | Metadata scan/enrichment/unrelated editor save | Preserve per-game numeric/valve choices; refresh only provider-owned data. |
| S25 | Verified | Match removed/reassigned while Follow Valve is selected | Preserve Follow Valve; never reuse the old match's category as the new match's result. |
| S26 | Verified | Metadata record removed or cache cleared | Removed choices revert to inheritance; global setting persists; removed injected Activity news stays cleared. |
| S27 | Any | Plugin reload, then Steam overview replacement | Reload policy, retain/reconstruct active-view pending work, and apply it after exit without freezing or losing links. |
| S28 | Any | Plugin dismount while callbacks or deferred updates exist | Clear pending work and restore native baselines; late callbacks cannot reapply compatibility. |
| S29 | Any | Regular Steam game or official-AppID alias | No policy mutation, added badge, or changed compatibility-filter result. |
| S30 | Any | Global save fails, or per-game Save fails/cancels | Last confirmed runtime and persisted policy remain unchanged; errors are visible for failures. |
| S31 | Any | Old settings load completes after a newer successful choice | New confirmed choice remains effective; old response cannot revert it. |
| S32 | Automatic / Follow Valve | Native baseline is nonzero and Valve data is missing | Preserve that original category and unrelated packed bits; do not fabricate Unknown. |
| S33 | Automatic to Verified | Inheriting matched Game Info is active with Valve Playable | Save Verified; other games update; active view stays Playable and intact. Leave for another tab/page, then return to see Verified. |
| S34 | Several global changes | Same Game Info stays active throughout | Retain its old applied status; apply only the latest effective choice after exit. |
| S35 | Changed global default | Close QAM or cancel a context-menu overlay while Game Info stays selected | Do not release the active game's pending update merely because the overlay closed. |
| S36 | Changed global default | Open Decky metadata... from the active game's context menu | Editor navigation counts as exit. Apply pending policy, then let any explicit editor Save take priority; no stale pending value may overwrite it. |
| S37 | Changed global default | Navigate from game A's Game Info to game B | Release A's pending update; do not apply it to B or leak A's state into B. |
| S38 | Changed global default | Steam replaces an overview, or deletes a shortcut, while its update is pending | Preserve held status across replacement; apply to the current exact native object after exit; never recreate a deleted shortcut. |
| S39 | Changed global default | Reload or unload while active-view work is pending | In-place reload retains/reconstructs the pending policy safely; actual unload clears it and restores baselines, with no late writes. |
| S40 | Any global change | Active Game Info has an unchanged fixed/Follow Valve result | Preserve that result and avoid a forced active-view refresh. Other eligible games still update. |

### Local proof and controls

1. Establish failing tests for the genuinely uncertain boundaries before
   implementing them, especially S04, S13-S16, S21, S25, and S28-S31.
   Assert expected behavior/failure reason rather than a generic nonzero
   exit. Missing commands or absent fixture data are setup failures,
   not successful negative tests.
2. Run focused existing suites during the owning implementation step,
   then the complete project gate once the integrated change is ready:

   ```bash
   ./run.sh npm test -- src/steam/metadataPatch.test.ts src/steam/libraryCompatibilityIndicators.test.tsx src/MetadataPage.test.tsx src/ContentPanel.updateSettings.test.tsx
   ./run.sh uv run --with pytest -- pytest -q tests/test_deck_compat.py tests/test_steam_appid_override.py
   ./run.sh scripts/orchestration-hooks/quality-gates
   ```

   Include any additional modified test files in focused runs. The final
   gate must report successful TypeScript checking, Rollup generation,
   Vitest, Python compilation, pytest, and the existing version drift
   check. Do not change version metadata to conceal an unrelated failure.
3. Prove the new behavior checks are sensitive: in a disposable copy
   below `/tmp/Decky-Metadata`, mutate the implementation so `"valve"`
   takes the inheritance path. The Follow Valve versus global Verified
   test must fail with the wrong resolved category. Restore/discard the
   mutation and run that test successfully. Do not mutate tests or the
   device, and do not leave a second writer in the canonical checkout.
4. After invalid-input, failed-save, and mutation failure cases, run the
   unchanged correct implementation through a successful global save,
   an unmatched inheriting shortcut, and a Follow Valve exception.
   Require the distinct expected categories. This negative control
   against the "nothing ran/always failed" explanation must run last in
   that sequence. Also verify a regular Steam title remains unchanged
   after the successful non-Steam updates.
5. Use a throwaway local benchmark/smoke fixture with realistic native
   overview shapes and thousands of shortcuts. Run the actual global
   apply/restore paths with no metadata records and mixed overrides.
   Record elapsed times at increasing library sizes; inspect the
   entry-based path for repeated whole-store lookups. Do not introduce
   timing-sensitive permanent CI assertions or claim that the current
   18-shortcut Deck proves large-library performance.

### Live Deck verification at implementation time

The earlier research was read-only. This plan is not approval to mutate the
device now. When implementation is explicitly launched, confirm current
device/fixture authorization before deployment, settings changes, shortcut
creation/removal, reload, cache clearing, or game launch. Preserve and
restore every changed user setting and fixture; do not clear the user's
whole cache just to test S26.

1. Run `scripts/decky doctor --deck`, `scripts/deck/logs.sh audit --json`,
   and `scripts/decky capture`. Record the installed version and evidence
   directory. Establish fresh fixtures rather than assuming research app
   IDs still exist: a matched shortcut with a known available Valve
   category, an unmatched shortcut, a no-record shortcut, and a regular
   Steam game. If a required fixture is missing, report the precondition
   failure and obtain approval to create a disposable one.
2. Because backend and frontend change, build/push the full plugin with
   `scripts/decky package-push --build --push`, install the local ZIP
   through Decky's GUI using the local ZIP install skill, and verify the
   installed version with capture. A frontend-only deploy is insufficient.
3. Use actual controls to test global inheritance, Follow Valve, fixed
   exceptions, and Unknown. Keep a matched Game Info view open while changing
   the default: its current status and rich content must remain unchanged.
   Close QAM alone and confirm it is still deferred. Then leave Game Info and
   return; verify the latest status with its description and links intact.
   Capture Home/grid and Game Info; packed bits alone are not visual proof.
4. Check actual compatibility-filter/collection membership for the
   changed shortcuts and the unchanged regular Steam fixture. Require
   results consistent with Steam's native category semantics; do not
   claim filter correctness merely because the packed mirror is set.
5. Verify S19-S23 and S33-S40, including same-game tab exit, editor navigation,
   repeated changes before exit, and unchanged per-game exceptions. Confirm
   other games and their native filter membership update immediately, while
   the active game's membership changes when its pending update is released.
   Use approved disposable data for destructive cases.
6. Reload through committed tooling with a pending change and verify it
   survives safely without a forced active-view refresh. Test two in-place
   reload cycles for responsiveness and intact links. Verify actual unload
   clears pending work and restores baselines; a Steam restart alone is not
   proof of plugin teardown cleanup.
7. Drive `scripts/deck/cdp.py input` with
   `scripts/deck/js/gpfocus_dump.js` and
   `scripts/deck/js/focus_order.js`. Verify initial QAM focus, dropdown
   reachability/order, each option, editor Save/cancel, modal focus return,
   and helper-text visibility. Store screenshots below
   `/tmp/Decky-Metadata`; do not hand-roll controller dispatch.
8. Run `scripts/deck/verify/run_all.sh --no-launch` for regression coverage.
   Run the full `scripts/deck/verify/run_all.sh` only with current approval
   for its configured launch fixture. Record any outstanding launch check.
   Apply the current on-device runbook's required checks; preserve
   artwork, launch identity, Game Info enrichment, and controller context.
9. Restore changed settings, fixture records and shortcuts, close only
   the dedicated debugger connections, and verify the restored values.
   Capture final diagnostics and record any cleanup failure explicitly.

### Completion and deferred verification

Plan authoring validates this document only; it does not run the feature
tests, implement these interfaces, or claim the new options exist.
Implementation is complete only when the behavior, required documentation,
local gates, and applicable live checks pass with recorded evidence.
Unavailable device access, missing fixture approval, failed cleanup, or an
unrun required launch check must be listed as outstanding with the exact
blocked command/scenario; they must not be reported as passed or silently
removed from scope. No CI publication, release, or dev-to-main promotion
is authorized by this plan.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished compatibility-status-defaults
```

This writes:

```text
/tmp/Decky-Metadata/compatibility-status-defaults_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer compatibility-status-defaults`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/compatibility-status-defaults-review-*.md
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
   scripts/orchestration/clear-finished compatibility-status-defaults
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
   git add docs/review/compatibility-status-defaults-review-*.md
   git commit -m "docs(review): record compatibility-status-defaults review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished compatibility-status-defaults
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer compatibility-status-defaults` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed compatibility-status-defaults
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize compatibility-status-defaults
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/compatibility-status-defaults_finalized
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
scripts/orchestration/finalize compatibility-status-defaults
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/compatibility-status-defaults_finished
/tmp/Decky-Metadata/compatibility-status-defaults_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
