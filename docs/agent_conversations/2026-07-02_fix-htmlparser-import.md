# 2026-07-02 - fix-htmlparser-import

## Task Objective

Implement `docs/plans/2026-07-01_fix-htmlparser-import.md`: remove the `html.parser`
dependency from the backend Steam Community parser so the Decky sandboxed Python
runtime can import and start the plugin.

## Files Modified

- `main.py`
- `tests/test_no_unsafe_stdlib_imports.py`
- `docs/agent_conversations/2026-07-02_fix-htmlparser-import.md`

## Design Decisions

- Removed `from html.parser import HTMLParser` and the `_SteamCommunityCardParser`
  class because Decky's frozen Python runtime does not include the `html.parser`
  standard-library submodule.
- Reimplemented `_parse_steam_community_ugc` with focused regex extraction over
  bounded Steam `apphub_Card` blocks, preserving the existing screenshot-like
  output shape and existing URL normalization helpers.
- Added a source-level regression guard for `html.parser` imports because local
  `py_compile`, pytest, and frontend gates run on full CPython and cannot catch
  Decky's stripped-runtime import failure.

## Validation Results

- Baseline `scripts/orchestration/run-quality-gates` passed before implementation.
- Red test: `./run.sh uv run --with pytest -- pytest -q tests/test_no_unsafe_stdlib_imports.py`
  failed against the pre-fix import with `from html.parser import HTMLParser`.
- Targeted post-fix tests passed:
  `./run.sh uv run --with pytest -- pytest -q tests/test_community_steam_only.py tests/test_no_unsafe_stdlib_imports.py`.
- Source check passed:
  `./run.sh python3 -c "import ast; source=open('main.py').read(); ast.parse(source); print('no html.parser:', 'html.parser' not in source)"`.
- Full `scripts/orchestration/run-quality-gates` passed after implementation.
