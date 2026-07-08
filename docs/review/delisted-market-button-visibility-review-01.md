# Review — delisted-market-button-visibility (round 01)

Branch: `feat/delisted-market-button-visibility`
Reviewed against: `docs/plans/2026-07-07_delisted-market-button-visibility.md`

## Verdict

Changes requested. The implementation adds the right high-level field and
frontend market suppression, but it violates the plan's no-network-on-ordinary
metadata-load requirement and fails the whitespace gate.

## Gate status

Reviewer reran:

```bash
./run.sh npm run build
./run.sh scripts/orchestration/run-quality-gates
./run.sh scripts/orchestration/check-review-notes-not-deleted
git diff --check dev...HEAD
```

`npm run build`, `run-quality-gates`, and
`check-review-notes-not-deleted` passed. `git diff --check dev...HEAD`
failed on trailing whitespace in `tests/test_delisted_market.py`.

## Required changes

1. Do not call `_ensure_delisted_index_sync(False)` from ordinary metadata
   sanitization.

   The plan says:

   ```text
   For existing metadata records that have a steam_appid but no
   steam_store_state, classify as delisted when the current cached delisted
   index contains that app id. Do not force a network refresh on ordinary
   metadata load just to classify older records; use the cached in-memory/disk
   index when available.
   ```

   Current code violates that because `_sanitize_metadata` calls
   `_appid_is_delisted_sync`, and `_appid_is_delisted_sync` calls
   `_ensure_delisted_index_sync(False)`:

   ```text
   main.py:766-768
   if steam_store_state == "unknown" and steam_appid:
       if self._appid_is_delisted_sync(steam_appid):
           steam_store_state = "delisted"

   main.py:920-923
   def _appid_is_delisted_sync(self, appid: int) -> bool:
       try:
           index = self._ensure_delisted_index_sync(False)
   ```

   `_ensure_delisted_index_sync(False)` can download the delisted index when no
   fresh cached index exists, so a normal `_sanitize_metadata` call can trigger
   network work. Replace this with a cache-only classification path for
   sanitization. Acceptable behavior:

   - use `self._delisted_index` when already loaded;
   - use `_load_delisted_index_sync()` to read the existing disk cache;
   - do not call `ensure_delisted_index` from `_sanitize_metadata`;
   - keep `_delisted_scan_match_sync` free to use the existing resolver path,
     because scanning is explicitly allowed to ensure the delisted index.

   Add a regression test proving `_sanitize_metadata({"steam_appid": ...})`
   does not call `_ensure_delisted_index_sync`.

2. Make delisted app-id membership robust.

   Current `_appid_is_delisted_sync` compares `row[0] == appid`. Cached JSON can
   contain numbers, but defensive code should normalize via the existing
   `_safe_int`/matching helper pattern so string app ids classify correctly too.

3. Remove trailing whitespace from `tests/test_delisted_market.py`.

   `git diff --check dev...HEAD` reported trailing whitespace on these lines:

   ```text
   tests/test_delisted_market.py:11
   tests/test_delisted_market.py:20
   tests/test_delisted_market.py:23
   tests/test_delisted_market.py:25
   tests/test_delisted_market.py:33
   tests/test_delisted_market.py:37
   tests/test_delisted_market.py:44
   tests/test_delisted_market.py:47
   tests/test_delisted_market.py:51
   tests/test_delisted_market.py:55
   ```

4. Rerun the plan gates:

   ```bash
   ./run.sh npm run build
   ./run.sh scripts/orchestration/run-quality-gates
   ./run.sh scripts/orchestration/check-review-notes-not-deleted
   git diff --check dev...HEAD
   git status --short
   ```

5. Commit the code/test fix and this review note as durable audit evidence, then
   recreate the round-complete marker.

STATUS: CHANGES_REQUESTED
