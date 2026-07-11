# Plan: Hide Quick-Links Row for Never-on-Steam Games (hide-quicklinks-row-nonsteam)

## Context

**User-visible problem.** For non-Steam library entries that were **never on
Steam** (no `steam_appid`), the plugin still spoofs `BIsModOrShortcut → false`
(`src/steam/metadataPatch.ts:443-489`) so Steam renders the full Game Info page —
including the quick-links row (Store Page / Community Hub / Discussions / Guides /
Support, plus Market/Workshop when their flags are set). Those links target a
Steam appid that does not exist for the game, so they are dead. Observed on-device
for `X-Men Origins: Wolverine [DS]` (`steam_appid: null`) and every unmatched
title (the Nintendo entries).

**Chosen behavior (confirmed with the user).** Keep the enriched Game Info page
(IGN artwork + description) but **remove the entire quick-links row** for records
with no `steam_appid`. Games that *are* matched to a real Steam appid keep the row
unchanged. (This supersedes the earlier `market-button-appid-gate` idea, which
only hid the Market button — removing the whole row covers Market too.)

**Live-tree anchor (pinned on-device via CDP, 2026-07-10, on Transformers
Devastation `/library/app/3015223078/tab/GameInfo`).** The quick-links row is
rendered by a component whose props are exactly:

```text
{ overview, details, workshopVisible, marketPresence }   // the "links section"
```

`overview.appid` is the app id (`3015223078` in the capture); its child component
receives the computed `links` array (captured value:
`["Store Page","Community Hub","Discussions","Guides","Support"]`, each link
carrying `strTitle`). The **component names are minified** (`N`, `z`) and the DOM
classes are hashed (e.g. `b3wFR-A7udxD-EIp_rbqC`) — both change per Steam build
and must NOT be used as anchors. The **prop key signature**
(`overview` + `details` + `workshopVisible` + `marketPresence`) is written in
Steam's JSX and is stable across builds; use it as the `findInReactTree`
predicate. Market/Workshop are separately gated by `marketPresence`
(`bCommunityMarketPresence`) / `workshopVisible` (`bWorkshopVisible`), confirmed
in the Steam bundle (`BHasMarketPresence`/`BIsWorkshopVisible`), so removing the
whole section is the only way to also drop Store/Community/Discussions/Guides/
Support, which have no per-link overview flag.

**Intended outcome.** On a no-`steam_appid` game's Game Info page, the quick-links
row is absent while the description/screenshots still render; on a matched game
the row is unchanged. No throw is ever introduced into Steam's render path.

**Relevant files:** `src/steam/routerPatches.ts` (the existing
`installRouterRenderPatches` GAME_DETAIL_ROUTES `renderFunc` afterPatch is the
insertion point), `src/steam/core.ts` (`metadataCache`, `isNonSteamApp`,
`findInReactTree` re-exports / helpers), `src/steam/metadataPatch.ts` (read-only
reference — the spoof that makes the row appear), `dist/index.js` +
`dist/index.js.map` (committed build artifacts).

**Slug used throughout this plan:** `hide-quicklinks-row-nonsteam`

---

## Orchestration Contract

**Slug:** `hide-quicklinks-row-nonsteam`

**Plan file:**

```text
docs/plans/2026-07-10_hide-quicklinks-row-nonsteam.md
```

**Implementation branch:**

```text
feat/hide-quicklinks-row-nonsteam
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/hide-quicklinks-row-nonsteam_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/hide-quicklinks-row-nonsteam_finalized
```

**Review notes:**

```text
docs/review/hide-quicklinks-row-nonsteam-review-*.md
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
git checkout -b feat/hide-quicklinks-row-nonsteam
```

Commit this plan first:

```bash
git add docs/plans/2026-07-10_hide-quicklinks-row-nonsteam.md
git commit -m "docs(plan): add hide-quicklinks-row-nonsteam implementation plan"
```

---

## Implementation Tasks

Frontend-only (TypeScript). No JS unit-test runner — the gate is `tsc --noEmit`
+ rollup build + Python `py_compile`/`pytest`. Do **not** add a JS test
framework. Absolute invariant: the render patch must never throw into Steam's
render path — wrap all new logic in try/catch and always return the original
tree/element on any failure.

### Task 1 — helper: does an app id lack a Steam match? (`src/steam/core.ts` or routerPatches)

Add a small predicate that returns true when a given app id maps to a cached
metadata record that has **no** valid `steam_appid`:

```ts
const isNeverOnSteam = (appId: number): boolean => {
  const md = metadataCache[String(appId)];
  if (!md) return false;                       // unknown -> do not touch
  return !(Number((md as any).steam_appid) > 0);
};
```

Only records we actually have metadata for are eligible; if there is no cache
entry, do nothing (leave Steam's native render alone).

### Task 2 — suppress the links section in the game-detail render (`src/steam/routerPatches.ts`)

Work inside the existing `installRouterRenderPatches` GAME_DETAIL_ROUTES
`renderFunc` `safeAfterPatch` (`routerPatches.ts:39-74`), which already computes
`appId` and gates on `isNonSteamApp`. After the existing logic, when
`isNeverOnSteam(appId)` is true, locate and neutralize the quick-links section in
the returned tree `ret`:

1. Use `findInReactTree(ret, (node) => node?.props && "overview" in node.props &&
   "details" in node.props && "workshopVisible" in node.props &&
   "marketPresence" in node.props)` to find the **links-section** element (the
   prop-key signature from Context — do NOT match on component name or className).
2. Confirm the found node's `props.overview?.appid === appId` (guard against
   matching a different app's section).
3. Neutralize it so the row renders nothing. Preferred: replace the matched
   element in-place by overwriting `node.type` with a component that returns
   `null` (`node.type = () => null`) — or, if that proves unreliable on-device,
   empty the child list by finding the descendant whose `props.links` is an array
   and setting `props.links = []`. Do whichever reliably removes the row on the
   device (see Verification); document which was used in the session log.
4. Everything is wrapped so a miss (section not found, shape changed by a Steam
   update) simply leaves the tree untouched — never throw, always return `ret`.

**Reachability note (must verify on-device).** `findInReactTree` only sees
elements already present in `ret`; the links section may sit behind a child
component boundary that has not rendered yet at the point this patch runs. If the
section is not found in `ret` at this level, the implementer must instead wrap the
appropriate nested `renderFunc` (same technique the file already uses at
`routerPatches.ts:41-43` to reach `renderFunc`) so the suppression runs on the
subtree that actually contains the links section. Pin the working insertion point
against the live tree during the deferred on-device verification below.

Do not change the `BIsModOrShortcut` spoof, the reentry shield, arming sites, or
any metadata application — the page (art/description) must still render; only the
links row is removed, and only for no-`steam_appid` apps.

### Task 3 — rebuild dist and commit

```bash
./run.sh npm run build
git add dist/ src/
git status --short   # must be clean after the commit
```

### Task 4 — session log

Record a session summary at
`docs/agent_conversations/2026-07-10_hide-quicklinks-row-nonsteam.md` per
`AGENTS.md`, covering: why never-on-Steam games showed dead quick links (spoof
makes the row appear; no per-link flag for Store/Community/Discussions/Guides/
Support), the prop-signature anchor and why it is used instead of
component/class names, the chosen neutralization technique, and the deferred
on-device verification.

### Scope discipline (exact allowed change list)

May change:

- `src/steam/routerPatches.ts` — Tasks 1-2 (the `isNeverOnSteam` gate + section
  suppression inside the existing render patch).
- `src/steam/core.ts` — only if the `isNeverOnSteam` helper or a `findInReactTree`
  re-export is placed there.
- `dist/index.js`, `dist/index.js.map` — rebuild output.
- `docs/plans/2026-07-10_hide-quicklinks-row-nonsteam.md` (first commit),
  `docs/agent_conversations/` session log, committed review notes.

Must NOT change: `src/steam/metadataPatch.ts` (the spoof + Market flag stay as
is), `src/steam/navigationRedirect.ts`, `src/steam/install.ts`, `main.py`,
`backend/`, `tests/`, `package.json` dependencies. Do not gate on component names
or CSS classes. Do not suppress the row for apps that have a valid `steam_appid`
or for apps with no cached metadata.

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

Automated (runs in quality gates): `npx tsc --noEmit`, `npm run build`,
`py_compile`, `pytest -q`. These prove type/build integrity only — the tree
suppression is not covered by automated tests (no JS test runner, and the target
is Steam's live render tree).

Source-inspection checks the reviewer must confirm from the diff:

1. The `findInReactTree` predicate matches on the **prop-key signature**
   (`overview`/`details`/`workshopVisible`/`marketPresence`), never on a
   component name or CSS class.
2. Suppression happens only when `isNeverOnSteam(appId)` is true and the matched
   section's `overview.appid === appId`; matched-Steam apps and
   no-cache apps are untouched.
3. All new logic is inside try/catch and returns the original tree on any miss —
   no new throw path into Steam's render.

**Deferred on-device verification (required before dev→main; performed by the
human/orchestrator on the Steam Deck; this is also where the exact insertion
point is pinned):**

1. On a no-`steam_appid` game (`X-Men Origins: Wolverine [DS]`, or a Nintendo
   title) → Game Info: the quick-links row (Store Page/Community Hub/Discussions/
   Guides/Support) is **absent**, while the description and screenshots still
   render.
2. On a matched game (`Transformers: Devastation` `3015223078` → `338930`, or
   `Wobbly Life`) → Game Info: the quick-links row is **present and unchanged**,
   and (regression) a Discussions round-trip still behaves as before.
3. Confirm no crash/blank page on either game type (the try/catch fallback keeps
   the native tree if the section is not found), and that toggling between a
   matched and unmatched game does not leak suppression across apps.
4. If step 1 shows the row still present, the section was behind an unrendered
   child boundary — apply the nested-`renderFunc` wrap from Task 2's reachability
   note and re-verify; record the final working insertion point in the session
   log.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished hide-quicklinks-row-nonsteam
```

This writes:

```text
/tmp/Decky-Metadata/hide-quicklinks-row-nonsteam_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer hide-quicklinks-row-nonsteam`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/hide-quicklinks-row-nonsteam-review-*.md
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
   scripts/orchestration/clear-finished hide-quicklinks-row-nonsteam
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
   git add docs/review/hide-quicklinks-row-nonsteam-review-*.md
   git commit -m "docs(review): record hide-quicklinks-row-nonsteam review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished hide-quicklinks-row-nonsteam
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer hide-quicklinks-row-nonsteam` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed hide-quicklinks-row-nonsteam
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize hide-quicklinks-row-nonsteam
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/hide-quicklinks-row-nonsteam_finalized
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
scripts/orchestration/finalize hide-quicklinks-row-nonsteam
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/hide-quicklinks-row-nonsteam_finished
/tmp/Decky-Metadata/hide-quicklinks-row-nonsteam_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
