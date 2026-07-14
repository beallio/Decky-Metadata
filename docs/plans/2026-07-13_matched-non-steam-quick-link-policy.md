# Plan: Matched Non-Steam Quick-Link Policy (matched-non-steam-quick-link-policy)

## Context

Decky Metadata makes matched non-Steam shortcuts render Steam's native Game Info
quick-links row by temporarily presenting the shortcut as a native Steam app. The
native row currently assumes the displayed shortcut appid is a listed Steam app:
it always adds Store Page and Support, and its DLC and Points Shop predicates look
up data under the synthetic shortcut appid. That produces dead or misleading
links for delisted and non-Steam entries and prevents valid optional links from
appearing for matched games.

Implement one policy for the quick-links row with these outcomes:

| App state | Required quick-link behavior |
| --- | --- |
| Native Steam app | Leave SteamUI output unchanged. |
| Matched non-Steam, store state `available` or `unknown` | Keep Store Page; remove Support. |
| Matched non-Steam with known DLC | Put DLC immediately after Store Page. |
| Matched non-Steam with known Points Shop support | Put Points Shop immediately after Community Hub. |
| Matched non-Steam, store state `delisted` | Remove Store Page and Support; if DLC is known, place it in the former Store slot; preserve Community Hub and optional Points Shop. |
| Never-on-Steam shortcut | Preserve the existing behavior that suppresses the entire quick-links row. |

The backend already fetches Steam Store app-details in
`backend/providers/steam.py`, normalizes records in `main.py`, and exposes them
through `MetadataData` in `src/types.ts`. Add two persisted availability fields:

- `steam_dlc_appids: number[]` — unique positive appids from app-details
  `data.dlc`; the row is eligible for DLC when this list is non-empty.
- `has_points_shop: boolean` — true when a successful app-details response
  includes Steam category `29` (Steam Trading Cards), which is the conservative
  Points Shop proxy selected for this feature.

A successful app-details response must emit both fields even when the values are
empty/false so a refresh clears stale availability. A transient app-details
failure must preserve the last known values. For legacy records, sanitize a
missing DLC field to `[]`; when `has_points_shop` is absent, derive it from
category `29` so existing Steam-derived category data remains useful. An explicit
false value wins over stale categories after a successful refresh. No new backend
RPC or third-party dependency is needed.

On the frontend, generalize the existing section hook in
`src/steam/routerPatches.ts`. Continue locating the native quick-links element
through the established `RegisterSection`/info-boundary path, but for matched
shortcuts wrap the native quick-links component, call it normally, and transform
the returned `links` prop. Do not mutate `overview`, `details`, or MobX store
instances to force Steam's native predicates. Preserve cached wrapper identity,
walk only React elements/arrays, and fail open with diagnostics if SteamUI changes
shape. These are mandatory safeguards from
`docs/runbooks/on-device-verification.md`.

This plan covers quick-link features only. Populating Recommended and Community
controller layouts uses a separate Steam Input query/store path and is explicitly
deferred to its own prototype plan. Native Steam games, controller-layout
behavior, release/version changes, and unrelated cleanup are out of scope.

**Slug used throughout this plan:** `matched-non-steam-quick-link-policy`

---

## Orchestration Contract

**Slug:** `matched-non-steam-quick-link-policy`

**Plan file:**

```text
docs/plans/2026-07-13_matched-non-steam-quick-link-policy.md
```

**Implementation branch:**

```text
feat/matched-non-steam-quick-link-policy
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/matched-non-steam-quick-link-policy_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/matched-non-steam-quick-link-policy_finalized
```

**Review notes:**

```text
docs/review/matched-non-steam-quick-link-policy-review-*.md
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
git checkout -b feat/matched-non-steam-quick-link-policy
```

Commit this plan first:

```bash
git add docs/plans/2026-07-13_matched-non-steam-quick-link-policy.md
git commit -m "docs(plan): add matched-non-steam-quick-link-policy implementation plan"
```

---

## Implementation Tasks

Work in order and follow TDD for the pure backend and frontend behavior.

### 1. Add and normalize Steam availability metadata

1. Extend `MetadataRecord` in `main.py` and `MetadataData` in `src/types.ts` with
   `steam_dlc_appids` and `has_points_shop` using the shapes defined in Context.
2. In `backend/providers/steam.py::steam_appdetails_for_appid`, parse `data.dlc`
   into a stable, deduplicated list of positive integer appids. Always include
   that list and `has_points_shop` in every successful usable response; set
   `has_points_shop` from the presence of category id `29`.
3. In `Plugin._sanitize_metadata`, reject malformed DLC values, deduplicate while
   preserving input order, and default missing values as specified above. Treat
   only an actual JSON/Python boolean as an explicit Points Shop value; otherwise
   use the legacy category-29 derivation.
4. In `_metadata_with_steam_news_sync`, explicitly copy the two availability
   fields from every successful app-details result even when empty/false. Retain
   the existing record values when `_steam_appdetails_for_appid` returns `None`.
5. Add/update pytest coverage in `tests/test_steam_appdetails.py` and the metadata
   boundary/sanitization tests before changing production behavior. Cover valid,
   duplicate, invalid, missing, stale-clearing, and transient-failure cases.

### 2. Implement a pure quick-link policy

Create `src/steam/quickLinkPolicy.ts` with a small descriptor type and pure
helpers, plus `src/steam/quickLinkPolicy.test.ts`.

The policy must:

1. Apply only when the displayed app is a non-Steam shortcut with a positive
   matched `steam_appid`; callers handle never-on-Steam suppression separately.
2. Classify native descriptors without comparing localized labels:
   `HelpAppPage` is Support, `GameHub` is Community Hub, and stable Steam URL
   paths identify Store, DLC, and Points Shop descriptors.
3. Remove Support for every matched non-Steam shortcut.
4. Remove Store only when `steam_store_state === "delisted"`; `available` and
   `unknown` retain Store (unknown deliberately fails open).
5. Remove any native DLC/Points descriptors before inserting normalized versions,
   so repeated renders and unexpected native data cannot create duplicates.
6. Insert DLC directly after the original Store slot. When Store was removed for
   a delisted game, DLC occupies that slot; if the native Store anchor is absent,
   place DLC immediately before Community Hub, or at the start when neither
   anchor exists.
7. Insert Points Shop directly after Community Hub; append it when the Community
   anchor is absent.
8. Preserve every unrelated descriptor and its relative order.
9. Build links for the real matched `steam_appid`, never the shortcut appid. Use
   a cached Steam URL-builder module exposing `BuildStoreAppDlcURL` and
   `BuildAppPointsShopURL` when available, with
   `https://store.steampowered.com/dlc/<appid>/` and
   `https://store.steampowered.com/points/shop/app/<appid>` as deterministic
   fallbacks. Resolve Steam localization tokens
   `#AppDetails_Links_DLC`/`#AppDetails_Links_PointsShop`, with `DLC` and
   `Points Shop` as fallback labels.

Tests must assert the complete output order for listed, delisted, unknown,
DLC-only, Points-only, and combined cases; Support removal; native descriptor
deduplication; preservation of unrelated links; and real-appid URLs.

### 3. Integrate the policy into the established section hook

1. Generalize `installNeverOnSteamQuickLinksSuppression` in
   `src/steam/routerPatches.ts` into a non-Steam quick-link policy installer and
   update its import/install step in `src/steam/install.ts`. Preserve the existing
   bounded module-fingerprint retries, warnings, and unpatch cleanup.
2. Preserve the current info-section wrapper cache. Add a second cache keyed by
   the native quick-links component type so React receives a stable wrapper type
   across renders.
3. For a never-on-Steam shortcut, continue replacing the row with the stable null
   component. For a matched shortcut, replace the row type with the cached policy
   wrapper. The wrapper calls the original component, validates that its result is
   a React element with a `links` array, transforms that array through the pure
   helper, and returns `React.cloneElement` with the new links.
4. If metadata is absent, the app is native Steam, the original output is not the
   expected shape, URL/localization discovery fails, or transformation throws,
   return native output unchanged and emit the existing frontend warning style.
   URL/localization fallback values are not shape failures.
5. Do not enumerate or clone MobX store instances during render, do not patch
   getter-only webpack exports, and do not create wrapper functions inside each
   render.

### 4. Extend deterministic regression coverage

1. Extend `scripts/deck/js/check_quicklinks.js` to report DLC, Points Shop,
   Support, Store, Community, and their visible order while retaining its existing
   metadata markers.
2. Extend `scripts/deck/verify/smoke_quicklinks.sh` with an optional fourth
   feature-fixture appid. Existing three-argument callers remain valid. When the
   feature fixture is supplied, assert Store → DLC → Community Hub → Points Shop
   order and absence of Support; for the existing delisted fixture assert Store
   and Support are both absent; preserve never-on-Steam row suppression checks.
3. Let `scripts/deck/verify/run_all.sh` pass an optional
   `QUICKLINK_FEATURE_APPID` through to the smoke without making it a launch
   target. Update the existing device-tooling tests for the new optional route.

### 5. Documentation and audit record

Update `README.md` to describe the matched-shortcut quick-link behavior and
record the implementation, decisions, files changed, and validation results in
`docs/agent_conversations/2026-07-13_matched-non-steam-quick-link-policy.md`.
Do not change versions, create a release, or include controller-layout work.

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

### Static and automated verification

Before implementation, confirm routing and the affected checks:

```bash
scripts/decky doctor
scripts/decky verify-change dev --explain
```

During TDD, run focused suites through the cache-isolating wrapper:

```bash
./run.sh npm test -- src/steam/quickLinkPolicy.test.ts
./run.sh uv run --with pytest -- pytest -q tests/test_steam_appdetails.py tests/test_type_boundary_hardening.py
```

Then run the generated Quality Gates section exactly. Confirm `dist/index.js` is
regenerated and committed because frontend code changed. Also run:

```bash
git diff --check
git status --short
```

Expected result: all TypeScript checks, frontend tests/build, Python compile,
pytest, and version-drift checks pass; the only files in the implementation
branch are the plan, scoped implementation/tests/tooling/docs, regenerated
`dist/index.js`, the session log, and committed orchestrator review notes.

### Required on-device verification

This verification is mandatory before the implementation round is marked
complete; it is not deferred. Because `main.py`/`backend/` change, the frontend-
only deploy path is insufficient.

1. Confirm Deck availability and copy a full package:

   ```bash
   scripts/decky status --deck
   scripts/decky package-push --build --push
   ```

2. Install the copied ZIP through Decky's Developer Mode UI and reload SteamUI.
3. In Decky Metadata, refresh/reapply the Steam app ID for the current Wobbly Life
   shortcut (`2405230651` → Steam `1211020`) so the new backend fields are
   populated. This current semantic fixture has both DLC and category `29`.
4. Run the full render suite without launching a game:

   ```bash
   QUICKLINK_FEATURE_APPID=2405230651 scripts/deck/verify/run_all.sh --no-launch --extended
   ```

5. Confirm the device smoke proves:
   - Wobbly Life shows Store Page, DLC, Community Hub, and Points Shop in that
     order, with no Support;
   - the selected delisted match shows neither Store Page nor Support but retains
     Community Hub and rich metadata;
   - the never-on-Steam match still has no quick-links row;
   - the policy survives subsection re-render and extended idle checks.
6. Manually activate DLC and Points Shop with a controller and confirm Steam opens
   the real-app pages for `1211020`, not pages for shortcut `2405230651`. Return to
   Game Info after each activation and confirm focus/navigation remains usable.

If the named feature fixture no longer exists or no longer has both capabilities,
select another existing matched non-Steam shortcut whose freshly fetched
`steam_dlc_appids` is non-empty and `has_points_shop` is true, set
`QUICKLINK_FEATURE_APPID` to that shortcut id, and record both IDs and the reason
in the session log. Do not synthesize or persist fake production metadata merely
to make the device smoke pass.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished matched-non-steam-quick-link-policy
```

This writes:

```text
/tmp/Decky-Metadata/matched-non-steam-quick-link-policy_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer matched-non-steam-quick-link-policy`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/matched-non-steam-quick-link-policy-review-*.md
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
   scripts/orchestration/clear-finished matched-non-steam-quick-link-policy
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
   git add docs/review/matched-non-steam-quick-link-policy-review-*.md
   git commit -m "docs(review): record matched-non-steam-quick-link-policy review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished matched-non-steam-quick-link-policy
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer matched-non-steam-quick-link-policy` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed matched-non-steam-quick-link-policy
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize matched-non-steam-quick-link-policy
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/matched-non-steam-quick-link-policy_finalized
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
scripts/orchestration/finalize matched-non-steam-quick-link-policy
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/matched-non-steam-quick-link-policy_finished
/tmp/Decky-Metadata/matched-non-steam-quick-link-policy_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
