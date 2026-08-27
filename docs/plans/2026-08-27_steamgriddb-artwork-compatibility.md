# Plan: Preserve SteamGridDB artwork for matched non-Steam shortcuts (steamgriddb-artwork-compatibility)

## Context

GitHub issue
[`#5`](https://github.com/beallio/Decky-Metadata/issues/5) reports that enabling
Decky Metadata makes SteamGridDB custom artwork conflict with matched non-Steam
shortcuts. The confirmed visible symptom is blank Library Home sidebar icons;
disabling only Decky Metadata and restarting Steam restores them. The reporter
verified that the shortcut icon files and the full SteamGridDB capsule, wide
capsule, hero, logo, and icon set remain present and readable.

The issue was independently reproduced and validated on the available Steam Deck
with stable Decky Metadata `0.3.7`. On Steam's live `/library/home` route,
matched Warhammer shortcut `2155012430` produced:

```text
BIsShortcut()                  true
Decky-patched BIsModOrShortcut false
icon_hash                      absent
icon_data                      absent
appStore.GetIconURLForApp      null
```

Current SteamUI's `GetIconURLForApp` checks `icon_hash`, then `icon_data`, and
only requests shortcut icon data in the fallback branch when
`BIsModOrShortcut()` is true. Decky Metadata's false result therefore sends the
shortcut through the native-app artwork path and directly explains the null
sidebar icon.

Decky Metadata does not call SteamGridDB, delete artwork, write custom-art APIs,
or assign overview icon/capsule/hero/logo fields. This is an identity/resolver
selection bug, not missing files.

### Root cause

`installMetadataPatches` globally after-patches the shared
`SteamAppOverview.BIsModOrShortcut` prototype. For cached/matched non-Steam
shortcuts whose native result is true, `decideBIsModOrShortcut` currently
returns false by default on every Steam surface. Its explicit Library Home branch
also returns false; only transient launch truth windows return the native true
value.

That spoof is required only while Steam renders a matched shortcut as a rich
Steam-like **Game Info** page. Because it is global, Library Home, artwork
resolvers, collections, controller configuration, and other consumers can
observe the false identity.

Live validation also found a secondary identity risk:
`GetAppOverviewByAppID(55150)` (the missing matched native Steam app) aliases to
the exact shortcut overview object for `2155012430`. This plan leaves that alias
unchanged to keep scope minimal; record it and revisit only if restoring native
shortcut identity does not fix artwork.

### Intended behavior

- Matched and unmatched non-Steam shortcuts report their native shortcut identity
  on Library Home, collections, controller configurator, artwork resolvers, and
  every unrelated surface.
- Only calls for the current matched shortcut on a recognized library
  game-detail route may use the false Steam-like identity needed by Game Info.
- Calls for a different shortcut in a sidebar remain native even while another
  matched detail page is open.
- The in-call launch truth window still outranks every false spoof.
- Route-shield hits and positive render truth-window counters are consulted or
  consumed only for the current matched detail app. Off-detail calls do not
  spend those budgets.
- Matched Game Info, quick links, activity, controller layouts/Search, rerender
  behavior, and shortcut launching retain their existing contracts.

### Architecture decisions

- Add one strict, pure route classifier in `src/steam/core.ts`, tested in a new
  `core.test.ts`. It must parse the joined route context returned by
  `currentRoutePath`, recognize only library detail/app route shapes for the
  requested appid (including `/routes/library/...` variants), and reject Library
  Home, controller configurator, unrelated appids, partial/prefix collisions,
  query-only mentions, and malformed inputs.
- Pass a boolean `isCurrentMatchedDetail` into `decideBIsModOrShortcut`.
- Preserve existing precedence for non-shortcuts, original false, in-call truth,
  uncached shortcuts, current-detail shield hits, and current-detail positive
  truth windows.
- Return the native true result immediately outside the current matched detail
  route. Do not consult the shield or decrement the truth counter there.
- Remove the Library Home false special case and constrain the default false
  result to the current matched detail route.
- Do not directly special-case SteamGridDB, write artwork fields, inspect raw
  paths in production, or change the matched-app overview alias in this plan.

### Files in scope

```text
src/steam/core.ts
src/steam/core.test.ts
src/steam/spoofDecision.ts
src/steam/spoofDecision.test.ts
src/steam/metadataPatch.ts
src/steam/metadataPatch.test.ts
scripts/deck/js/check_artwork_identity.js
scripts/deck/verify/smoke_artwork_identity.sh
tests/test_deck_fixture_selection.py
docs/runbooks/on-device-verification.md
README.md
CHANGELOG.md
dist/index.js
dist/index.js.map
docs/agent_conversations/2026-08-27_steamgriddb-artwork-compatibility.md
```

Do not change SteamGridDB files/settings, backend metadata, controller layout
merge/Search/filter policy, updater behavior, route navigation, or direct custom
artwork properties.

**Slug used throughout this plan:** `steamgriddb-artwork-compatibility`

---

## Orchestration Contract

**Slug:** `steamgriddb-artwork-compatibility`

**Plan file:**

```text
docs/plans/2026-08-27_steamgriddb-artwork-compatibility.md
```

**Implementation branch:**

```text
feat/steamgriddb-artwork-compatibility
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/steamgriddb-artwork-compatibility_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/steamgriddb-artwork-compatibility_finalized
```

**Review notes:**

```text
docs/review/steamgriddb-artwork-compatibility-review-*.md
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
git checkout -b feat/steamgriddb-artwork-compatibility
```

Commit this plan first:

```bash
git add docs/plans/2026-08-27_steamgriddb-artwork-compatibility.md
git commit -m "docs(plan): add steamgriddb-artwork-compatibility implementation plan"
```

---

## Implementation Tasks

Work in this order. Tests and the current-device Library Home baseline must
demonstrate the false shortcut identity before production changes.

### Task 1 — protocol checks and bounded baseline

1. Run from the repository root:

   ```bash
   scripts/decky doctor
   scripts/decky verify-change dev --explain
   ```

   Record the routed checks. This change touches the launch-sensitive
   `BIsModOrShortcut` patch; do not use `--allow-launch` until the human grants
   explicit current-run launch authorization.
2. Create `/tmp/Decky-Metadata/steamgriddb-artwork-compatibility/` for all
   payloads, screenshots, logs, hashes, and temporary evidence.
3. Confirm SteamGridDB remains enabled and the user-reproduced artwork is still
   applied. Do not rewrite or reapply artwork during the baseline.
4. Deploy the current unmodified `dev` bundle to `steamdeck` through a dedicated
   CDP port, open Library Home, and capture:
   - shortcut `2155012430`, matched Steam app `55150`;
   - current route/history paths;
   - requested appid and returned overview object appid;
   - `BIsShortcut`, `BIsModOrShortcut`, alias/same-object boolean;
   - icon-hash/data presence and bounded icon-resolution result;
   - counts and hashes of custom vertical/landscape/hero/logo URL candidates;
   - screenshot showing the blank matched shortcut sidebar icon;
   - hashes of the referenced shortcut/custom-art files without emitting raw
     paths.
5. Required pre-change discriminator: on Library Home the matched shortcut is
   natively a shortcut, the patched mod/shortcut identity is false, and icon
   resolution is null/blank while the underlying custom art remains present.
   If this is no longer true on the same build, stop and update the plan.
6. Capture matched Game Info, quick-link, rerender, and launch-probe baseline
   state needed for after comparison. Do not launch a game in Task 1.

### Task 2 — write failing tests first

Add tests before production edits and run:

```bash
./run.sh npx vitest run \
  src/steam/core.test.ts \
  src/steam/spoofDecision.test.ts \
  src/steam/metadataPatch.test.ts
./run.sh uv run --with pytest -- pytest -q \
  tests/test_deck_fixture_selection.py
```

Required red contracts:

1. Strict detail-route classifier:
   - accept current appid in the actual library app/detail route shapes and
     `/routes/library/...` equivalents, including joined
     `currentRoutePath()` strings with href/search/hash tokens;
   - reject `/library/home`, `/routes/library/home`, controller configurator,
     collections without the current app detail, another appid, appid prefix
     collisions, query-only mentions, native store URLs, empty/malformed values.
2. Pure spoof decision:
   - Library Home and all outside-detail surfaces return native true for cached
     shortcuts without consulting the shield or decrementing the counter;
   - another shortcut in a sidebar remains true while app A's detail route is
     active;
   - current matched detail retains shield false, default false, and positive
     truth-window behavior;
   - `bypassCounter === -1` remains native true and outranks route/shield logic;
   - uncached shortcuts and native apps remain pass-through.
3. Metadata-patch wiring:
   - the patched overview receives the classifier result for its own appid;
   - a Library Home call returns native true;
   - a current matched detail render returns false;
   - off-detail calls do not consume a seeded route shield or bypass counter;
   - method receiver/arguments/return and unload restoration remain exact.
4. Artwork resolver contract:
   - a matched Library Home shortcut with no `icon_hash`/`icon_data` retains
     shortcut identity so Steam can request icon data;
   - the plugin does not assign or clear icon/capsule/hero/logo fields;
   - the existing matched-id alias is recorded but unchanged.
5. Device probe safety/static contract:
   - emit only scalar route/identity fields, booleans/counts, elapsed time, and
     hashes;
   - forbid raw paths, raw URLs/data URIs, titles, account data, artwork writes,
     plugin toggles, route navigation, input dispatch, launch, selection, or
     cache-clearing operations.

Syntax/import failures are not an acceptable red phase. Record named failures
and tallies.

### Task 3 — add strict current-detail route classification

In `src/steam/core.ts`:

1. Add an exported pure `isCurrentGameDetailRoute(routeContext, appId)` helper
   (name may follow existing conventions).
2. Reuse `GAME_DETAIL_ROUTES` and `gameDetailAppIdFromPath` where safe, but do not
   accept a route merely because the appid appears anywhere in the joined string.
   Parse path/URL tokens and match complete route segments.
3. Recognize current Steam library app/detail forms used by the existing
   router/detail patches, including loopback `/routes/library/...` forms.
4. Reject Library Home, collection overview, controller-configurator, unrelated
   appids, prefix collisions, query-only mentions, and malformed input.
5. Keep route parsing allocation bounded; this helper runs from a frequently
   called overview method.

### Task 4 — scope shortcut identity spoofing

1. Extend `SpoofInput` with `isCurrentMatchedDetail`; replace/remove the
   `home-special-case` reason with an explicit outside-detail native reason.
2. In `decideBIsModOrShortcut`, preserve this precedence:
   - unrelated/native app -> original;
   - original not true -> original;
   - in-call truth (`-1`) -> native true;
   - no metadata cache -> native true;
   - outside current matched detail -> native true, without `consumeShield()` or
     counter decrement;
   - current detail shield hit -> false;
   - current detail positive truth window -> existing true/decrement behavior;
   - current detail default -> false.
3. In `metadataPatch.ts`, derive the current-detail boolean from the strict route
   helper and the overview's own appid, then pass it to the pure decision.
4. Preserve tracing, but include the new route-scope reason/boolean so device
   evidence can distinguish Library Home pass-through from detail spoofing.
5. Leave `GetGameID`/`GetPrimaryAppID` in-call truth, armers, details reassertion,
   route-shield implementation, controller patches, and matched-id alias
   unchanged unless a focused test proves a necessary correction within this
   contract.

### Task 5 — add permanent artwork identity verification

1. Add `scripts/deck/js/check_artwork_identity.js`, parameterized by shortcut and
   matched appids. It may read:
   - current route/history;
   - requested/object appids and same-object alias;
   - app type, `BIsShortcut`, `BIsModOrShortcut`;
   - presence (not contents) of `icon_hash`/`icon_data`;
   - bounded `GetIconURLForApp` polling and only a resolved boolean/hash;
   - counts/hashes of custom vertical/landscape/hero/logo candidates.
   It must never emit a raw local path, raw URL/data URI, title, or account data.
2. Add `scripts/deck/verify/smoke_artwork_identity.sh` with an evidence path
   restricted below `/tmp/Decky-Metadata/`. Accept expected route scope and
   expected shortcut identity. Fail loudly on wrong app/route, alias mismatch,
   false shortcut identity outside detail, missing custom-art candidates, null
   icon resolution after the bounded request, malformed payload, or failed
   restoration.
3. The smoke must be read-only except Steam's bounded icon-data request/cache
   population. It must not navigate, toggle plugins, write artwork, or launch.
4. Add discriminating static/executable safety tests to
   `tests/test_deck_fixture_selection.py`; removing required output or adding raw
   identity/path output must fail.
5. Document usage, privacy, expected cache side effect, route prerequisite, and
   explicit device approval in `docs/runbooks/on-device-verification.md`.

### Task 6 — documentation and generated artifacts

1. Update `README.md` to state that Decky Metadata coexists with SteamGridDB
   custom artwork and preserves shortcut icons on Library Home while enriching
   matched Game Info.
2. Add a concise `## [Unreleased]` Fixed entry referencing issue `#5` without
   claiming it is released or closing the issue.
3. Regenerate `dist/index.js` and `dist/index.js.map` through Rollup; never edit
   generated files manually.
4. Write
   `docs/agent_conversations/2026-08-27_steamgriddb-artwork-compatibility.md`
   with objective, files changed, route/precedence decision, red/green and
   mutation evidence, quality gates, baseline/post device artifacts, art-file
   hash comparison, launch authorization/result, secondary alias status, and
   explicit unverified items.
5. Keep issue `#5` open until a release containing the fix is published.

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

Apply `references/verification-standards.md`: every check must have an explicit
failure condition; baseline/red and mutation failures precede restored positive
controls; commands must not mask producer failures; record actual outputs and
tallies.

### 1. Red and focused green tests

Before production changes, run Task 2's focused commands and record named
failures for Library Home native identity, strict current-detail route parsing,
shield/counter non-consumption, detail false spoof, launch truth, metadata
wiring, and probe privacy.

After Tasks 3–5, rerun:

```bash
./run.sh npx vitest run \
  src/steam/core.test.ts \
  src/steam/spoofDecision.test.ts \
  src/steam/metadataPatch.test.ts
./run.sh uv run --with pytest -- pytest -q \
  tests/test_deck_fixture_selection.py
```

All existing launch/shield/controller-related tests remain green.

### 2. Mutation checks and restored control

With focused tests green:

1. Temporarily classify `/library/home` as a current detail route. Library Home
   and artwork identity tests must fail.
2. Restore it; temporarily remove the appid-equality requirement. Other-app and
   prefix-collision tests must fail.
3. Restore it; temporarily consult/consume the route shield before the
   outside-detail pass-through. Stale-shield/sidebar and counter-preservation
   tests must fail.
4. Restore it; temporarily move in-call truth below detail spoofing. Launch
   precedence tests must fail.
5. Restore all mutations and rerun the complete focused commands. Record final
   passing totals; commit no mutation.

### 3. Full quality gate

Run the generated Quality Gates section. Device deployment is blocked unless
`scripts/orchestration/run-quality-gates` exits `0`, both bundle artifacts match
the build, review notes are intact, all changes are committed, and the tree is
clean.

### 4. Steam Deck artwork behavior

With explicit current-device approval:

```bash
DECKY_DECK_HOST=steamdeck scripts/decky doctor --deck
DECKY_DECK_HOST=steamdeck CDP_PORT=18085 scripts/deck/deploy.sh
```

Open Library Home without programmatic navigation and run the new smoke for
shortcut `2155012430` / matched app `55150`. Fail unless:

- current route is Library Home and the requested overview object remains the
  shortcut;
- `BIsShortcut` and `BIsModOrShortcut` are both true;
- custom-art candidate counts/hashes remain present and equal the baseline;
- the icon resolver becomes non-null after bounded loading;
- screenshot shows the previously blank sidebar icon rendered;
- raw artwork paths/URLs never appear in evidence.

Also inspect Capsule, Wide Capsule, Hero, Logo, logo positioning, and square
capsule presentation on the user-reproduced SteamGridDB setup. Record visual
evidence; do not reapply artwork to manufacture a pass.

### 5. Matched Game Info and route regressions

Using the same matched shortcut:

```bash
DECKY_DECK_HOST=steamdeck CDP_PORT=18085 \
  scripts/deck/verify/smoke_quicklinks.sh <matched> <never> <delisted> <feature>
DECKY_DECK_HOST=steamdeck CDP_PORT=18085 \
  scripts/deck/verify/smoke_rerender.sh 2155012430
DECKY_DECK_HOST=steamdeck CDP_PORT=18085 \
  scripts/deck/verify/run_all.sh --no-launch
```

Require current matched Game Info enrichment, quick-link policy, zero same-app
rerender cache writes, controller-layout/Search isolation, and no Library Home
identity regression. Record stale settings-only fixture failures separately;
never call a failing suite passed.

### 6. Launch safety human gate

Because this change modifies `BIsModOrShortcut`, the final device gate requires
the real launch smoke with an explicit matched shortcut:

```bash
MATCHED_APPID=2155012430 \
  DECKY_DECK_HOST=steamdeck CDP_PORT=18085 \
  scripts/decky verify-change dev --device --allow-launch
```

Do not run this command without explicit current-run human authorization. If
authorization is absent, complete every other check and record launch as a
blocking prerequisite; do not mark the plan finished. When authorized, require
the shortcut to launch with its 64-bit gameid and terminate through the
committed smoke tooling.

### 7. Cleanup and explicit exclusions

Close the dedicated tunnel and record final down status. State explicitly:

- the matched-id overview alias remains unchanged and is a monitored secondary
  risk;
- no artwork was written/reapplied during verification;
- unrelated controller types/platforms and Steam builds outside the tested
  Steam Deck remain unverified;
- issue `#5` remains open until a published release contains the fix.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steamgriddb-artwork-compatibility
```

This writes:

```text
/tmp/Decky-Metadata/steamgriddb-artwork-compatibility_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steamgriddb-artwork-compatibility`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steamgriddb-artwork-compatibility-review-*.md
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
   scripts/orchestration/clear-finished steamgriddb-artwork-compatibility
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
   git add docs/review/steamgriddb-artwork-compatibility-review-*.md
   git commit -m "docs(review): record steamgriddb-artwork-compatibility review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steamgriddb-artwork-compatibility
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steamgriddb-artwork-compatibility` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steamgriddb-artwork-compatibility
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steamgriddb-artwork-compatibility
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/steamgriddb-artwork-compatibility_finalized
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
scripts/orchestration/finalize steamgriddb-artwork-compatibility
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/steamgriddb-artwork-compatibility_finished
/tmp/Decky-Metadata/steamgriddb-artwork-compatibility_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
