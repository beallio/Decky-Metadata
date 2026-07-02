# Review: fix-htmlparser-import

## Scope reviewed
Diff `dev..feat/fix-htmlparser-import` — `main.py`, `tests/test_no_unsafe_stdlib_imports.py`.

## Findings
- **Root-cause removal**: `from html.parser import HTMLParser` (main.py:28) and the
  `_SteamCommunityCardParser(HTMLParser)` class are deleted. `import html` (for `html.unescape`)
  correctly stays. Residue check clean — no `html.parser`/`HTMLParser` references remain.
- **Regex reimplementation** of `_parse_steam_community_ugc`: card blocks sliced between
  `apphub_Card` class matches (bounded, 50 KB cap per block — no catastrophic backtracking),
  per-block extraction of the UGC image (via `_steam_community_image_url`), link
  (`data-modal-content-url` / `sharedfiles/filedetails` href via `_steam_community_link_url`),
  author (`apphub_CardContentAuthorName` anchor, unescaped + cleaned), optional caption; de-dupe
  by image URL; same cap logic; output still flows through `_sanitize_screenshots`; whole body
  wrapped in try/except → `[]`. Same return shape as before.
- **Validated against the real hub HTML** (appid 55150 capture): 20 items, identical
  ids/urls/authors/links to the HTMLParser implementation.
- **Guard test**: AST-walks `main.py` imports and asserts `html.parser` (the known
  Decky-frozen-runtime gap) is never imported, plus string-level assertions. Closes the gate
  blind-spot that let this regression through.
- Existing `tests/test_community_steam_only.py` passes unchanged (7 tests incl. guard).

## Root cause (for the record)
Decky's PyInstaller-frozen Python does not bundle the `html.parser` stdlib submodule; the import
crashed the backend at module load (zombie process, all callables dead, QAM data empty,
Diagnostics block hidden). Local gates pass because the dev CPython has the full stdlib.

## Scope discipline
Backend-only; parsing mechanism swap with identical behavior; no matcher/frontend/npm changes.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
tree clean.

Auto-approved for `dev` per project workflow (dev merges auto-approve; only dev → main is a
human gate).

STATUS: APPROVED
