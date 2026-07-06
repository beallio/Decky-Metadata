# Review — qam-panel-metadata-fixes (round 01)

Branch: `feat/qam-panel-metadata-fixes`
Reviewed against: `docs/plans/2026-07-06_qam-panel-metadata-fixes.md`
Commit reviewed: `37ffb2b` (parent `c119aee`, base `dev` @ `bdb78dc`)
Review performed by: Fable (independent second-party reviewer). Full review:
`/tmp/fable-reviews/qam-panel-metadata-fixes-r1.md`.

## Verdict

CHANGES_REQUESTED — one production correctness bug in Task A's IGN merge path (confirmed by
reproduction), plus a minor documentation gap. Everything else (predicate refactor, resolver
gating, reconciliation invariant tests, Tasks B & C, scope discipline) passes review.

## Gate status

Orchestrator-verified before this review: `uv run pytest` full suite green, `npx tsc --noEmit`
clean, `npm run build` deterministic, `git status --short` empty. Gates are not the issue here —
this is a semantic/functional-correctness finding the gates do not catch, because the existing
test's mock is unrealistic (see Required change 2).

## Required changes

1. **(Blocking) Fix the IGN merge in `_metadata_scan_match_sync`** (`main.py:541-543`). Current
   code:

   ```python
   merged = dict(best_partial)
   merged.update(ign_metadata)          # clobbers pinned fields
   enriched = self._metadata_with_steam_news_sync(merged, title, 10)
   ```

   Every real IGN result is sanitized (`_auto_fetch_metadata_sync` → `ign_provider.fetch_metadata`
   → `_game_to_metadata` → `_sanitize_metadata`, `main.py:680`, `682-768`), and `_sanitize_metadata`
   unconditionally emits `"steam_appid": None`, `"steam_store_url": ""`, `"steam_news": []` for an
   IGN record (`main.py:759-768`). So `merged.update(ign_metadata)` overwrites the pinned
   `steam_appid` with `None` and discards the already-fetched `steam_news`. The subsequent
   `_metadata_with_steam_news_sync` call then falls back to `_resolve_steam_appid_for_title` (title
   search) — which is exactly the resolver that fails for delisted titles (that's why
   `_resolve_delisted_appid_for_title` exists in the first place). Reproduced: a delisted appid 456
   pinned, appdetails failing, IGN hit with a description → persisted record has
   `description: "IGN Desc"` but `steam_appid: None`, `steam_news: []`, counted `assigned: 1`. This
   directly violates plan Step 4 ("merge so the pinned `steam_appid`/`steam_news` survive the IGN
   backfill") and plan test spec item 3. Downstream impact: `steam_appid` drives the Community-tab
   appcommunityfeed rewrite and store links, and for delisted titles it is unrecoverable by title
   search — the exact case this plan exists to fix ends up losing the appid whenever IGN backfills
   it. Counters reconcile (the record is complete by predicate) but the functional content
   regresses.

   Requested fix: overlay only IGN's non-empty fields, or re-pin the Steam fields from
   `best_partial` after `update()` when IGN's are falsy, e.g.:

   ```python
   merged = dict(best_partial)
   for key, value in ign_metadata.items():
       if value or key not in merged:
           merged[key] = value
   ```

2. **(Blocking, same change) Harden `test_ign_backfill_completes_appid_only`**
   (`tests/test_scan_counter_reconciliation.py:63-88`). It mocks `_auto_fetch_metadata_sync` to
   return a raw `{"title", "source", "description"}` dict WITHOUT the `steam_appid`/`steam_news`
   keys every real sanitized IGN record carries, so `update()` has nothing to clobber and the test
   passes despite the bug. Pass the IGN mock's return through `plugin._sanitize_metadata(...)` so
   the merge is exercised against a realistic key set (this will make the test's own
   `m["steam_appid"] == 123`-style assertion fail against the current code, proving the fix is
   needed). Consider also adding a delisted-variant case where the appid is NOT recoverable by
   title search, to guard the specific regression this plan was written to prevent.

3. **(Minor) Record rationale in the session log** for two decisions Fable confirmed as correct but
   which were left undocumented, per the plan's scope-discipline requirement to record rationale
   for any edited existing-test expectation or judgment call beyond the plan's literal text:
   - The `enriched_titles` expectation change in `tests/test_scan_resolves_steam_appid.py`
     (`["Broken Game", "Wobbly Life"]` → `[..., "Wobbly Life", "Wobbly Life"]`): this reflects the
     plan's own Step 4 instruction to re-run `_metadata_with_steam_news_sync` on an IGN backfill, so
     it is a legitimate, plan-mandated behavior change — not a forbidden weakening — but needs the
     rationale recorded.
   - The Steam-arm partial guard added in `_steam_scan_match_sync` (only return a partial `"miss"`
     when something was actually resolved — `steam_appid` or `steam_news` — else `"miss"` with
     `metadata: None`): a good call not spelled out in the plan (preserves prior total-miss
     persistence behavior), but should be noted as an implementer judgment call.

Not required to change: the predicate refactor (`_metadata_is_complete`), the resolver gating
logic, the reconciliation-invariant tests, Tasks B and C, and the other (whitespace-only) hunk in
`test_scan_resolves_steam_appid.py` all pass review as implemented.

STATUS: CHANGES_REQUESTED
