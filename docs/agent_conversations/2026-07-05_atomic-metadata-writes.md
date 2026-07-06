# 2026-07-05 Atomic Metadata Writes

## Objective

Implement `docs/plans/2026-07-05_atomic-metadata-writes.md`.

## Source

Thermo-nuclear review (`docs/reviews/2026-07-05_thermo-nuclear-fable.md`), MAJOR 7: `save_data`
wrote the canonical metadata store via a direct `write_text` to the live path. An interrupted
write (handheld hard-suspend/power-loss) truncates `decky_metadata.json`; the next `load_data`
call fails to parse it and the store silently reverts to `default_data()`.

## Files Modified

- `backend/storage.py`
- `tests/test_atomic_metadata_writes.py` (new)

## Design Decisions

- Mirrored the already-correct pattern from `backend/providers/delisted.py`
  `save_delisted_index`: write to a `<name>.tmp` sibling, then `os.replace` onto the target.
  `os.replace` is atomic on the same filesystem, so a reader always sees either the old complete
  file or the new complete file, never a partial one.
- Kept the return tuple shape (`(deepcopy(data), st_mtime_ns)`), JSON formatting
  (`ensure_ascii=False, indent=2`), and the post-replace `st_mtime_ns` read unchanged, so
  `Plugin._save_data`'s cache-seeding in `main.py` and the `load_data` mtime-cache comparison
  keep working exactly as before.
- Did not touch `load_data`, the deepcopy-on-hit behavior, or `Plugin`'s cache fields — out of
  scope per the plan.
- Did not extract a shared `atomic_write_json` helper. The plan flagged this as optional and
  guarded ("do NOT do it" if it touches `delisted.py`'s error-logging contract); `delisted.py`
  wraps its write in a `try/except` that logs and swallows failures, while `storage.save_data`
  must propagate exceptions to the caller, so unifying them would either change one function's
  error-handling contract or need a parameterized helper for marginal benefit. Left as a
  session-log note for a possible later pass rather than done here.

## Validation Results

- Baseline: `git status --short` clean on `dev` before branching.
- TDD red: `./run.sh uv run --with pytest -- pytest -q tests/test_atomic_metadata_writes.py`
  failed with `AttributeError: module 'backend.storage' has no attribute 'os'` when attempting to
  monkeypatch `os.replace` — confirms `storage.py` had no `os` import / no replace-based write
  path yet.
- Fix applied: `save_data` now writes to a temp sibling and `os.replace`s onto the target;
  `import os` added.
- TDD green: same test file now passes, including the load-bearing assertion that a monkeypatched
  `os.replace` failure raises `OSError` while leaving the original file's content intact
  (not truncated).
- Full suite: `./run.sh uv run --with pytest -- pytest -q` — all tests pass, including the
  pre-existing `tests/test_load_data_caching.py` and `tests/test_clear_cache.py` round-trip/cache
  tests.
- `./run.sh python3 -m py_compile main.py backend/*.py backend/providers/*.py` — passed.
- `./run.sh npm run build` — passed; `dist/` unchanged (backend-only change, no frontend diff).

## Deferred

- Dropping the `copy.deepcopy` on every cache hit and collapsing the `_data_cache` /
  `_data_cache_mtime_ns` tuple into a single mutable `Plugin._data` authority — explicitly out of
  scope per the plan; broader ownership refactor with its own behavioral risk, deferred to a
  separate plan.
- Optional shared `atomic_write_json(path, obj)` helper for `storage.py` and `delisted.py` — not
  done this round (see Design Decisions above); worth revisiting if a future change touches both
  call sites anyway.
