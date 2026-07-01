# Review: scan-steam-first

## Scope reviewed
Diff `dev..feat/scan-steam-first` — `main.py` (`_scan_missing`) + `tests/test_scan_steam_first.py`.

## Findings
- **Steam-first reorder**: `_scan_missing` now resolves the Steam match first by running
  `_metadata_with_steam_news_sync` on a `{"title","source":"Manual","id"}` shell; when a
  `steam_appid` results, it saves that pure Steam record and **does not fetch IGN**. Only when
  Steam finds no match does it fall back to `_auto_fetch_metadata_sync` (IGN), enrich, and save;
  when neither matches, nothing is saved (retryable) and `failed` is counted. Matches plan task 1.
- **Preserved**: `missing` selection, `current`/progress bookkeeping, the `except Exception`
  handler, and `finally: completed += 1` are unchanged. No change to
  `_metadata_with_steam_news_sync`, `_auto_fetch_metadata_sync`, or the resolvers. Task 2.
- **Tests**: (a) Steam match → asserts saved `steam_appid == 15100`, `assigned == 1`, and IGN
  raises if called (verifying it is skipped); (b) Steam miss → IGN fallback saved, IGN called
  once; (c) both miss → nothing saved, `failed == 1`. Task 3.

## Behavior notes
For games on both Steam and IGN, the record is now pure Steam (IGN skipped) — the intended
"Steam authoritative, don't inject IGN into Steam-covered games" behavior the user selected.
Delisted titles Steam storesearch can't return remain covered by the manual Steam App ID
override.

## Scope discipline
Backend-only; single function reordered; no other files, no npm deps.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
working tree clean.

Auto-approved for `dev` per project workflow (dev merges auto-approve; only dev → main is a
human gate).

STATUS: APPROVED
