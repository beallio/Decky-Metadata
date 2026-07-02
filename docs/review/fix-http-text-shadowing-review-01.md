# Review: fix-http-text-shadowing

## Scope reviewed
Diff `dev..feat/fix-http-text-shadowing` — `main.py`, `tests/test_no_duplicate_methods.py`,
`tests/test_delisted_index.py`.

## Findings
- **Un-shadowed**: `Plugin` now has exactly one `_http_text` (generic TLS urllib fetcher, 2972)
  and the TA-specific fetcher renamed to `_trueachievements_http_text` (4001). Body of neither
  fetcher changed.
- **Call sites split correctly**: the 5 generic sites remain `self._http_text` — delisted
  download (2327), announcement image (2531), Steam community homecontent (2701), youtube (2897),
  rawg (2934); the 7 TrueAchievements sites now call `self._trueachievements_http_text`.
- **Guard test** `test_no_duplicate_methods.py`: AST-asserts no class in `main.py` defines a
  method name twice — catches the silent-shadowing class of bug the gates miss.
- **Delisted-path test** added to `test_delisted_index.py`: monkeypatches the generic
  `_http_text` and asserts `_download_delisted_index_sync` consumes it (and does not call the TA
  fetcher), proving the delisted download uses the plain fetcher (no Cloudflare/TA blocked-page
  misfire).

## Root cause (for the record)
Two `_http_text` defs; the TA one shadowed the generic one, so the delisted/community fetches
ran through the TA blocked-page heuristic, which rejects any page containing "cloudflare" —
steam-tracker is Cloudflare-served, so its valid 12 MB HTML was always dropped.

## Scope discipline
Rename + call-site updates + two tests only; no fetcher/heuristic/frontend/matcher changes.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
tree clean.

Auto-approved for `dev` per project workflow (dev merges auto-approve; only dev → main is a
human gate).

STATUS: APPROVED
