from __future__ import annotations

import io
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import zipfile
from types import SimpleNamespace

import pytest

from scripts.deck import benchmark_backend as benchmark


NODE = r"""
const fs = require('node:fs');
const assert = require('node:assert/strict');
const testModule = { exports: {} };
new Function('module', fs.readFileSync(process.argv[1], 'utf8'))(testModule);
const api = testModule.exports;
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));

async function workloadContract() {
  let now = 0;
  global.performance = { now: () => now };
  const stored = new Map(payload.records.map((record) => [String(record.appid), structuredClone(record)]));
  const callsByMethod = new Map();
  const writes = [];
  let active = 0;
  let maximumActive = 0;
  let activeWrites = 0;
  let maximumActiveWrites = 0;

  function timedView(value) {
    if (!value || typeof value !== 'object') return value;
    return new Proxy(value, {
      get(target, key, receiver) {
        if (key !== 'then') now += 1;
        return timedView(Reflect.get(target, key, receiver));
      },
    });
  }

  const backend = {
    async call(method, ...args) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      callsByMethod.set(method, (callsByMethod.get(method) || 0) + 1);
      if (method === 'save_metadata') {
        activeWrites += 1;
        maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
      }
      await Promise.resolve();
      now += 3;
      let result;
      if (method === 'get_metadata') {
        result = stored.get(String(args[0])) ?? null;
      } else if (method === 'get_missing_metadata_count') {
        result = args[0].reduce((count, game) => {
          assert.equal(typeof game.appid, 'number');
          assert.equal(typeof game.name, 'string');
          const record = stored.get(String(game.appid));
          return count + (!record || !record.description ? 1 : 0);
        }, 0);
      } else if (method === 'get_all_metadata') {
        result = Object.fromEntries(stored);
      } else if (method === 'save_metadata') {
        const [appid, record] = args;
        assert.equal(typeof appid, 'number');
        assert.equal(record.source, 'Manual');
        assert.notEqual(record.description, '');
        writes.push({ appid, description: record.description });
        const { appid: _map_key, ...sanitized } = structuredClone(record);
        sanitized.updated_at = 1;
        stored.set(String(appid), sanitized);
        activeWrites -= 1;
        result = sanitized;
      } else {
        throw new Error(`unexpected RPC ${method}`);
      }
      active -= 1;
      return timedView(result);
    },
  };
  global.window = {
    __DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit: {
      connect(version, name) {
        assert.equal(version, 2);
        assert.equal(name, 'Decky Metadata');
        return backend;
      },
    },
    __deckyMetadataBenchmarkObserver: {
      updateStarted: 0, updateCompleted: 0, updateActive: 0, updateErrors: [],
      catalogStarted: 0, catalogCompleted: 0, catalogActive: 0, catalogErrors: [],
    },
  };

  const warmup = await api.warmupReads(payload);
  assert.equal(warmup.ok, true);
  assert.equal(warmup.calls, 400);
  callsByMethod.clear();
  writes.length = 0;
  now = 0;

  const result = await api.runWorkload(payload);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.expectedMeasuredCalls, 6450);
  assert.equal(result.completedCalls, 6450);
  assert.equal(result.sampleCalls, 6450);
  assert.equal(api.expectedCallsPerTrial(), 6450);
  assert.deepEqual(Object.fromEntries(Object.entries(result.measurements).map(([name, value]) => [name, value.count])), {
    get_metadata_hit_serial: 1000,
    get_metadata_miss_serial: 1000,
    get_missing_metadata_count_serial: 1000,
    get_all_metadata_serial: 200,
    get_metadata_hit_concurrency_8: 1000,
    get_metadata_miss_concurrency_8: 1000,
    get_missing_metadata_count_concurrency_8: 1000,
    get_all_metadata_concurrency_8: 200,
    save_metadata_serial: 50,
  });
  assert.equal(maximumActive, 8);
  assert.equal(maximumActiveWrites, 1);
  assert.equal(writes.length, 50);
  const expectedTargets = payload.records.filter((_, index) => index % 4 !== 3).slice(0, 50);
  assert.deepEqual(writes.map((write) => write.appid), expectedTargets.map((record) => record.appid));
  assert.deepEqual(writes.map((write) => write.description), writes.map((_, index) => (index % 2 === 0 ? payload.writeDescriptionA : payload.writeDescriptionB)));
  for (const [name, entry] of Object.entries(result.measurements)) {
    assert.equal(entry.samplesMs.length, entry.count);
    assert(entry.samplesMs.every((sample) => sample >= 3));
    if (name.endsWith('_serial')) {
      assert(entry.samplesMs.every((sample) => sample === 3), 'serial latency includes its own validation time');
      const elapsed = entry.samplesMs.reduce((sum, sample) => sum + sample, 0);
      if (name === 'get_metadata_hit_serial' || name === 'get_all_metadata_serial' || name === 'save_metadata_serial') {
        assert(entry.wallMs > elapsed, 'serial wall time excludes result validation');
      } else {
        assert.equal(entry.wallMs, elapsed);
      }
    }
  }
  assert.equal(callsByMethod.get('save_metadata'), 50);
}

async function apiFallbackContract() {
  const versions = [];
  const stored = new Map(payload.records.map((record) => [String(record.appid), record]));
  const backend = {
    async call(method, ...args) {
      if (method === 'get_metadata') return stored.get(String(args[0])) ?? null;
      if (method === 'get_missing_metadata_count') {
        return args[0].reduce((count, game) => count + (!stored.get(String(game.appid))?.description ? 1 : 0), 0);
      }
      if (method === 'get_all_metadata') return Object.fromEntries(stored);
      throw new Error(`unexpected fallback RPC ${method}`);
    },
  };
  global.window = {
    __DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit: {
      connect(version, name) {
        assert.equal(name, 'Decky Metadata');
        versions.push(version);
        if (version === 2) throw new Error('version 2 unavailable');
        return backend;
      },
    },
  };
  const warmed = await api.warmupReads(payload);
  assert.equal(warmed.calls, 400);
  assert.deepEqual(versions, [2, 1]);
}

async function timeoutContract() {
  global.performance = { now: () => 0 };
  global.setTimeout = (callback) => { queueMicrotask(callback); return 1; };
  global.clearTimeout = () => {};
  global.window = {
    __DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit: {
      connect() { return { call: () => new Promise(() => {}) }; },
    },
    __deckyMetadataBenchmarkObserver: {
      updateStarted: 0, updateCompleted: 0, updateActive: 0, updateErrors: [],
      catalogStarted: 0, catalogCompleted: 0, catalogActive: 0, catalogErrors: [],
    },
  };
  const result = await api.runWorkload(payload);
  assert.equal(result.ok, false);
  assert.equal(result.completedCalls, 0);
  assert.equal(result.sampleCalls, 1);
  assert.match(result.errors[0].error, /timed out/);
}


async function observerContract() {
  let now = 0;
  let timerId = 0;
  global.performance = { now: () => now };
  global.setTimeout = (callback, milliseconds) => {
    const id = ++timerId;
    now += milliseconds;
    queueMicrotask(callback);
    return id;
  };
  global.clearTimeout = () => {};
  const originalEventResult = { accepted: true };
  const originalUpdateListener = (value) => Promise.resolve(value);
  const unrelatedListener = () => true;
  const listeners = new Set([originalUpdateListener, unrelatedListener]);
  const loader = { checkPluginUpdates: () => Promise.resolve({ catalog: 'real-result' }) };
  global.window = {
    DeckyPluginLoader: loader,
    DeckyBackend: { eventListeners: new Map([['loader/notify_updates', listeners]]) },
    DFL: {
      Navigation: { Navigate: () => { global.location.pathname = '/library/home'; } },
      getGamepadNavigationTrees: () => [{ id: 'QuickAccess-NA', m_Root: { m_element: { ownerDocument: {
        hidden: true, querySelectorAll: () => [{ id: 'quickaccess_tab_4' }],
      } } } }],
    },
  };
  window.top = window;
  global.location = { pathname: '/library/home', search: '', hash: '' };
  global.document = { querySelectorAll: () => [] };
  global.getComputedStyle = () => ({ display: 'none', visibility: 'hidden' });

  const attached = api.attachObservers();
  assert.equal(attached.updateStarted, 0);
  const installedListeners = Array.from(listeners);
  assert.notEqual(installedListeners[0], originalUpdateListener);
  assert.notEqual(installedListeners[1], unrelatedListener);
  const callback = installedListeners[0];
  assert.equal(await callback(originalEventResult), originalEventResult, 'update observer replaced listener result');
  assert.deepEqual(await loader.checkPluginUpdates(), { catalog: 'real-result' }, 'catalog observer replaced pass-through result');
  now = 40000;
  const marked = api.markServiceReady();
  assert.equal(marked.serviceReadyAt, now);
  const ready = await api.waitForStartupQuiescence({ timeoutMs: 180000 });
  assert.equal(ready.ok, true, JSON.stringify(ready));
  assert(ready.quietMs >= 5000);
  assert(now - attached.attachedAt >= 60000, 'frontend readiness was not held for 60 seconds');
  assert.equal(ready.ui.route, '/library/home');
  assert(now - marked.serviceReadyAt >= 60000, 'service readiness was not held for 60 seconds');
  assert(now - ready.observer.updateLastCompletedAt >= 10000, 'startup update did not age for 10 seconds');
  assert.equal(ready.observer.updateCompleted, 1);
  assert.equal(ready.observer.catalogCompleted, 1);
  assert.equal(ready.observer.catalogActive, 0);
  const detached = await api.detachObservers();
  assert.equal(detached.updateCompleted, 1);
  assert.deepEqual(Array.from(listeners), [originalUpdateListener, unrelatedListener]);

  delete window.DeckyPluginLoader;
  const primed = api.armPreload({ runId: 'early-catalog-test' });
  assert.equal(primed.attached, false);
  let finishFirstCatalog;
  const pendingCatalog = new Promise((resolve) => { finishFirstCatalog = resolve; });
  let catalogCalls = 0;
  const startupCatalog = () => ++catalogCalls === 1 ? pendingCatalog : Promise.resolve('later catalog');
  const startupLoader = { checkPluginUpdates: startupCatalog };
  window.DeckyPluginLoader = startupLoader;
  const firstCatalog = startupLoader.checkPluginUpdates();
  assert.equal(api.observerState().preloadRunId, 'early-catalog-test');
  assert.equal(api.observerState().catalogActive, 1);
  assert.equal(await startupLoader.checkPluginUpdates(), 'later catalog');
  await Array.from(listeners)[0](originalEventResult);
  api.markServiceReady();
  now += 70000;
  const stillPending = await api.waitForStartupQuiescence({ timeoutMs: 6000 });
  assert.equal(stillPending.ok, false, 'a later completed catalog hid the pending startup call');
  assert.equal(stillPending.observer.catalogActive, 1);
  finishFirstCatalog('first catalog');
  assert.equal(await firstCatalog, 'first catalog');
  assert.equal(api.observerState().catalogCompleted, 2);
  assert.throws(() => api.detachPreload({ runId: 'another-run' }));
  assert.equal(window.__deckyMetadataBenchmarkPreload.runId, 'early-catalog-test');
  assert.notEqual(startupLoader.checkPluginUpdates, startupCatalog);
  api.detachPreload({ runId: 'early-catalog-test' });
  assert.equal(startupLoader.checkPluginUpdates, startupCatalog);
  assert.equal(window.__deckyMetadataBenchmarkPreload, undefined);

  const emptyListeners = new Set([() => Promise.resolve(true)]);
  const emptyLoader = { checkPluginUpdates: () => Promise.resolve(true) };
  global.window = {
    DeckyPluginLoader: emptyLoader,
    DeckyBackend: { eventListeners: new Map([['loader/notify_updates', emptyListeners]]) },
    DFL: global.window.DFL,
  };
  api.attachObservers();
  api.markServiceReady();
  const noEvents = await api.waitForStartupQuiescence({ timeoutMs: 100 });
  assert.equal(noEvents.ok, false);
  assert.equal(noEvents.observer.updateStarted, 0);
  api.detachObservers();

  global.window = {
    DeckyPluginLoader: {},
    DeckyBackend: { eventListeners: new Map() },
  };
  assert.throws(() => api.attachObservers());

  global.window = { top: {} };
  api.armPreload({ runId: 'child-frame' });
  assert.equal(Object.getOwnPropertyDescriptor(window, 'DeckyPluginLoader'), undefined);
  assert.equal(window.__deckyMetadataBenchmarkPreload, undefined);
}

(async () => {
  await workloadContract();
  await apiFallbackContract();
  await timeoutContract();
  await observerContract();
  process.stdout.write('behavioral benchmark fixture contract ok\n');
})().catch((error) => { console.error(error); process.exitCode = 1; });
"""


def expected_record(index: int) -> dict[str, object]:
    suffix = f"{index:04d}"
    description = "" if index % 4 == 3 else "D" * 512
    return {
        "appid": 2147483648 + index,
        "id": f"benchmark-{suffix}",
        "title": f"Benchmark Fixture {suffix} — Café",
        "source": "Manual",
        "source_url": "",
        "description": description,
        "short_description": description,
        "developers": [{"name": "Benchmark", "url": ""}],
        "publishers": [{"name": "Benchmark", "url": ""}],
        "release_date": "2021-07-12",
        "rating": 0,
        "deck_compat_category": None,
        "deck_compat_override": None,
        "store_categories": [2, 9],
        "genres": ["Benchmark", "Action"],
        "features": ["Single-player"],
        "screenshots": [
            {
                "id": f"screenshot-{suffix}-{slot}",
                "url": f"https://images.example.invalid/decky-metadata/shot-{slot}.jpg",
                "caption": f"Fixture {suffix} screenshot {slot}",
                "width": 1920,
                "height": 1080,
            }
            for slot in range(1, 5)
        ],
        "steam_appid": None,
        "steam_store_name": "",
        "steam_dlc_appids": [],
        "has_points_shop": False,
        "steam_store_state": "unknown",
        "steam_store_url": "",
        "steam_news": [
            {
                "id": f"news-{suffix}-{slot}",
                "gid": f"news-{suffix}-{slot}",
                "news_id": f"news-{suffix}-{slot}",
                "announcement_gid": f"news-{suffix}-{slot}",
                "event_gid": f"news-{suffix}-{slot}",
                "event_type": 28,
                "type": 28,
                "title": f"Fixture news {suffix} {slot}",
                "url": f"https://news.example.invalid/decky-metadata/{suffix}/{slot}",
                "summary": "N" * 256,
                "body": "N" * 256,
                "raw_body": "N" * 256,
                "image": "",
                "image_sources": [],
                "author": "Benchmark",
                "feedLabel": "Benchmark",
                "date": 1626048000 + slot - 1,
            }
            for slot in range(1, 7)
        ],
        "steam_news_enriched_at": 1626048000,
        "updated_at": 1626048000,
    }


def expected_fixture(size: int) -> dict[str, object]:
    return {
        "release_date_format": "date-only-v1",
        "metadata": {str(2147483648 + i): expected_record(i) for i in range(size)},
        "shortcut_names": {},
        "settings": {
            "debug_logging": False,
            "game_trailers": {
                "enabled": False,
                "detailEnabled": False,
                "homeEnabled": False,
                "audioEnabled": False,
                "quality": "auto",
                "hideLogoDuringTrailer": False,
                "detailFadeInDelaySeconds": 3,
                "homeFadeInDelaySeconds": 3,
            },
            "mini_achievements_enabled": False,
            "protondb_badges": {
                "enabled": False,
                "home": False,
                "library": False,
                "gameView": False,
                "store": False,
                "focusOnly": False,
                "coverPosition": "bottom-left",
            },
        },
        "update_settings": {"automatic_update_checks": False},
        "update_check_cache": {},
    }


def canonical_fixture(size: int) -> bytes:
    return (json.dumps(expected_fixture(size), ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def test_fixture_bytes_match_independent_100_and_1000_record_contract():
    for size, expected_missing in ((100, 25), (1000, 250)):
        actual = benchmark.fixture_bytes(size)
        expected = canonical_fixture(size)
        assert actual == expected
        parsed = json.loads(actual)
        assert list(parsed["metadata"]) == [str(2147483648 + i) for i in range(size)]
        assert sum(not record["description"] for record in parsed["metadata"].values()) == expected_missing
        assert sum(bool(record["description"]) for record in parsed["metadata"].values()) == size - expected_missing
        assert all(record["steam_store_state"] == "unknown" for record in parsed["metadata"].values())
        assert all(len(record["screenshots"]) == 4 and len(record["steam_news"]) == 6 for record in parsed["metadata"].values())
        assert "Café" in actual.decode("utf-8") and "—" in actual.decode("utf-8")
        benchmark.validate_fixture_data(parsed, size)


def test_fixture_validation_rejects_sanitizer_lost_or_changed_rows():
    fixture = expected_fixture(100)
    record = fixture["metadata"]["2147483648"]
    del record["screenshots"][2]["caption"]
    with pytest.raises(ValueError, match="altered or lost"):
        benchmark.validate_fixture_data(fixture, 100)

    fixture = expected_fixture(100)
    fixture["metadata"]["2147483648"]["steam_news"].pop()
    with pytest.raises(ValueError, match="altered or lost"):
        benchmark.validate_fixture_data(fixture, 100)


def test_workload_schedule_has_exact_arm_order_and_call_total():
    expected = [(arm, size, trial) for arm in "ABC" for size in (100, 1000) for trial in range(1, 6)]
    assert benchmark.trial_order() == expected
    assert len(expected) == 30
    assert benchmark.MEASURED_CALLS_PER_TRIAL == 6450
    assert benchmark.MEASURED_CALLS_PER_TRIAL * len(expected) == 193500
    assert benchmark.expected_workload_counts() == {
        "get_metadata_hit_serial": 1000,
        "get_metadata_miss_serial": 1000,
        "get_missing_metadata_count_serial": 1000,
        "get_all_metadata_serial": 200,
        "get_metadata_hit_concurrency_8": 1000,
        "get_metadata_miss_concurrency_8": 1000,
        "get_missing_metadata_count_concurrency_8": 1000,
        "get_all_metadata_concurrency_8": 200,
        "save_metadata_serial": 50,
    }

def test_complete_write_population_exists_for_both_dataset_sizes():
    for size, missing in ((100, 25), (1000, 250)):
        params = benchmark.workload_params(size, "0.5.5")
        complete = [record for record in params["records"] if record["description"]]
        assert params["missing"] == missing
        assert len(complete) == size - missing
        targets = complete[:50]
        assert len(targets) == 50
        assert len({record["appid"] for record in targets}) == 50
        assert all(record["description"] and record["source"] == "Manual" for record in targets)



def valid_workload_result(size: int = 100) -> dict[str, object]:
    counts = {
        "get_metadata_hit_serial": 1000,
        "get_metadata_miss_serial": 1000,
        "get_missing_metadata_count_serial": 1000,
        "get_all_metadata_serial": 200,
        "get_metadata_hit_concurrency_8": 1000,
        "get_metadata_miss_concurrency_8": 1000,
        "get_missing_metadata_count_concurrency_8": 1000,
        "get_all_metadata_concurrency_8": 200,
        "save_metadata_serial": 50,
    }
    measurements = {
        name: {
            "count": count,
            "completedCalls": count,
            "samplesMs": [2.0] * count,
            "wallMs": float(count * 4),
            "throughputCallsPerSecond": 250.0,
        }
        for name, count in counts.items()
    }
    return {
        "ok": True,
        "schema": 1,
        "datasetSize": size,
        "missing": size // 4,
        "warmupCalls": 400,
        "expectedMeasuredCalls": 6450,
        "sampleCalls": 6450,
        "completedCalls": 6450,
        "measurements": measurements,
        "errors": [],
    }


def test_result_validation_rejects_dropped_invalid_and_timed_out_calls():
    valid = valid_workload_result()
    benchmark.validate_workload_result(valid, 100)

    dropped = json.loads(json.dumps(valid))
    dropped["measurements"]["get_metadata_hit_serial"]["samplesMs"].pop()
    with pytest.raises(ValueError, match="retain all"):
        benchmark.validate_workload_result(dropped, 100)

    invalid = json.loads(json.dumps(valid))
    invalid["errors"] = [{"method": "get_metadata", "error": "result validation failed"}]
    with pytest.raises(ValueError, match="contains RPC"):
        benchmark.validate_workload_result(invalid, 100)

    timed_out = json.loads(json.dumps(valid))
    timed_out["errors"] = [{"method": "save_metadata", "error": "timed out"}]
    with pytest.raises(ValueError, match="contains RPC"):
        benchmark.validate_workload_result(timed_out, 100)

    incomplete = json.loads(json.dumps(valid))
    incomplete["measurements"]["save_metadata_serial"]["completedCalls"] = 49
    with pytest.raises(ValueError, match="complete exactly"):
        benchmark.validate_workload_result(incomplete, 100)


def test_wrong_ui_binary_and_fork_provenance_are_rejected(tmp_path: Path):
    with pytest.raises(ValueError, match="bytes differ"):
        benchmark.validate_ui_parity({"ui_bytes": b"original", "ui_sha256": "a"}, {"ui_bytes": b"other", "ui_sha256": "b"})

    bad_binary = tmp_path / "rust.zip"
    write_plugin_zip(bad_binary, b"same-ui", backend=b"not an x86-64 executable")
    with pytest.raises(ValueError, match="ELF|backend"):
        benchmark._plugin_archive(bad_binary, "Rust ZIP")

    nonexecutable = tmp_path / "nonexecutable.zip"
    minimal_elf = b"\x7fELF\x02\x01" + b"\0" * 12 + b"\x3e\x00" + b"\0" * 4
    write_plugin_zip(nonexecutable, b"same-ui", backend=minimal_elf, backend_mode=0o100644)
    with pytest.raises(ValueError, match="executable"):
        benchmark._plugin_archive(nonexecutable, "Rust ZIP")
    with pytest.raises(ValueError, match="shim"):
        benchmark.validate_shim_parity(b"untrusted shim", b"pinned shim")

    wrong_source = tmp_path / "fork"
    wrong_source.mkdir()
    (wrong_source / "decky-loader-runtime").write_bytes(b"not important after provenance rejection")
    (wrong_source / "decky-loader-runtime").chmod(0o755)
    (wrong_source / "bundle.json").write_text(json.dumps({
        "kind": "decky-loader-runtime",
        "rust_executable": "decky-loader-runtime",
        "release_version": "dev",
        "worker_packaging": "onedir",
        "source_baseline": {
            "tag": "wrong",
            "commit": "0" * 40,
            "backend_tree": "0" * 40,
            "frontend_tree": "0" * 40,
        },
        "build": {"base_commit": "0" * 40},
        "sha256": {},
    }), encoding="utf-8")
    with pytest.raises(ValueError, match="pinned|source|provenance"):
        benchmark._safe_bundle_tree(wrong_source)


def write_plugin_zip(path: Path, ui: bytes, *, backend: bytes | None = None, backend_mode: int = 0o100755) -> None:
    manifest: dict[str, object] = {"name": "Decky Metadata", "api_version": 1, "version": "1.2.3"}
    files = {
        "Decky-Metadata/plugin.json": json.dumps(manifest).encode(),
        "Decky-Metadata/package.json": json.dumps({"version": "1.2.3"}).encode(),
        "Decky-Metadata/dist/index.js": ui,
        "Decky-Metadata/main.py": b"pinned shim",
    }
    if backend is not None:
        manifest["backend"] = "bin/backend"
        files["Decky-Metadata/plugin.json"] = json.dumps(manifest).encode()
        files["Decky-Metadata/bin/backend"] = backend
    with zipfile.ZipFile(path, "w") as archive:
        for name, data in files.items():
            info = zipfile.ZipInfo(name)
            info.external_attr = ((backend_mode if name.endswith("/bin/backend") else 0o100644) << 16)
            archive.writestr(info, data)


def test_verification_record_binds_exact_artifact_and_loader_hashes(tmp_path: Path):
    hashes = {
        "python_zip_sha256": "1" * 64,
        "rust_zip_sha256": "2" * 64,
        "ui_sha256": "3" * 64,
        "rust_binary_sha256": "4" * 64,
        "upstream_runtime_sha256": "5" * 64,
        "fork_runtime_sha256": "6" * 64,
        "fork_runtime_executable_sha256": "7" * 64,
        "fork_binary_sha256": "4" * 64,
    }
    arms = {
        "A": {"verified": True, "zip_sha256": hashes["python_zip_sha256"], "ui_sha256": hashes["ui_sha256"], "loader_runtime_sha256": hashes["upstream_runtime_sha256"], "rust_binary_sha256": None, "fork_binary_sha256": None, "fork_runtime_sha256": None},
        "B": {"verified": True, "zip_sha256": hashes["rust_zip_sha256"], "ui_sha256": hashes["ui_sha256"], "loader_runtime_sha256": hashes["upstream_runtime_sha256"], "rust_binary_sha256": hashes["rust_binary_sha256"], "fork_binary_sha256": hashes["fork_binary_sha256"], "fork_runtime_sha256": None},
        "C": {"verified": True, "zip_sha256": hashes["rust_zip_sha256"], "ui_sha256": hashes["ui_sha256"], "loader_runtime_sha256": hashes["fork_runtime_executable_sha256"], "rust_binary_sha256": hashes["rust_binary_sha256"], "fork_binary_sha256": hashes["fork_binary_sha256"], "fork_runtime_sha256": hashes["fork_runtime_sha256"]},
    }
    record = {"schema": 1, "verified_arms": ["A", "B", "C"], "hashes": dict(hashes), "arms": arms}
    path = tmp_path / "verification.json"
    path.write_text(json.dumps(record), encoding="utf-8")
    assert benchmark.validate_verification_record(path, hashes) == record
    record["hashes"]["unverified_extra"] = "9" * 64
    path.write_text(json.dumps(record), encoding="utf-8")
    with pytest.raises(ValueError, match="exact ZIP"):
        benchmark.validate_verification_record(path, hashes)
    del record["hashes"]["unverified_extra"]
    record["arms"]["C"]["rust_binary_sha256"] = "8" * 64
    path.write_text(json.dumps(record), encoding="utf-8")
    with pytest.raises(ValueError, match="arm C"):
        benchmark.validate_verification_record(path, hashes)


def test_remote_verification_rejects_wrong_loader_and_binary_hashes():
    hashes = {
        "python_zip_sha256": "1" * 64,
        "rust_zip_sha256": "2" * 64,
        "ui_sha256": "3" * 64,
        "rust_binary_sha256": "4" * 64,
        "upstream_runtime_sha256": "5" * 64,
        "fork_runtime_executable_sha256": "6" * 64,
        "fork_binary_sha256": "4" * 64,
    }
    result = {"arm": "C", "hashes": {
        "python_zip_sha256": hashes["python_zip_sha256"],
        "rust_zip_sha256": hashes["rust_zip_sha256"],
        "ui_sha256": hashes["ui_sha256"],
        "rust_binary_sha256": hashes["rust_binary_sha256"],
        "loader_runtime_sha256": hashes["fork_runtime_executable_sha256"],
        "fork_binary_sha256": hashes["fork_binary_sha256"],
    }}
    benchmark.validate_remote_verification(result, "C", hashes)
    result["hashes"]["loader_runtime_sha256"] = hashes["upstream_runtime_sha256"]
    with pytest.raises(benchmark.BenchmarkError, match="hashes"):
        benchmark.validate_remote_verification(result, "C", hashes)
    result["hashes"]["loader_runtime_sha256"] = hashes["fork_runtime_executable_sha256"]
    result["hashes"]["rust_binary_sha256"] = "0" * 64
    with pytest.raises(benchmark.BenchmarkError, match="hashes"):
        benchmark.validate_remote_verification(result, "C", hashes)




def test_host_observer_contract_rejects_missing_counts_and_activity():
    state = {
        "attachedAt": 0,
        "updateStarted": 0,
        "updateCompleted": 0,
        "updateActive": 0,
        "updateErrors": [],
        "catalogStarted": 0,
        "catalogCompleted": 0,
        "catalogActive": 0,
        "catalogErrors": [],
    }
    benchmark._check_observer_state(state)

    missing = dict(state)
    del missing["updateStarted"]
    with pytest.raises(benchmark.BenchmarkError, match="not quiescent"):
        benchmark._check_observer_state(missing)
    active = dict(state)
    active["catalogActive"] = 1
    with pytest.raises(benchmark.BenchmarkError, match="not quiescent"):
        benchmark._check_observer_state(active)
    failed = dict(state)
    failed["updateErrors"] = ["notification callback failed"]
    with pytest.raises(benchmark.BenchmarkError, match="not quiescent"):
        benchmark._check_observer_state(failed)



def test_remote_paths_and_shell_arguments_are_quoted_and_contained(tmp_path: Path):
    command = ["python3", "-c", "print('a b; $(touch /tmp/nope)')", "/var/tmp/run root/helper.py"]
    argv = benchmark.ssh_argv("deck@steamdeck-vm", 22, command)
    assert argv[:6] == ["ssh", "-T", "-p", "22", "--", "deck@steamdeck-vm"]
    assert argv[6] == shlex.join(command)
    assert "touch /tmp/nope" in argv[6]
    assert benchmark.remote_path_is_within("/var/tmp/run-1/inputs/rust.zip", "/var/tmp/run-1")
    assert not benchmark.remote_path_is_within("/var/tmp/run-10/inputs/rust.zip", "/var/tmp/run-1")
    with pytest.raises(ValueError):
        benchmark.validate_remote_path("/var/tmp/run/../normal/homebrew")
    with pytest.raises(ValueError):
        benchmark.safe_relative_scratch("/home/deck/homebrew")
    with pytest.raises(ValueError):
        benchmark.safe_relative_scratch("../homebrew")

    source = tmp_path / "-input.zip"
    staged = benchmark.scp_to_argv("deck", 22, source, "/var/tmp/run/inputs/python.zip")
    assert staged[4] == "--"
    assert staged[-1] == "deck:/var/tmp/run/inputs/python.zip"


def test_checked_inputs_reject_symlinks_and_existing_output(tmp_path: Path):
    real = tmp_path / "input.zip"
    real.write_bytes(b"input")
    link = tmp_path / "link.zip"
    link.symlink_to(real)
    with pytest.raises(ValueError, match="non-symlink"):
        benchmark._checked_local_file(link, "input")
    with pytest.raises(ValueError, match="output directory already exists"):
        benchmark._create_output_dir(str(tmp_path))


def test_lease_requires_a_confirmed_remote_watchdog_heartbeat(tmp_path: Path):
    class StopAfterOneBeat:
        def __init__(self) -> None:
            self.waits = 0

        def wait(self, seconds: int) -> bool:
            self.waits += 1
            return self.waits > 1

        def set(self) -> None:
            pass

    class FakeRemote:
        def __init__(self, active: bool) -> None:
            self.active = active
            self.calls: list[tuple[str, object, int]] = []

        def call(self, command: str, payload: object, *, timeout: int) -> dict[str, object]:
            self.calls.append((command, payload, timeout))
            return {"lease_active": self.active}

    for active in (True, False):
        root = tmp_path / f"heartbeat-{active}"
        root.mkdir()
        remote = FakeRemote(active)
        lease = benchmark.Lease(remote, benchmark.Evidence(root))
        lease._stop = StopAfterOneBeat()
        lease._run()
        assert remote.calls == [("heartbeat", {}, 10)]
        if active:
            lease.check()
        else:
            with pytest.raises(benchmark.BenchmarkError, match="heartbeat failed"):
                lease.check()



def test_run_keeps_primary_and_recovery_conflict_errors(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    import threading

    hashes = {
        "python_zip_sha256": "1" * 64,
        "rust_zip_sha256": "2" * 64,
        "ui_sha256": "3" * 64,
        "rust_binary_sha256": "4" * 64,
        "upstream_runtime_sha256": "5" * 64,
        "fork_runtime_sha256": "6" * 64,
        "fork_runtime_executable_sha256": "7" * 64,
        "fork_binary_sha256": "4" * 64,
    }
    artifacts = {
        "python_package": {"zip_sha256": hashes["python_zip_sha256"], "ui_sha256": hashes["ui_sha256"], "version": "1.2.3"},
        "rust_package": {"zip_sha256": hashes["rust_zip_sha256"], "ui_sha256": hashes["ui_sha256"], "backend_sha256": hashes["rust_binary_sha256"], "version": "1.2.3"},
        "fork_manifest": {"source_baseline": {"commit": "pinned"}},
        "hashes": hashes,
    }

    class FailingRemote:
        run_root = "/var/tmp/metadata-benchmark-1234567890abcdef"
        scratch = run_root + "/scratch-homebrew"
        ledger = run_root + "/ledger.json"
        helper = run_root + "/tools/benchmark_vm.py"
        inputs = {}

        def scp_to(self, source: Path, destination: str, *, recursive: bool = False) -> None:
            pass

        def call(self, command: str, payload: object = None, **kwargs: object) -> dict[str, object]:
            if command == "capture":
                return {"captured": False}
            if command == "recover":
                return {"ok": False, "conflicts": ["Downloads changed independently"]}
            raise AssertionError(command)

    remote = FailingRemote()
    monkeypatch.setenv("DECKY_TMP_ROOT", str(tmp_path))
    monkeypatch.setattr(benchmark, "load_local_artifacts", lambda _args: artifacts)
    monkeypatch.setattr(benchmark, "prepare_run_root", lambda *_args: remote)
    monkeypatch.setattr(benchmark, "_stage_fixture_files", lambda *_args: None)
    monkeypatch.setattr(benchmark, "_install_signal_handlers", lambda _event: {})
    monkeypatch.setattr(benchmark, "_restore_signal_handlers", lambda _previous: None)
    monkeypatch.setattr(benchmark, "RemoteClient", lambda *_args: remote)
    monkeypatch.setattr(benchmark.sys, "stdin", io.StringIO(""))
    args = benchmark.build_parser().parse_args([
        "--host", "deck", "--cdp-port", "18082", "--scratch-homebrew", "scratch-homebrew",
        "--python-zip", "python.zip", "--rust-zip", "rust.zip", "--upstream-runtime", "PluginLoader",
        "--fork-runtime", "bundle", "--output-dir", "evidence", "--dry-run",
    ])
    with pytest.raises(benchmark.BenchmarkError) as caught:
        benchmark.run(args)
    message = str(caught.value)
    assert "remote capture did not bind" in message
    assert "verified recovery failed" in message
    assert "Downloads changed independently" in message


def test_node_workload_and_observer_behavior_against_stateful_fixture():
    node = shutil.which("node")
    assert node is not None, "Node is required for the behavioral benchmark workload test"
    fixture = expected_fixture(100)
    payload = {
        "size": 100,
        "missing": 25,
        "records": list(fixture["metadata"].values()),
        "writeDescriptionA": "A" * 512,
        "writeDescriptionB": "B" * 512,
        "version": "1.2.3",
    }
    result = subprocess.run(
        [node, "-e", NODE, str(benchmark.JS_PATH)],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_preload_survives_the_old_document_navigation_race(monkeypatch: pytest.MonkeyPatch):
    state = {"old_document": True, "registration": False, "closed": False}
    marker = {"runId": "navigation-race", "attached": False, "error": None}
    sock = SimpleNamespace(close=lambda: state.update(closed=True))

    def rpc(_sock, _id, method, _params):
        if method == "Page.addScriptToEvaluateOnNewDocument":
            state["registration"] = True
            return {"result": {"identifier": "owned-script"}}
        if method == "Page.removeScriptToEvaluateOnNewDocument":
            state["registration"] = False
        return {}

    def evaluate(_target, _source, **_kwargs):
        if state["old_document"]:
            state["old_document"] = False
            raise SystemExit(1)
        return {"type": "string", "value": json.dumps(marker)}

    monkeypatch.setattr(benchmark.cdp, "target_socket", lambda _target: sock)
    monkeypatch.setattr(benchmark.cdp, "rpc", rpc)
    monkeypatch.setattr(benchmark.cdp, "evaluate", evaluate)
    lease = SimpleNamespace(check=lambda: None)
    returned_sock, _identifier, observed = benchmark.prime_observers(lease, marker["runId"])
    assert observed["runId"] == marker["runId"] and observed["attached"] is False
    assert state["registration"] is True and state["closed"] is False
    returned_sock.close()


def test_failed_preload_keeps_primary_error_when_owned_cleanup_also_fails(monkeypatch: pytest.MonkeyPatch):
    primary = benchmark.BenchmarkError("startup ownership changed")
    detach_error = benchmark.BenchmarkError("foreign observer cannot be detached")
    removal_error = OSError("registration transport closed")
    state = {"closed": False}
    sock = SimpleNamespace(close=lambda: state.update(closed=True))

    def rpc(_sock, _id, method, _params):
        if method == "Page.addScriptToEvaluateOnNewDocument":
            return {"result": {"identifier": "owned-script"}}
        if method == "Page.removeScriptToEvaluateOnNewDocument":
            raise removal_error
        return {}

    def fail_primary():
        raise primary

    def fail_detach(_command, _params):
        raise detach_error

    monkeypatch.setattr(benchmark.cdp, "target_socket", lambda _target: sock)
    monkeypatch.setattr(benchmark.cdp, "rpc", rpc)
    monkeypatch.setattr(benchmark, "cdp_command", fail_detach)
    with pytest.raises(benchmark.BenchmarkError) as caught:
        benchmark.prime_observers(SimpleNamespace(check=fail_primary), "owned-run")
    assert caught.value is primary and state["closed"] is True
    assert any(str(detach_error) in note for note in primary.__notes__)
    assert any(str(removal_error) in note for note in primary.__notes__)
