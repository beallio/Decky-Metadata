# Plan: Self-update panel: backend updater + QAM section (self-update-panel)

## Context

**Goal.** Give Decky-Metadata an in-QAM "check for updates / install update" panel
that self-updates the plugin from its GitHub Releases, ported from the
SDH-Ludusavi design. The plugin never downloads or installs anything itself: it
**discovers** a trustworthy release candidate (URL + sha256 + version from a
release manifest) and hands it to **Decky Loader's own** `utilities/install_plugin`
RPC, which downloads, verifies the whole-zip sha256, and installs over the running
plugin. The backend also keeps a pending-install record and reconciles it on the
next startup (Decky restarts the plugin at the new version).

**Prerequisite (must be true before implementation starts).** The naming/versioning
groundwork on branch `self-update-groundwork` (commit `03806d5`) must already be
merged into `dev`. That commit renamed the plugin identity to `Decky-Metadata`
(`plugin.json` `name` + `definePlugin` `name`), added
`--release-version/--release-tag/--channel/--emit-release-metadata` to
`scripts/package.mjs`, and made release CI emit the `.manifest.json` + `.zip.sha256`
sidecars the updater trusts. If `dev` does not contain that work, stop and merge it
first — the port depends on the `Decky-Metadata` identity and the release manifest
existing. Verify with: `node -p "require('./plugin.json').name"` must print
`Decky-Metadata`, and `scripts/package.mjs` must accept `--emit-release-metadata`.

**Design reference.** `docs/plans/2026-07-17_plugin-self-update.md` — section 0
(resolved constants), section 1 (how SDH's mechanism works), section 3 (file-by-file
port). The source to port from is the sibling checkout `../SDH-ludusavi`:
- Backend: `py_modules/sdh_ludusavi/updater_client.py`, `updater_discovery.py`,
  `updater_models.py`, `updater_pending.py`, `updater_rate_limit.py`, `updater.py`.
- Frontend: `src/utils/deckyInstaller.ts`, `src/controllers/pluginUpdateReducer.ts`,
  `src/controllers/pluginUpdateController.tsx`, `src/components/PluginUpdateSection.tsx`.

**Resolved constants (do not re-derive).** `PLUGIN_NAME = "Decky-Metadata"`,
`PACKAGE_NAME = "decky-metadata"`, GitHub owner/repo `beallio/Decky-Metadata`,
release manifest asset name `Decky-Metadata-<tag>.manifest.json`,
frontend `EXPECTED_PLUGIN_NAME = "Decky-Metadata"`. The manifest schema the
backend validates is emitted by `scripts/package.mjs` (schemaVersion 1;
fields pluginName/packageName/version/sourceVersion/tag/channel/assetName/sha256/
generatedAt; `channel` is `"stable"` or `"dev"`; `"v" + version === tag`).

**Load-bearing repo facts (verified — rely on these).**
- `main.py` line ~60 does `sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))`
  before `from backend import ...`. A new `backend/updater/` subpackage is therefore
  importable on-device exactly like the existing `backend.*` imports. Do **not** add a
  top-level module that assumes the plugin dir is already on `sys.path`.
- `scripts/package.mjs` auto-walks `backend/**/*.py` (`findPythonModules(repoRoot, "backend")`),
  so new `backend/updater/*.py` files ship in the zip with **no** packaging change.
- Persistence: `self._data` (a dict with `settings` and `metadata` keys) is written by
  `storage.save_data(self._data_file, self._data)` and read by `storage.load_data(...)`.
  `_data_file` is `decky_metadata.json` in `DECKY_PLUGIN_SETTINGS_DIR`. **Caveat (verified):**
  `backend/storage.py:load_data` rebuilds the dict from `_default_data()` and only
  `.update()`s the `metadata` and `settings` keys from the on-disk payload — any new
  top-level key is **silently dropped on reload**. So new updater blobs require changes
  to `backend/storage.py` (and `_default_data()`), not just `main.py`. Reuse `_save_data()`
  as the write path — do not invent a second persistence path.
- Threading: SDH's `PluginUpdater` acquires `self._state_lock` and, while holding it,
  calls `get_context()` / `save_callback` which **re-acquire the same lock**
  (`updater.py record_install_requested → get_context`). It therefore requires a
  **re-entrant** lock: SDH uses `threading.RLock()` (`service.py:46`). A plain
  `threading.Lock()` will deadlock.
- Concurrent-writer hazard (verified): existing RPCs mutate `self._data` and call
  `_save_data()` on the event loop (e.g. `save_metadata` at `main.py:448` does
  `_load_data → mutate → _save_data`). The updater's `save_callback` will run inside a
  `to_thread` worker, and `storage.save_data` writes a **fixed** temp path
  `decky_metadata.json.tmp` then `os.replace` (`storage.py:51`). A worker-thread updater
  save concurrent with an event-loop metadata save can collide on that temp file and lose
  writes. Fix (chosen): a single shared **`threading.RLock`** (`self._data_lock`) that
  guards *every* complete `_data` load-modify-save transaction — the updater's
  `state_lock` AND the existing metadata/settings RPCs. (Cross-process reload-storm races
  are a documented accepted limitation; `os.replace` is atomic so the worst case is a
  recoverable last-writer-wins on the settings file, re-populated on the next check.)
- Frontend logging (verified): `frontendLog` in `src/backend.ts` is
  `callable<[area, message, fields?, level?], boolean>` → backend `_plog`, and `_plog`'s
  `level` is an **int** (`logging.INFO`, …). So update diagnostics must call
  `frontendLog("update", message, null, "info")`, and the backend updater `log_callback`
  must map SDH's `"debug"/"info"/"warning"/"error"` strings to the `logging.*` ints.
- Blocking network work must be offloaded: existing network RPCs use
  `await asyncio.to_thread(self._..._sync, ...)` (e.g. `main.py:484`). The updater's
  `check_for_update`/`revalidate` do blocking `urllib` I/O (worst case ≈ one release-list
  request + up to `MAX_MANIFEST_FETCH_ATTEMPTS` × 15s manifest fetches), so they must be
  wrapped the same way, and the frontend check timeout must exceed that budget.
- Reuse `main.py`'s existing helpers: `_build_https_context()` (hardened SSL) for the
  release client, `_plog(area, message, level=..., **fields)` for logging, and
  `_resolve_plugin_version()` as the updater's version resolver (note it returns the
  `X.Y.Z+<hash>` local-build string for sideloads, which the panel treats as a
  non-updatable local build).
- No third-party Python deps (AGENTS.md): the SDH updater is stdlib-only
  (`urllib`, `ssl`, `json`, `datetime`, `re`). Keep it that way.
- Frontend RPC bridge is `src/backend.ts` (`callable<...>` wrappers); the QAM panel is
  `src/ContentPanel.tsx` rendering section components. QAM convention (verified):
  informational rows use a focusable `Field` (`VersionsSection.tsx`), while interactive
  controls use `ButtonItem`/`ToggleField` directly (`LogsSection.tsx`) — those are already
  focusable, so do not nest them inside another focusable `Field`. Do NOT copy SDH's bare
  `PanelSectionRow` display rows.

**Slug used throughout this plan:** `self-update-panel`

---

## Orchestration Contract

**Slug:** `self-update-panel`

**Plan file:**

```text
docs/plans/2026-07-17_self-update-panel.md
```

**Implementation branch:**

```text
feat/self-update-panel
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/self-update-panel_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/self-update-panel_finalized
```

**Review notes:**

```text
docs/review/self-update-panel-review-*.md
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
git checkout -b feat/self-update-panel
```

Commit this plan first:

```bash
git add docs/plans/2026-07-17_self-update-panel.md
git commit -m "docs(plan): add self-update-panel implementation plan"
```

---

## Implementation Tasks

Work in the phase order below. Backend (Phase A/B) lands before frontend so the
RPC surface is stable. Follow TDD: for each backend module and each frontend
reducer/controller/util, write the failing test first, then implement. Port from
`../SDH-ludusavi` faithfully but adapt names/paths/constants as specified. Keep
the updater stdlib-only and dependency-free.

**RPC error contract (decide once, applies to all Phase B/C work).** The ported
controller branches on returned status envelopes (`"status" in res && res.status
=== "failed"`), not on thrown/rejected promises. Therefore every updater RPC must
**return** a value — either its success payload or `{"status": "failed",
"message": "..."}` — and must not raise past the RPC boundary. Wrap each method
body in try/except that converts unexpected errors into a failed envelope and logs
via `_plog`. **Check-specific shape rules** (so results satisfy the TS
`UpdateCheckResult`): `check_for_plugin_update`'s failure envelope must additionally
carry a UTC `checked_at` (ISO string); and every non-failure check result —
`"available"` and every `"current"` path, **including the pending-install fast path**
(`updater.py:179`) — must carry the (snapshotted) `channel`. Verify SDH's paths already
include these and add the missing fields; add response-shape tests for every check exit
(available / current / current-fast-path / rate-limited / failed / unexpected-exception).

### Phase A — Backend updater package (`backend/updater/`)

Create the package `backend/updater/` (with `__init__.py`). Port these SDH
modules, renaming the package from `sdh_ludusavi` to `backend.updater` and
substituting the resolved constants. Where an SDH module imports
`sdh_ludusavi._version.resolve_version`, use a passed-in version resolver instead
(no new module).

1. **`backend/updater/models.py`** — port `updater_models.py` verbatim in behavior:
   `JsonResponse`, `ReleaseManifest`, `UpdateCandidate`, `ParsedPluginVersion`
   (with its `__eq__`/`__lt__` dev semantics), `parse_plugin_version` (regex
   `^(\d+)\.(\d+)\.(\d+)(?:-dev\.([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$`),
   `as_string_key_mapping`, `parse_release_manifest` (schemaVersion==1, channel in
   {"stable","dev"}, 64-hex sha256). Keep `UpdateChannel`/`UpdateAction` literals.

2. **`backend/updater/rate_limit.py`** — port `updater_rate_limit.py`
   (`parse_rate_limit_retry_after`) unchanged.

3. **`backend/updater/pending.py`** — port `updater_pending.py`
   (`is_fresh_pending_install`, `pending_install_matches_loaded_version`,
   `effective_pending_install_version`) unchanged.

4. **`backend/updater/client.py`** — port `updater_client.py`'s
   `GitHubReleaseClient` and the `ReleaseClient` Protocol. Changes: default
   `owner="beallio", repo="Decky-Metadata"`; the User-Agent version comes from an
   injected resolver (constructor arg `version_resolver: Callable[[], str]`), not
   `sdh_ludusavi._version`. The SSL context must be **injectable** (constructor arg,
   default = a hardened context) so `main.py` can pass `_build_https_context()`;
   do not duplicate the CA-bundle discovery if a context is supplied.

5. **`backend/updater/discovery.py`** — port `updater_discovery.py`
   (`PrevalidatedRelease`, `prevalidate_release_candidate`,
   `validate_prevalidated_candidate`, `validate_release_candidate`,
   `select_candidate`, `format_candidate_log`). Substitute constants:
   expected manifest asset name `f"Decky-Metadata-{tag}.manifest.json"`;
   manifest checks `plugin_name == "Decky-Metadata"` and `package_name == "decky-metadata"`.
   Keep the exactly-one-zip / exactly-one-manifest rule and the
   `"v" + manifest.version == tag` check.

6. **`backend/updater/updater.py`** — port `updater.py`'s `PluginUpdater` class
   with the same constructor injection (`state_lock`, `save_callback`,
   `log_callback`, `release_client`, `version_resolver`, `now`, `monotonic`) and
   these public methods: `load_state`, `settings_payload`, `cache_payload`,
   `set_channel`, `set_automatic_checks`, `get_context`, `check_for_update`,
   `revalidate`, `record_install_requested`, `confirm_install_handoff`,
   `clear_pending_install`, `reconcile_pending_install`, `has_pending_install`.
   Keep the 24h check cache, the 403/429 rate-limit cooldown, the
   `MAX_MANIFEST_FETCH_ATTEMPTS` bound, and startup reconciliation logic intact.
   Do **NOT** port `adopt_persisted_cache` (it belongs to SDH's cross-instance
   machinery, which is descoped — see the scope note below).
   **Channel-snapshot hardening (deviates from SDH intentionally):** SDH's
   `check_for_update` releases the lock for network I/O and then reads the mutable
   `self._channel` again while filtering, selecting, and caching (`updater.py:286,324,361`),
   so a concurrent `set_channel` can produce a result cached under the wrong channel. Snapshot
   `self._channel` **once under the lock at the start** of `check_for_update`, use that local
   snapshot for all filtering/selection/`last_checked_channel`, and refuse to write the cache
   if `self._channel` no longer equals the snapshot at commit time. Add a backend race test
   proving a mid-check channel flip does not persist a wrong-channel cache entry.

**Phase A tests (`tests/`, pytest, write first):** port the behaviorally meaningful
SDH tests, renaming imports to `backend.updater.*` and using the resolved
constants/manifest fixtures. Mind the **trust-boundary layering**:
`parse_release_manifest` accepts ANY string `pluginName`/`packageName` — identity
rejection happens in `discovery.validate_prevalidated_candidate` (`updater_discovery.py:92`).
Put identity/channel tests at the discovery layer, not the manifest-parse layer.
Minimum coverage:
- `test_updater_version_parse.py` — `parse_plugin_version` valid/invalid, dev
  ordering (`0.3.2-dev.x` < `0.3.2`; two dev builds compare by full string via
  `select_candidate`), `+build` metadata ignored for ordering.
- `test_updater_manifest.py` — `parse_release_manifest` accept/reject for the
  fields it actually validates (schemaVersion≠1, channel not in {stable,dev},
  non-64-hex sha256, missing/typed fields). Do NOT assert wrong-name rejection here.
- `test_updater_discovery.py` — assert only behaviors the ported code actually has (it
  counts assets by name, `name.endswith(".zip")` / exact manifest name; it does NOT
  validate download URLs or sizes, so do NOT assert blank-URL rejection). Cover:
  `prevalidate_release_candidate` asset-count rules (reject **zero or multiple** `.zip`
  assets; reject **zero or multiple** `Decky-Metadata-<tag>.manifest.json` assets); and
  `validate_prevalidated_candidate` **rejecting** wrong `pluginName`/`packageName`,
  `tag`≠release tag, `"v"+version`≠tag, channel/prerelease disagreement (stable manifest
  on a prerelease, dev manifest on a non-prerelease), a manifest whose `assetName` ≠ the
  selected zip asset name (`updater_discovery.py:106` — part of the trust boundary), and a
  failed manifest download (non-200 from `get_manifest`).
- `test_updater_select_candidate.py` — the action matrix: `update`,
  `move_to_stable`, `downgrade_to_stable`, and no-op/current across stable vs
  development channels.
- `test_updater_revalidate.py` — `revalidate` **rejecting** on changed sha256,
  changed artifact URL, and changed version vs the candidate; and success passthrough.
- `test_updater_rate_limit.py` — `parse_rate_limit_retry_after`; and
  `check_for_update` returning `failed`+`retry_after` and setting cooldown on
  403/429 (use a fake `ReleaseClient`).
- `test_updater_pending.py` — pending freshness, `reconcile_pending_install`
  promote/retain-in-grace/clear-on-mismatch, `effective_pending_install_version`.
- `test_updater_cache.py` — 24h cache hit vs. forced re-check vs. channel/version
  change invalidation.
Use fake in-memory `ReleaseClient` implementations (no network). Do not hit GitHub.

**Scope note for Phase A (concurrency decision — settled).** SDH's *cross-process*
race machinery (`adopt_persisted_cache`, the singleton, and the inter-process file
lock in `service.py`/`persistence.py`) is **intentionally NOT ported.** In-process
concurrency IS handled: a single shared `threading.RLock` (`self._data_lock`, Phase B)
serializes every `_data` load-modify-save across the event loop and the updater's
`to_thread` workers. Cross-process contention (two plugin processes overlapping during
a Decky reload storm both writing `decky_metadata.json`) is an **accepted, documented
limitation**: `os.replace` is atomic so readers never see a torn JSON file, but a
last-writer-wins overwrite can still drop the loser's `update_settings`, `update_check_cache`,
or `pending_update_install`. State this accurately — a lost `pending_update_install` is
**not** reconstructable from the loaded version alone (`reconcile_pending_install` only
promotes information already in that record, `updater.py:568`); the practical impact is a
missed auto-promotion that the next manual/auto check re-detects, and the update settings
re-populate on the next successful save. Do not port `adopt_persisted_cache` or the
singleton — leaving ported-but-unused code is a defect. Record this accepted cross-process
limitation in the session log.

### Phase B — Backend persistence + wiring

7. **Persistence (`backend/storage.py` + `main.py`).** Both must change or the
   updater state is lost on reload (verified defect):
   - In `backend/storage.py`, extend the default/merge so `update_settings` (dict)
     and `update_check_cache` (dict) are preserved: add them to the base dict and
     `.update()` them from the on-disk payload exactly like `metadata`/`settings`.
     Keep the atomic temp-file write in `save_data` unchanged.
   - In `main.py`, extend `_default_data()` to include `"update_settings": {}` and
     `"update_check_cache": {}`. Do not disturb existing keys/migration.
   - Add a `tests/test_storage_update_keys.py` proving a written `update_settings` /
     `update_check_cache` survives a fresh `load_data` (new dict, cache miss path).

8. **Shared data lock (concurrency fix — verified hazard).** Introduce one
   `self._data_lock = threading.RLock()` on `Plugin` and make it the single serialization
   point for **every** `self._data` write, because the updater will save from a
   `to_thread` worker while existing RPCs mutate `_data` on the event loop (both hit the
   fixed `decky_metadata.json.tmp`). A named-RPC list is not enough — cover every writer
   at the lowest common chokepoint:
   - Make **`_save_data()` acquire `self._data_lock` internally** so *every* save is
     serialized regardless of caller — this transparently covers the writers that are not
     plain RPCs: `_load_data()`'s first-run create (`main.py:704`) and post-normalization
     save (`main.py:710`), and `_save_activity_pipeline_metadata()` (`main.py:855`).
   - Additionally wrap the complete read-modify-write RPC bodies (`save_metadata`,
     `remove_metadata`, `clear_metadata_cache`, `set_debug_logging`, and any similar
     `_load_data → mutate → _save_data`) in `with self._data_lock:` so the *transaction*
     (not just the final write) is atomic. Preserve observable behavior — this only adds
     mutual exclusion. Because the lock is re-entrant, the inner `_save_data()` re-acquire
     is fine.
   - Pass this same lock to `PluginUpdater` as its `state_lock` (re-entrant, as the
     updater requires; shared, as the persistence race requires).
   - **Never hold `self._data_lock` across an `await`.** The async RPC methods (task 10)
     must not wrap `await asyncio.to_thread(...)` in the lock — the offloaded synchronous
     updater code acquires the lock itself inside the worker thread; holding a threading
     lock across the await would serialize the loop and risk cross-thread stalls.
   - Add concurrency tests covering more than `save_metadata`: an updater save racing a
     metadata save, and racing `_save_activity_pipeline_metadata`, each preserving both
     writers' data.

9. **Construct and wire `PluginUpdater` in `Plugin` (`main.py`).**
   - `release_client = GitHubReleaseClient(version_resolver=_resolve_plugin_version, ssl_context=_build_https_context())`
     — `_build_https_context()` is a **module-level** function; call it directly, not
     `self._build_...`.
   - `state_lock = self._data_lock` (the shared re-entrant lock from task 8).
   - `log_callback` = a thin adapter that maps SDH's `(level_str, message)` to
     `_plog(area="update", message, level=_LEVELS[level_str])`, where `_LEVELS =
     {"debug": logging.DEBUG, "info": logging.INFO, "warning": logging.WARNING,
     "error": logging.ERROR}` — `_plog`'s `level` is an **int**, so passing the raw
     `"warning"`/`"error"` strings is wrong.
   - `version_resolver = _resolve_plugin_version`;
     `now = lambda: datetime.datetime.now(datetime.timezone.utc)`;
     `monotonic = time.monotonic`.
   - `save_callback = self._save_updater_state` — a **new** adapter method (do NOT
     pass `self._save_data` directly; it only serializes `self._data` and would not
     flush the updater blobs). `_save_updater_state()` must **acquire `self._data_lock`
     itself** (`with self._data_lock:`), then set
     `self._data["update_settings"] = self._updater.settings_payload()` and
     `self._data["update_check_cache"] = self._updater.cache_payload()["update_check_cache"]`,
     then call `self._save_data()`. Do NOT assume the lock is already held: SDH's
     `set_channel`/`set_automatic_checks` invoke `save_callback` **without** holding
     `state_lock` (`updater.py:113,120`). The re-entrant lock makes this safe whether or
     not an updater method already holds it.
   - After `_load_data()`, initialize state with the correct **cache wrapper** shape
     that `load_state` expects (it reads `cache.get("update_check_cache")`):
     `self._updater.load_state(self._data["update_settings"], {"update_check_cache": self._data["update_check_cache"]})`.
   - **Startup reconciliation (guard against clobbering on load failure — verified
     defect).** `_load_data()` currently returns early leaving *default* `self._data`
     when `storage.load_data` fails; an unconditional save would then overwrite a
     valid-but-unreadable file with empty defaults. Make `_load_data()` report whether a
     load succeeded (or reuse the existing state), and only call
     `self._updater.reconcile_pending_install(_resolve_plugin_version())` when data was
     loaded (or the file legitimately did not exist). Do **NOT** add an unconditional
     post-reconcile save — `reconcile_pending_install` already invokes `save_callback`
     when (and only when) it mutates. Add a corrupt-file regression test proving startup
     leaves the original file bytes unchanged.

10. **Add async RPC methods on `Plugin`** (names MUST match the Phase C wrappers).
    Each offloads blocking updater calls with `await asyncio.to_thread(...)` (mirrors
    `main.py`'s existing pattern), returns a status envelope on failure (see RPC error
    contract above), and persists via `_save_updater_state()` where it mutates state:
    - `check_for_plugin_update(self, current_version: str, force: bool = False)` →
      `await asyncio.to_thread(self._updater.check_for_update, current_version, force)`
    - `revalidate_plugin_update(self, candidate: dict)` →
      `await asyncio.to_thread(self._updater.revalidate, candidate)`
    - `record_update_install_requested(self, candidate: dict)`
    - `confirm_update_install_handoff(self, version: str)`
    - `clear_pending_update_install(self, version: str | None = None)`
    - `get_update_check_context(self)` → `self._updater.get_context()`
    - `get_update_settings(self)` → `{"update_channel": ..., "automatic_update_checks": ...}`
    - `set_update_channel(self, channel: str)` → returns the updated settings dict
    - `set_automatic_update_checks(self, enabled: bool)` → returns the updated settings dict
    Register any new RPC method names with Decky's callable surface the same way the
    existing methods are exposed.

    **Timeout alignment:** worst-case `check_for_update` ≈ list request + up to
    `MAX_MANIFEST_FETCH_ATTEMPTS` (5) × 15s ≈ 90s. The ported frontend check timeout
    `UPDATE_CHECK_UI_TIMEOUT_MS` is 60s. Raise `UPDATE_CHECK_UI_TIMEOUT_MS` to at least
    120000 (Phase D) so the UI does not time out before the backend can answer.

**Phase B tests:** add `tests/test_updater_rpc.py` exercising the `Plugin` methods
against a fake `ReleaseClient` (injected in place of `GitHubReleaseClient`) and a
`tmp_path` settings dir, following `tests/conftest.py` `decky` mock conventions:
- check → record → reconcile round-trips through `decky_metadata.json` **read back by
  a freshly constructed `Plugin`** (not the same in-memory instance), proving
  persistence survives reload;
- `get_update_check_context` reflects a persisted pending install;
- **re-entrancy** guard: assert nested non-blocking acquisition of the injected
  `self._data_lock` succeeds (call `acquire(blocking=False)` while already held), OR run
  `record_update_install_requested`/`confirm_install_handoff`/`clear_pending_install` on
  a **daemon thread joined with a bounded timeout** and assert it finished. Do NOT rely
  on `asyncio.wait_for`, which cannot interrupt a blocked `Lock.acquire()` and would hang
  the suite if the lock were wrong;
- **corrupt-file** guard: a malformed-but-present `decky_metadata.json` is not rewritten
  by startup (byte-for-byte unchanged);
- **concurrent-write** guard: an updater save racing a metadata save preserves both;
- a failing updater path returns `{"status": "failed", ...}` rather than raising.

### Phase C — Frontend types + RPC wrappers

11. **`src/types.ts`** — add the update-related types the ported controller/section
    consume, with exact shapes (port from SDH `src/types/index.ts`): `UpdateChannel`
    (`"stable" | "development"`), `PluginUpdateCandidate`, `UpdateInstallRequest`
    (the candidate-plus-`updateTraceId` shape passed to `recordUpdateInstallRequested`),
    `UpdateCheckResult` (a union whose **failure** variant is
    `{ status: "failed"; checked_at: string; message?: string; retry_after?: string }` —
    the `checked_at` field is required, matching SDH), `UpdateCheckContext`,
    `PendingUpdateInstall`, `RevalidateResult`, `UpdateSettings`
    (`{ update_channel: UpdateChannel; automatic_update_checks: boolean }`), a failure
    envelope `UpdateRpcStatus` (`{ status: "failed" | "skipped"; message?: string }`),
    and the generic alias `type UpdateRpcResult<T> = T | UpdateRpcStatus`.

12. **`src/backend.ts`** — add `callable<...>` wrappers matching the Phase B method
    names, with exact generic signatures. **Every** wrapper result is a
    success-or-`UpdateRpcStatus` union so the controller's `"status" in res` branching
    type-checks — including the getters/setters, which must NOT omit the failure union:
    - `checkForPluginUpdate: callable<[currentVersion: string, force: boolean], UpdateCheckResult>`
      (its own union already carries the failed variant with `checked_at`)
    - `revalidatePluginUpdate: callable<[candidate: PluginUpdateCandidate], UpdateRpcResult<RevalidateResult>>`
    - `recordUpdateInstallRequested: callable<[candidate: UpdateInstallRequest], UpdateRpcResult<UpdateCheckContext>>`
    - `confirmUpdateInstallHandoff: callable<[version: string], UpdateRpcResult<UpdateCheckContext>>`
    - `clearPendingUpdateInstall: callable<[version: string | null], UpdateRpcResult<UpdateCheckContext>>`
    - `getUpdateCheckContext: callable<[], UpdateRpcResult<UpdateCheckContext>>`
    - `getUpdateSettings: callable<[], UpdateRpcResult<UpdateSettings>>`
    - `setUpdateChannel: callable<[channel: UpdateChannel], UpdateRpcResult<UpdateSettings>>`
    - `setAutomaticUpdateChecks: callable<[enabled: boolean], UpdateRpcResult<UpdateSettings>>`
    Follow the existing wrapper style. The setters return the updated `UpdateSettings`
    so `ContentPanel` reconciles optimistic state from the authoritative value — and
    must guard the failure envelope before applying it.

### Phase D — Frontend installer + controller (TDD with vitest)

**Directory note.** Place these under a new `src/updater/` directory, NOT
`src/steam/`. This is Decky self-update, not Steam integration, and AGENTS.md gates
`src/steam/` changes behind live-Deck checks that do not apply to host-testable
updater logic. `src/steam/` remains reserved for Steam-integration code.

13. **`src/updater/deckyInstaller.ts`** — port SDH `src/utils/deckyInstaller.ts`
    with `EXPECTED_PLUGIN_NAME = "Decky-Metadata"`. Keep `isDeckyInstallerAvailable()`,
    `invokeDeckyInstaller(...)`, `INSTALL_TYPE_UPDATE = 2`, `INSTALL_TYPE_DOWNGRADE = 3`.
    Route diagnostics through the `frontendLog` RPC wrapper (`src/backend.ts`) with its
    **actual** signature `(area, message, fields?, level?)` — call
    `void frontendLog("update", message, null, "info").catch(() => {})`, NOT
    `frontendLog("info", msg, "update")` (that mis-orders args and logs at debug, which
    is suppressed). Do not use `src/log.ts` (debug-gated).

14. **`src/updater/pluginUpdateReducer.ts`** — port SDH `pluginUpdateReducer.ts`
    (state machine: `hydrating → idle → checking → installing → handoff_pending`,
    plus install-override bookkeeping) unchanged in behavior.

15. **`src/updater/pluginUpdateController.tsx`** — port SDH
    `pluginUpdateController.tsx`, repointing RPC imports to the Phase C wrappers in
    `src/backend.ts` and the installer in `src/updater/deckyInstaller.ts`. Preserve the
    revalidate → record → Decky handoff → 3s handoff-timer race → reconcile flow and the
    failure/rollback (`clearPendingUpdateInstall` + re-check). Additional adaptations:
    - Replace SDH's `const logRpc = callable<...>("log")` (that RPC does not exist here)
      with the repo's `frontendLog` wrapper (backend RPC `frontend_log`), same call form
      as task 13.
    - Define `UPDATE_CHECK_UI_TIMEOUT_MS = 120000` **once** here (or in a shared
      `src/updater/constants.ts`); do NOT also declare it in the section component (SDH
      duplicates the constant — do not replicate that).
    - **Settings-hydration race guard.** Accept a `settingsLoaded` (ready) flag and gate
      **every** automatic-check trigger on it — not only the "initial check" effect but
      also the context-hydration effect that can itself launch a check
      (`pluginUpdateController.tsx:250,291`) — so no check runs under a default channel and
      is then cached/labeled under the wrong channel once the persisted `development`
      setting arrives. Keep a latest-channel ref; when the channel changes, do NOT reuse an
      in-flight check (`pluginUpdateController.tsx:109`) — discard the stale one and
      schedule a fresh check for the new channel. Preserve SDH's `activeCheckId` stale
      guards. (The backend channel-snapshot in task 6 is the authoritative fix; this keeps
      the UI consistent.)

**Phase D tests (`*.test.ts(x)`, vitest, write first):**
- `pluginUpdateReducer.test.ts` — every action transition.
- `pluginUpdateController.test.tsx` — happy path (check→available→install→success),
  handoff-pending path (installer promise unresolved past 3s), failure→rollback path
  (installer rejects → `clearPendingUpdateInstall` called, error toast surfaced), an
  assertion that a `downgrade_to_stable` candidate installs with `INSTALL_TYPE_DOWNGRADE`
  (3) while an update uses `INSTALL_TYPE_UPDATE` (2), and the hydration-race orderings:
  version-before-settings (no premature check) and channel-change-during-check (result
  discarded, not cached under the wrong channel).
- `deckyInstaller.test.ts` — `callable` vs `call` API-shape selection, and
  `isDeckyInstallerAvailable()` false when `window.DeckyBackend` is absent. (Do NOT
  put `isLocalBuild` gating here — that lives in the section component; see Phase E.)
Mock `window.DeckyBackend` and the RPC wrappers; no real Decky.

### Phase E — QAM section + mount

16. **`src/components/qam/PluginUpdateSection.tsx`** — a new section that consumes
    `usePluginUpdateController(...)`. Match this repo's actual QAM conventions
    (verified): **informational rows** use a focusable `Field`
    (`focusable`/`highlightOnFocus`, as in `VersionsSection.tsx`); **interactive
    controls** use `ButtonItem`/`ToggleField` directly (as in `LogsSection.tsx`) —
    these are already focusable, so do NOT nest them inside another focusable `Field`
    (that creates duplicate/nested focus stops). Render: installed version
    (informational Field, with "(Local Build)" when the version contains `+`), a
    "Receive development releases" `ToggleField` (with the confirm modal), an
    "Automatically check for updates" `ToggleField`, a status line (informational
    Field), candidate details (informational Field), an Install/Revert `ButtonItem`,
    a "View Release Notes" `ButtonItem` (`Navigation.NavigateToExternalWeb`), and a
    "Check now" `ButtonItem`. Import the single `UPDATE_CHECK_UI_TIMEOUT_MS` from the
    controller/constants module rather than redeclaring it.

    **Intentional deviation from SDH (fixes a latent gap):** SDH computes
    `isLocalBuild` but its install-button condition (`PluginUpdateSection.tsx:230`)
    is only `candidate && isDeckyAvailable`, so it never suppresses install on a
    local `+build`. Here, the Install button must be gated on
    `candidate && isDeckyAvailable && !isLocalBuild`; when `isLocalBuild`, show the
    "install manually from GitHub" note instead. Call this out in a code comment.

17. **`src/ContentPanel.tsx`** — mount `<PluginUpdateSection>` immediately above
    `<VersionsSection>`. Add an effect to load update settings via `getUpdateSettings`
    alongside the existing debug-logging load; on a failed/`UpdateRpcStatus` result fall
    back to defaults (`stable` channel, automatic checks on) and still set `settingsLoaded`
    so the UI is not wedged. Hold `updateChannel`/`automaticUpdateChecks` and a
    `settingsLoaded` flag in state; pass `settingsLoaded` to the controller (task 15 race
    guard). For the toggles: unlike the existing debug-logging flow (which applies optimistic
    state and leaves it on failure, `ContentPanel.tsx:233`), the channel/auto-check setters
    must **guard the returned `UpdateRpcStatus`** and **roll back** the optimistic value on a
    `failed`/`skipped` response (reconcile from the returned `UpdateSettings` on success).
    Pass `pluginVersion` (already fetched) as `currentVersion`; and pass an
    `onInstallVersionConfirmed` callback that optimistically updates the shown
    `pluginVersion`.

18. **`src/components/qam/PluginUpdateSection.test.tsx`** (vitest, write first) —
    component-level behavior that only exists here: install suppressed on a `+build`
    version (with the "(Local Build)"/manual-install messaging), unavailable-Decky
    manual-install messaging, rate-limit `retry_after` display, offline/failed-check
    display, the development-channel confirm modal, and the downgrade confirm modal.
    Also cover the settings failure paths (in whichever component owns the state —
    `ContentPanel` for the setters/getter): `getUpdateSettings` failure falls back to
    defaults and still marks settings loaded; a failed/`skipped` `setUpdateChannel` /
    `setAutomaticUpdateChecks` **rolls the toggle back** rather than leaving the optimistic
    value applied.

### Phase F — Docs / session log

19. Update `README.md` to mention the new in-QAM update panel (AGENTS.md requires a
    README update when user-facing behavior changes — the QAM "what you can do" list
    at README line ~23 should include checking for and installing plugin updates).
    Rebuild and commit the bundle (`npm run build`; `dist/index.js` + `.js.map` are
    tracked and must reflect the new `src/`). Record a session summary under
    `docs/agent_conversations/` per AGENTS.md §9, including the accepted cross-process
    persistence limitation and the required (not merely deferred) device-integration
    gate below.

**Out of scope (do NOT modify):** `scripts/package.mjs`, the workflows,
`plugin.json`, `src/index.tsx` — that groundwork is already on `dev`. **This plan
supersedes all conflicting portions of the companion design doc
`docs/plans/2026-07-17_plugin-self-update.md` §§2–5** (which predate the resolved
decisions and variously reference the old spaced plugin name, "manifests don't exist
yet", a stable-only first cut, the installer under `src/steam/`, and CI work now
already on `dev`). Where the design doc and this plan disagree, this plan wins:
per-commit dev semver channel, top-level `update_settings`/`update_check_cache` blobs,
frontend under `src/updater/`, and the manifest/sha256 sidecars that already ship.

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

Run on this Linux host and confirm all pass:

```bash
./run.sh uv run --with pytest python -m pytest        # backend: all green, incl. new updater + rpc tests
./run.sh npm test                                     # vitest: all green, incl. reducer/controller/installer tests
./run.sh npx tsc --noEmit                             # frontend typecheck clean
./run.sh npm run build                                # bundle builds
scripts/orchestration/run-quality-gates               # repo quality gate passes
git status --short                                    # clean; no stray zip/manifest artifacts
```

Behavioral checks (host, no device):
- The updater package is stdlib-only: `grep -rE "import (requests|aiohttp|httpx)" backend/updater` returns nothing.
- Persistence round-trips: a test writes `update_settings`/`update_check_cache`, then a
  **freshly constructed** loader reads them back (guards the `backend/storage.py` fix).
- Re-entrancy: the pending-install RPC methods return within a short timeout (guards the
  `RLock` requirement — a plain `Lock` would hang the test).
- New backend modules ship in the package: `./run.sh npm run build && node scripts/package.mjs --release --no-hash`
  then confirm `backend/updater/*.py` entries exist in `Decky-Metadata.zip`
  (`unzip -l Decky-Metadata.zip | grep backend/updater`), and remove the zip
  afterward so the tree stays clean.
- Controller/section tests cover the handoff-pending race, the failure→rollback path
  (assert `clearPendingUpdateInstall` called + error toast), the downgrade install type,
  and the local-build install suppression.
- No network is hit in any test (all `ReleaseClient`/RPC usages are faked/mocked).

**Device-integration gate (REQUIRED — blocks the `dev` → `main` promotion, not the host
round).** The critical trust boundary — `EXPECTED_PLUGIN_NAME` matching Decky's install
identity, the whole-zip sha256 handoff, the plugin restart, and startup
`reconcile_pending_install` promoting the pending record — cannot be proven by host
mocks. It must be exercised once on real Steam Deck / SteamOS hardware with the **full
plugin** pushed (`scripts/deck/deploy.sh` package-push + Decky-UI install, per
`docs/runbooks/on-device-verification.md`) against a genuine newer `vX.Y.Z-dev.g<sha>`
prerelease from the manual Dev Release workflow, PLUS the runbook's QAM initial-focus /
D-pad pass on the new section (a hard gate per the runbook).

Because the updater frontend lives in `src/updater/` (not `src/steam/`), the **host
round** may be marked complete on green host gates. But this device gate is not
optional: it is assigned to the maintainer (human) and its result MUST be recorded in
the session log **before** the `dev` → `main` human promotion gate. Do NOT finalize to
`main` and do NOT claim end-to-end update works until it passes. If the device run
fails, reopen the plan with a review note.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished self-update-panel
```

This writes:

```text
/tmp/Decky-Metadata/self-update-panel_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer self-update-panel`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/self-update-panel-review-*.md
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
   scripts/orchestration/clear-finished self-update-panel
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
   git add docs/review/self-update-panel-review-*.md
   git commit -m "docs(review): record self-update-panel review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished self-update-panel
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer self-update-panel` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed self-update-panel
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize self-update-panel
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/self-update-panel_finalized
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
scripts/orchestration/finalize self-update-panel
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/self-update-panel_finished
/tmp/Decky-Metadata/self-update-panel_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
