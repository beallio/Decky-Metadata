# Plan: Target GameInfoQuickLinks for the unmatched app-links hider (fix-applinks-hider-quicklinks)

## Context

The unmatched-app-links hider still shows the native Store Page / Community Hub / Discussions /
Guides / Market buttons on non-Steam games with no Steam match (e.g. *X-Men Origins:
Wolverine*). Live DOM inspection via Steam's CEF remote debugger (port 8080) proved the root
cause: **the hider targets the wrong class.**

The previous fix resolved `LinkRow` (`_1tN7mH20YhTaXLqtoW2hR-`) from the CSS module that also
exports `LinkRowText`/`LinkRowIcon`. But that module is the **Remote Play / Friends invite**
row (its `LinkRow` is used by `SteamClient.Friends.ShowRemotePlayTogetherInvite`), **not** the
app-links buttons. The prior build's own diagnostic confirmed this: on an unmatched game the
log showed `decision='True'` and `resolvedClasses="['_1tN7mH20YhTaXLqtoW2hR-']"` but
`classPresentInDom=''` (false) — i.e. the decision fired and the body class was applied, but
the resolved class is **not in the live DOM**, so nothing was hidden.

The real DOM (captured live on the Wolverine page) is:

```
div.GameInfoQuickLinks (_2GqvVM-UeNGM7ptNftUVn_)      <- the quick-links row (target)
  div._3fiHsLeD_6rtm6bM9lHlVL
    div.Contents (_3CJctA7pLVdwHzNF5JmORE)
      div.ListElement (b3wFR-A7udxD-EIp_rbqC)          <- generic horizontal-list item (do NOT target)
        div (no class)
          div.Anchor.Panel (DY4_wSF8h9T5o46hO5I9V)     <- each button; "Anchor" is generic (do NOT target)
```

The button (`Anchor`) and its row (`ListElement`) come from a **generic** horizontal-focus-list
module (siblings: `Contents`, `MaskRight`, `OnLastPage`, `BackgroundAnimation`, …) used all over
the UI — hiding those would break unrelated rows. The correct, **semantically-named** target is
**`GameInfoQuickLinks`**, exported by the AppDetails CSS module alongside `AppDetailsContent`
(`_17iCvVAxnC3dSA3LKShx_t`), `AppDetailsContainer`, `AppDetailsRoot`, `GameInfoContainer`
(`pzBMdSbGpu7XfypZMU6PK`), `GameInfoCollections`, etc. Its subtree is exactly the five
Store/Community/Discussions/Guides/Market buttons and nothing else, so hiding
`.GameInfoQuickLinks` removes the dead button row while leaving the rest of the page (including
the game description and the separate Community section) intact.

The route/app-detection and body-class toggle from `fix-applinks-hider-robust` are **correct**
(the diagnostic proved `decision='True'` on unmatched games) and stay. Only the **class the
hider resolves and targets** must change: resolve `GameInfoQuickLinks` (not `LinkRow`) at
runtime from the AppDetails CSS module (robust across Steam updates, which change the hash).

Relevant code (all `src/steam.ts`): `isAppDetailsLinkRowModule` (~3859),
`appDetailsLinkRowModuleFromExports` (~3866), `resolveAppDetailsLinkRowClasses` (~3874),
`buildUnmatchedAppLinksHiderStyle` (~3906), `installUnmatchedAppLinksHider` (~3990), the
`[playhub:applinks]` diagnostic (`logUnmatchedAppLinksDecision`, ~3940), `findModuleChild`.

**Intended outcome:** on an unmatched non-Steam game's detail page the quick-links row
(`GameInfoQuickLinks`) is hidden; matched games and real Steam apps keep working buttons; the
`[playhub:applinks]` diagnostic now shows `classPresentInDom=true` (confirming the resolved
class is the live element) and the row disappears.

**Out of scope:** the Steam App ID override (already merged); the community-media swap; removing
the diagnostics (a later cleanup once confirmed). Do not change the route/app detection or the
toggle.

**Slug used throughout this plan:** `fix-applinks-hider-quicklinks`

---

## Orchestration Contract

**Slug:** `fix-applinks-hider-quicklinks`

**Plan file:**

```text
docs/plans/2026-06-30_fix-applinks-hider-quicklinks.md
```

**Implementation branch:**

```text
feat/fix-applinks-hider-quicklinks
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-quicklinks_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-quicklinks_finalized
```

**Review notes:**

```text
docs/review/fix-applinks-hider-quicklinks-review-*.md
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
git checkout -b feat/fix-applinks-hider-quicklinks
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_fix-applinks-hider-quicklinks.md
git commit -m "docs(plan): add fix-applinks-hider-quicklinks implementation plan"
```

---

## Implementation Tasks

Frontend-only, `src/steam.ts`. No TS test runner (gate = `tsc --noEmit` + build + py_compile +
pytest). **Never throw**; the hider is passive and must never affect navigation/rendering. The
current code targets `LinkRow`; change it to target `GameInfoQuickLinks`. Keep the route/app
detection (`onGameDetailRoute` + `currentGameDetailAppId`) and the toggle exactly as-is.

1. **Replace the module predicate.** `isAppDetailsLinkRowModule` (src/steam.ts:3859-3864)
   currently checks for `LinkRow`+`LinkRowText`+`LinkRowIcon` (the Remote Play module). Replace
   it (rename to `isAppDetailsQuickLinksModule` and update all references) so it matches the
   **AppDetails** CSS module by requiring **string** properties **`GameInfoQuickLinks`** AND
   **`GameInfoContainer`** (both present disambiguates it; `AppDetailsContent` is also in this
   module and may be used as an extra guard but the two `GameInfo*` keys are sufficient):
   ```ts
   const isAppDetailsQuickLinksModule = (candidate: any) =>
     !!candidate &&
     typeof candidate === "object" &&
     typeof candidate.GameInfoQuickLinks === "string" &&
     typeof candidate.GameInfoContainer === "string";
   ```

2. **Update the exports walker + resolver.** Rename `appDetailsLinkRowModuleFromExports` →
   `appDetailsQuickLinksModuleFromExports` (same shape, using the new predicate). In
   `resolveAppDetailsLinkRowClasses` (rename to `resolveAppDetailsQuickLinksClasses`), keep the
   two-pass `findModuleChild` search, but return the resolved **`GameInfoQuickLinks`** value
   instead of `LinkRow`:
   ```ts
   const quickLinks = discovered?.GameInfoQuickLinks;
   return typeof quickLinks === "string" && quickLinks.trim() ? [quickLinks.trim()] : [];
   ```
   Keep the try/catch and `return []` on failure.

3. **Update every caller/name.** `installUnmatchedAppLinksHider` calls
   `resolveAppDetailsLinkRowClasses()` and stores it in `resolvedLinkRowClasses` — rename the
   local(s) if you renamed the function, or keep the variable name but point it at the new
   resolver; either way the value now holds the `GameInfoQuickLinks` class.
   `buildUnmatchedAppLinksHiderStyle` is unchanged in shape (it just builds
   `body.playhub-hide-applinks .<class> { display:none !important }` from whatever classes it's
   given). Keep the `[class*="LinkRow"]` **fallback string removed or replaced** with a benign
   no-op fallback: since `LinkRow` is now known to be the *wrong* element, change the fallback
   selector in `buildUnmatchedAppLinksHiderStyle` from `[class*="LinkRow"]` to a harmless
   non-matching placeholder (e.g. keep the resolved-class path and, when nothing resolves, emit
   no rule — return an empty string / comment — so we never hide the wrong Remote Play row).

4. **Diagnostics stay, retargeted automatically.** `logUnmatchedAppLinksDecision` already logs
   `resolvedClasses` and `classPresentInDom` for the first resolved class — with the resolver
   now returning `GameInfoQuickLinks`, this will report the new hash and (expected)
   `classPresentInDom=true` on unmatched game pages. No change needed beyond the rename; leave
   the throttling and the single-`decision` computation intact.

5. **Scope discipline.** Only the predicate/resolver retarget (`GameInfoQuickLinks`) and the
   fallback-selector safety change. Do **not** change `onGameDetailRoute`,
   `shouldHideUnmatchedAppLinks`, the toggle, the interval/teardown, the redirect, matching, or
   `main.py`. No npm deps; use `npm ci` if an install is needed.

6. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting the target
   moved from the (wrong) Remote Play `LinkRow` to the AppDetails `GameInfoQuickLinks`, derived
   from live CEF DOM inspection; the resolved hash on the current Steam build is
   `_2GqvVM-UeNGM7ptNftUVn_` (for reference only — not hardcoded).

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

Run and confirm:

```bash
export UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + pytest
git status --short                          # clean
```

Expected: `tsc`/build pass; pytest unchanged-green; tree clean.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload.
2. Open an **unmatched** non-Steam game (e.g. *X-Men Origins: Wolverine*) — confirm the
   Store/Community/Discussions/Guides/Market quick-links row is now **hidden**, and the rest of
   the page (description, Community section, etc.) is intact.
3. Open a **matched** game (Space Marine / Wobbly Life) — confirm its quick-links buttons are
   still **visible and working**.
4. In `playhub-metadata.log` confirm the `[playhub:applinks]` line now shows a
   `GameInfoQuickLinks` hash in `resolvedClasses` and `classPresentInDom=true` on the unmatched
   page (proving the resolved class matches the live element).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-applinks-hider-quicklinks
```

This writes:

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-quicklinks_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-applinks-hider-quicklinks`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-applinks-hider-quicklinks-review-*.md
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
   scripts/orchestration/clear-finished fix-applinks-hider-quicklinks
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
   git add docs/review/fix-applinks-hider-quicklinks-review-*.md
   git commit -m "docs(review): record fix-applinks-hider-quicklinks review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-applinks-hider-quicklinks
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-applinks-hider-quicklinks` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed fix-applinks-hider-quicklinks
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-applinks-hider-quicklinks
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/fix-applinks-hider-quicklinks_finalized
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
scripts/orchestration/finalize fix-applinks-hider-quicklinks
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-quicklinks_finished
/tmp/Playhub-Metadata-local/fix-applinks-hider-quicklinks_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
