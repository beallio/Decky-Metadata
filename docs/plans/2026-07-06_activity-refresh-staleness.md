# Plan: Per-App Live Refresh for the Activity/Community Feed (activity-refresh-staleness)

## Context

**Problem.** The per-game Activity view for non-Steam games is served entirely from
stale cached data. The frontend's Activity display (`src/steam/activity.ts`) is a
custom substitute for Steam's native activity feed: `steamActivityPayloadForApp`
(~line 203) and `getDeckyNativeActivityForApp` / `refreshDeckyNativeActivityForApp`
(~lines 775-803) read exclusively from the in-memory `metadataCache[String(appId)]`,
whose `steam_news` is only ever populated by a manual global batch run — the QAM
"Refresh Activity" button (`src/ContentPanel.tsx` `refreshActivities`, backed by
`start_refresh_steam_activities` / `_refresh_steam_activities` /
`_activity_refresh_match_sync` in `main.py`, lines 451-456, 642-667, 560-572).
Navigating into a specific game's Activity tab never fetches anything live, however
old the cached news is. Contrast: the Community tab IS live (native appcommunityfeed
passthrough in `installCommunityFeedPatch`, `src/steam/activity.ts` ~line 1188).

**Intended outcome — stale-while-revalidate for the per-app Activity view.** When
the user opens a specific non-Steam game's Activity view:

1. The view renders instantly from whatever cached `steam_news` exists (current
   behavior, unchanged — never block the view on a network call).
2. A background fetch is kicked off for **that one appid's** news feed via a new
   lightweight backend RPC.
3. If fresh news arrives, it is persisted, swapped into `metadataCache`, and the
   native activity object is rebuilt so the open view re-renders.
4. A per-appid debounce (15 minutes) prevents rapid back-and-forth navigation from
   spamming Steam's endpoints.
5. Failures are silent (log only) — this is a passive background nicety.

**Design decisions (rationale recorded, do not re-litigate):**

- **Trigger point:** the per-app refresh hooks into the two functions that already
  fire exactly when the Activity view is opened for an app: the store read path
  `getDeckyNativeActivityForApp` (called by the patched `appActivityStore.GetAppActivity`
  / `FetchLatestActivity*` methods in `installNativeActivityStorePatch`) and the HTTP
  read path `steamActivityPayloadForApp` (called by the patched HTTP client in
  `installCommunityFeedPatch` when `activityAppIdFromUrl` matches). No new navigation
  listener or history patch is needed; `installNativeNewsHistoryRedirects` is about
  news-modal history semantics, not view-open, and is NOT the right hook. Both hooks
  may fire for the same navigation — the debounce gate makes that harmless.
- **Debounce mechanism:** an in-memory per-appid last-**attempt** timestamp map plus
  an in-flight set on the frontend, with the already-persisted
  `steam_news_enriched_at` (exposed to the frontend, `src/types.ts:25`) as a cheap
  secondary freshness signal. `steam_news_enriched_at` alone is NOT sufficient:
  `_metadata_with_steam_news_sync` (main.py:805-812) only bumps it when news is
  actually found, so a game with an empty/failed feed would refetch on every
  navigation — exactly the spam the debounce must prevent. The in-memory map records
  attempts (success or not); it resets on Decky reload, which is fine — a reload
  naturally warrants a fresh check.
- **Backend RPC:** a new single-appid method `refresh_steam_activity_for_app` that
  reuses `_activity_refresh_match_sync` (so single-app semantics stay identical to
  the batch path: `include_details=False`, limit 10, same sanitization) and
  `_save_activity_pipeline_metadata`. The existing batch RPC
  `startRefreshSteamActivities` is a poor fit for one app: it spins up the shared
  `_activity_refresh_task` / `_activity_refresh_progress` machinery that the QAM
  progress poller (`getActivityRefreshProgress`) observes, refuses to start while a
  batch is running, and returns progress instead of data. `enrich_steam_app`
  (main.py:393) is also wrong: it runs full detail enrichment
  (`include_details=True`, appdetails + deck-compat fetches) — too heavy and
  side-effectful for a passive background refresh.
- **Failure handling:** silent. The frontend catches and logs (`log.*` /
  `frontendLog`) — no toast, no error UI, view untouched.

**Relevant files:** `src/steam/activity.ts`, `src/backend.ts`, `src/types.ts`,
`main.py`, `tests/` (see conventions in Task sections), plus a new pure module
`src/steam/activityRefreshGate.ts` and new test files.

**Slug used throughout this plan:** `activity-refresh-staleness`

---

## Orchestration Contract

**Slug:** `activity-refresh-staleness`

**Plan file:**

```text
docs/plans/2026-07-06_activity-refresh-staleness.md
```

**Implementation branch:**

```text
feat/activity-refresh-staleness
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/activity-refresh-staleness_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/activity-refresh-staleness_finalized
```

**Review notes:**

```text
docs/review/activity-refresh-staleness-review-*.md
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
git checkout -b feat/activity-refresh-staleness
```

Commit this plan first:

```bash
git add docs/plans/2026-07-06_activity-refresh-staleness.md
git commit -m "docs(plan): add activity-refresh-staleness implementation plan"
```

---

## Implementation Tasks

### Scope discipline for this plan

- Do NOT change the batch "Refresh Activity" path: `start_refresh_steam_activities`,
  `_refresh_steam_activities`, `get_activity_refresh_progress`,
  `startRefreshSteamActivities`, or anything in `src/ContentPanel.tsx`.
- Do NOT touch the Community tab passthrough (the `appcommunityfeed` branch of
  `installCommunityFeedPatch`) or `src/communityFeed.ts`.
- Do NOT add any new UI surface (no buttons, toasts, settings, or progress
  indicators). This feature is invisible except for fresher Activity data.
- Do NOT change `installNativeNewsHistoryRedirects` or any history/navigation patch.
- `dist/` is committed in this repo; rebuild it with `npm run build` and commit the
  resulting output together with the source changes (existing convention — see
  recent `build:` commits).

### Task 1 — backend: `refresh_steam_activity_for_app` RPC (TDD)

**Tests first:** create `tests/test_activity_per_app_refresh.py`. Follow the
existing conventions: `make_plugin(tmp_path, monkeypatch)` constructing a real
`main.Plugin()` with `main.decky.DECKY_PLUGIN_SETTINGS_DIR` pointed at `tmp_path`
(see `tests/test_clear_cache.py`), and `asyncio.run(...)` to drive async methods
(see `tests/test_steam_appid_override.py`). Monkeypatch
`Plugin._metadata_with_steam_news_sync` so no test performs network I/O. Cover:

1. **No metadata record** → `asyncio.run(plugin.refresh_steam_activity_for_app(999))`
   returns `None` and does not call the fetch (monkeypatch the fetch to raise
   `AssertionError` if called).
2. **Batch refresh running** → with
   `plugin._activity_refresh_task = types.SimpleNamespace(done=lambda: False)`,
   the method returns `None` without fetching (same raise-if-called monkeypatch).
3. **Matched** → seed `plugin._data["metadata"]["101"]` with a record whose
   `steam_news` is empty; monkeypatch `_metadata_with_steam_news_sync` to return a
   copy with a non-empty sanitizable `steam_news` list and assert it was invoked
   with `include_details=False` and limit `10`. The call returns the refreshed
   record, `plugin._data["metadata"]["101"]` now carries the fresh `steam_news`,
   and the record survives a reload from disk (`plugin._data = plugin._default_data();
   plugin._load_data()` — same persistence assertion style as `test_clear_cache.py`).
4. **Miss with metadata** → monkeypatch the fetch to return a record with empty
   `steam_news`. The method returns `None` (nothing for the frontend to swap in)
   but still persists the refreshed record, mirroring the batch pipeline's
   save-on-miss-with-metadata behavior (`backend/scan_runner.py` saves whenever
   `result["metadata"]` is truthy).

**Then implement** in `main.py`, next to `start_refresh_steam_activities`
(~line 451):

```python
async def refresh_steam_activity_for_app(self, app_id: int) -> dict[str, Any] | None:
    # Per-app stale-while-revalidate refresh for the Activity view. Skip while a
    # batch refresh runs: it already covers this app and shares the save path.
    if self._activity_refresh_task and not self._activity_refresh_task.done():
        return None
    self._load_data()
    metadata = self._data["metadata"].get(str(app_id))
    if not isinstance(metadata, dict):
        return None
    target: ScanPipelineTarget = {
        "app_id": int(app_id),
        "title": self._clean_game_title(str(metadata.get("title") or "")),
        "metadata": dict(metadata),
    }
    result = await asyncio.to_thread(self._activity_refresh_match_sync, target)
    if result["metadata"]:
        await self._save_activity_pipeline_metadata(int(app_id), result["metadata"])
    return result["metadata"] if result["status"] == "matched" else None
```

Notes:

- Reuse `_activity_refresh_match_sync` (main.py:560) verbatim — do not duplicate
  its fetch/sanitize logic.
- `_save_activity_pipeline_metadata` (main.py:579) only assigns
  `self._data["metadata"][str(app_id)]` and saves — it does not clobber other apps'
  records, so a save landing after concurrent writes is safe.
- Keep `tests/test_no_duplicate_methods.py` green (unique method name).

### Task 2 — frontend: pure debounce gate module (TDD)

**Tests first:** create `tests/test_activity_refresh_gate.py` following the
node-subprocess convention in `tests/test_community_feed_passthrough.py`
(`subprocess.run(["node", "--input-type=module", "-e", script], check=True)` with an
inline ESM script importing the `.ts` module directly — node's type stripping
handles it, so the module must stay plain typed JS: no imports, no enums, no
decorators).

**Then implement** `src/steam/activityRefreshGate.ts` — a pure module with no
imports so node can execute it directly:

```ts
export const ACTIVITY_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export type ActivityRefreshGate = {
  shouldAttempt: (appId: number, nowMs: number, enrichedAtSeconds?: number) => boolean;
  markAttempt: (appId: number, nowMs: number) => void;
  markSettled: (appId: number) => void;
};

export const createActivityRefreshGate = (
  intervalMs: number = ACTIVITY_REFRESH_INTERVAL_MS
): ActivityRefreshGate => { /* attempts Map<number, number>, inFlight Set<number> */ };
```

`shouldAttempt(appId, nowMs, enrichedAtSeconds)` returns `false` when any of:
`appId` is falsy; the appid is in flight; the last recorded attempt is within
`intervalMs` of `nowMs`; or `enrichedAtSeconds` (unix seconds, may be 0/undefined)
converted to ms is within `intervalMs` of `nowMs` (covers "batch refresh just ran"
without a redundant refetch). `markAttempt` records the timestamp and adds to the
in-flight set; `markSettled` removes from the in-flight set only (the attempt
timestamp stays, so failures are debounced too).

Test cases: first attempt allowed; second attempt within the interval denied;
allowed again once `nowMs` advances past the interval; denied while in flight even
past the interval, allowed after `markSettled` plus interval expiry of the recorded
attempt; denied when `enrichedAtSeconds` is fresh; allowed when `enrichedAtSeconds`
is 0/undefined/stale; appid 0 denied.

### Task 3 — frontend: wire the per-app refresh into the Activity view

1. `src/backend.ts`: add, next to `startRefreshSteamActivities` (~line 63):

   ```ts
   export const refreshSteamActivityForApp = callable<
     [appId: number],
     MetadataData | null
   >("refresh_steam_activity_for_app");
   ```

2. `src/steam/activity.ts`:
   - Import `refreshSteamActivityForApp` from `../backend` (the file already
     imports `frontendLog` from there) and `createActivityRefreshGate` from
     `./activityRefreshGate`.
   - Add a module-level gate instance and a fire-and-forget helper (NOT exported
     as a hook into anything else; keep it local to this module):

     ```ts
     const activityRefreshGate = createActivityRefreshGate();

     const maybeRefreshSteamNewsForApp = (appId: number) => {
       if (!appId || !isNonSteamApp(getOverview(appId))) return;
       const enrichedAt = Number(metadataCache[String(appId)]?.steam_news_enriched_at || 0);
       if (!activityRefreshGate.shouldAttempt(appId, Date.now(), enrichedAt)) return;
       activityRefreshGate.markAttempt(appId, Date.now());
       void (async () => {
         try {
           const previous = metadataCache[String(appId)];
           const refreshed = await refreshSteamActivityForApp(appId);
           if (!refreshed) return;
           const newsKey = (m?: MetadataData | null) =>
             JSON.stringify((m?.steam_news || []).map((n) => [n.id, n.gid, n.title, n.date]));
           const changed = newsKey(previous) !== newsKey(refreshed);
           metadataCache[String(appId)] = refreshed;
           if (changed) await refreshDeckyNativeActivityForApp(appId);
         } catch (error) {
           // Passive background refresh: silent by design — log only, no toast/UI.
           log.info("activity", "per-app news refresh failed", error);
         } finally {
           activityRefreshGate.markSettled(appId);
         }
       })();
     };
     ```

   - Call `void maybeRefreshSteamNewsForApp(appId);` from the two view-open read
     paths:
     - `steamActivityPayloadForApp` (~line 203): immediately after the existing
       `if (!appId || !isNonSteamApp(overview)) return null;` guard, before
       `await ensureMetadataCacheFn()` — the cached payload must still be returned
       without waiting on the refresh.
     - `getDeckyNativeActivityForApp` (~line 775): after its overview guard and
       BEFORE the `if (cached) return cached;` early return — the cached-hit path
       is exactly the stale case that needs revalidation.
   - Do not modify `installActivityRefreshedListener`, `refreshDeckyNativeActivityForApp`,
     or the patch installers beyond the two one-line call insertions above.
     `refreshDeckyNativeActivityForApp` already rebuilds the native activity object,
     updates `deckyNativeActivityCache`, and writes it into
     `appActivityStore.m_mapAppActivity` (MobX-observable), which is the same
     re-render mechanism the existing `decky-metadata:activity-refreshed` listener
     relies on — reuse it, don't invent another.
   - The `changed` comparison exists so an unchanged feed does not gratuitously
     rebuild/swap the native activity object under an open view on every
     navigation past the debounce window.

3. Rebuild: `npm run build` and commit the `dist/` output with the source changes.

### Task 4 — quality gates

Run `scripts/orchestration/run-quality-gates` (tsc --noEmit, rollup build, Python
byte-compile, full pytest suite) and fix anything it surfaces before marking the
round complete.

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

Automated (must pass in this round):

1. `uv run --with pytest -- pytest -q` — new `tests/test_activity_per_app_refresh.py`
   and `tests/test_activity_refresh_gate.py` pass alongside the full existing suite
   (notably `test_no_duplicate_methods.py` and the scan-pipeline tests, which must
   be untouched).
2. `npx tsc --noEmit` and `npm run build` succeed; rebuilt `dist/` is committed.
3. `git diff dev --stat` shows changes only in: `main.py`, `src/backend.ts`,
   `src/steam/activity.ts`, `src/steam/activityRefreshGate.ts` (new), the two new
   test files, `dist/`, this plan, and committed review notes. Anything else is a
   scope violation.

Deferred (on-device manual verification — NOT part of this round's gates; record
as deferred in the session log):

1. On a Steam Deck with the built plugin: open a non-Steam game's Activity tab —
   cached news renders instantly with no added navigation lag; the plugin log shows
   one `refresh_steam_activity_for_app` call for that appid.
2. Navigate away and back within 15 minutes — no second backend call (debounce).
3. After fresh news exists upstream (or after clearing `steam_news` for one app in
   the settings JSON), reopening the Activity tab swaps in the fresh feed without
   a manual batch refresh.
4. The QAM "Refresh Activity" batch button still behaves exactly as before, and a
   per-app refresh attempted while the batch runs is a silent no-op.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished activity-refresh-staleness
```

This writes:

```text
/tmp/Decky-Metadata/activity-refresh-staleness_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer activity-refresh-staleness`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/activity-refresh-staleness-review-*.md
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
   scripts/orchestration/clear-finished activity-refresh-staleness
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
   git add docs/review/activity-refresh-staleness-review-*.md
   git commit -m "docs(review): record activity-refresh-staleness review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished activity-refresh-staleness
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer activity-refresh-staleness` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed activity-refresh-staleness
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize activity-refresh-staleness
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/activity-refresh-staleness_finalized
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
scripts/orchestration/finalize activity-refresh-staleness
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/activity-refresh-staleness_finished
/tmp/Decky-Metadata/activity-refresh-staleness_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
