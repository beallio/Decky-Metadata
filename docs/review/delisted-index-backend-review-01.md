# Review: delisted-index-backend

## Scope reviewed
Diff `dev..feat/delisted-index-backend` — `main.py` + `tests/test_delisted_index.py`.

## Findings
- **Constants**: `STEAM_TRACKER_DELISTED_URL`, weekly TTL, 30 MB cap, cache filename. Plan A.
- **Parser** `_parse_delisted_html`: single regex over the `steam-tracker.com/app/<id>/` name
  anchors; HTML-unescaped, de-duped. **Validated against the real 12 MB page: 10,912 entries,
  338930 → "TRANSFORMERS: Devastation".** Plan B.
- **Cache lifecycle**: `_delisted_index_path` (settings dir), `_download_delisted_index_sync`
  (uses TLS-verified `_http_text`, enforces the size cap, plausibility floor), save/load,
  `_delisted_index_is_fresh`, `_ensure_delisted_index_sync` (in-memory → disk → download →
  stale-fallback, never raises). Plan C.
- **Callables**: `refresh_delisted_index` (force) and `get_delisted_index_status`. Plan D.
- **Matcher** `_resolve_delisted_appid_for_title`: mirrors the storesearch scoring
  (distinctive-token gate, difflib ≥ 0.72, `_is_non_primary_steam_title` −800, extra-number −120,
  < 300 reject). Plan E.
- **Scan tier**: inserted in the Steam-first `else` as storesearch → **delisted** → IGN; a
  delisted hit pins the appid, enriches via `_metadata_with_steam_news_sync`, saves, and
  `continue`s (skipping IGN; the `finally` still increments `completed`). Bookkeeping/exception
  handler preserved. Plan F.
- **Tests**: parser fixture, matcher (match + reject), and scan-tier (delisted match skips IGN;
  miss falls through to IGN). 4 tests pass; full gate green. Plan G.

## Safety
TLS verification on (`_http_text`); 30 MB size cap; single GET; weekly TTL; all network/parse
failures degrade to "no delisted match" and preserve any existing cache — never raises out of
the scan.

## Scope discipline
`main.py` + tests only; no frontend; no npm deps.

## Gates
`run-quality-gates` green; `tests/test_delisted_index.py` passes; tree clean.

Auto-approved for `dev` per project workflow (dev merges auto-approve; only dev → main is a
human gate).

STATUS: APPROVED
