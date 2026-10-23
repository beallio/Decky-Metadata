from __future__ import annotations

import contextlib
import fcntl
import hashlib
import json
import os
import stat
import subprocess
import threading
import time
import zipfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from scripts.deck import benchmark_vm as vm


def test_scratch_containment_rejects_both_ancestry_directions_and_aliases(tmp_path: Path):
    run_root = tmp_path / "run"
    run_root.mkdir()
    scratch = run_root / "scratch-homebrew"
    scratch.mkdir()
    normal = tmp_path / "homebrew"
    normal.mkdir()

    assert vm.assert_scratch_isolated(run_root, scratch, normal) == (
        run_root.resolve(), scratch.resolve(), normal.resolve()
    )
    with pytest.raises(vm.SafetyError):
        vm.assert_scratch_isolated(run_root, scratch, run_root)
    nested_normal = scratch / "plugins"
    nested_normal.mkdir()
    with pytest.raises(vm.SafetyError):
        vm.assert_scratch_isolated(run_root, scratch, nested_normal)

    alias = run_root / "scratch-alias"
    alias.symlink_to(scratch, target_is_directory=True)
    with pytest.raises(vm.SafetyError):
        vm.assert_scratch_isolated(run_root, alias, normal)
    normal_alias = tmp_path / "normal-alias"
    normal_alias.symlink_to(scratch, target_is_directory=True)
    with pytest.raises(vm.SafetyError):
        vm.assert_scratch_isolated(run_root, scratch, normal_alias)


def test_private_containment_rejects_symlink_escape_and_traversal(tmp_path: Path):
    root = tmp_path / "run"
    root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (root / "alias").symlink_to(outside, target_is_directory=True)

    with pytest.raises(vm.SafetyError):
        vm.require_contained(root / "alias" / "result", root, label="fixture")
    with pytest.raises(vm.SafetyError):
        vm.require_contained(root / "../outside" / "result", root, label="fixture")


@pytest.mark.parametrize(
    "name",
    [
        "../Decky-Metadata/file",
        "Decky-Metadata/../other/file",
        "./Decky-Metadata/file",
        "Decky-Metadata/./file",
        "Decky-Metadata//file",
        "Decky-Metadata\\file",
        "/Decky-Metadata/file",
    ],
)
def test_archive_member_paths_reject_noncanonical_and_escaping_names(name: str):
    with pytest.raises(vm.SafetyError):
        vm._validate_archive_path(name)


def test_zip_index_rejects_traversal_before_extraction(tmp_path: Path):
    archive_path = tmp_path / "bad.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("Decky-Metadata/../outside", b"unsafe")
    with pytest.raises(vm.SafetyError, match="archive|traversal"):
        vm._archive_index(archive_path, vm.sha256_file(archive_path))


def test_malformed_ledger_and_unapproved_units_are_rejected(tmp_path: Path):
    path = tmp_path / "ledger.json"
    path.write_text('{"schema_version":1,"schema_version":2}', encoding="utf-8")
    path.chmod(0o600)
    with pytest.raises(vm.SafetyError):
        vm._load_ledger(path)

    with pytest.raises(vm.SafetyError):
        vm._valid_unit_name("plugin_loader.service", "decky-metadata-benchmark-0123456789abcdef", ["a"])
    with pytest.raises(vm.SafetyError):
        vm._valid_unit_name(
            "decky-metadata-benchmark-0123456789abcdef-a.service/../../plugin_loader.service",
            "decky-metadata-benchmark-0123456789abcdef",
            ["a"],
        )


def _test_file_entry(target: Path, backup: Path, original: bytes, replacement: bytes) -> dict[str, Any]:
    return {
        "kind": "test_file",
        "path": str(target),
        "original_exists": True,
        "original_sha256": hashlib.sha256(original).hexdigest(),
        "original_mode": 0o640,
        "backup_path": str(backup),
        "replacement_sha256": hashlib.sha256(replacement).hexdigest(),
        "replacement_mode": 0o600,
    }


def test_conditional_file_undo_restores_only_task_bytes_and_is_idempotent(tmp_path: Path):
    target = tmp_path / "watchdog-test" / "probe.bin"
    backup = tmp_path / "watchdog-test" / "original.bin"
    target.parent.mkdir()
    original = b"original"
    replacement = b"benchmark replacement"
    backup.write_bytes(original)
    backup.chmod(0o600)
    target.write_bytes(replacement)
    target.chmod(0o600)
    entry = _test_file_entry(target, backup, original, replacement)

    assert vm._guarded_restore_file(entry, path_override=target, backup_root=target.parent) == "restored"
    assert target.read_bytes() == original
    assert stat.S_IMODE(target.stat().st_mode) == 0o640
    assert vm._guarded_restore_file(entry, path_override=target, backup_root=target.parent) == "restored"
    assert target.read_bytes() == original


def test_conditional_file_undo_preserves_independent_change(tmp_path: Path):
    target = tmp_path / "watchdog-test" / "probe.bin"
    backup = tmp_path / "watchdog-test" / "original.bin"
    target.parent.mkdir()
    original = b"original"
    replacement = b"benchmark replacement"
    unrelated = b"user's later edit"
    backup.write_bytes(original)
    backup.chmod(0o600)
    target.write_bytes(unrelated)
    target.chmod(0o600)
    entry = _test_file_entry(target, backup, original, replacement)

    assert vm._guarded_restore_file(entry, path_override=target, backup_root=target.parent) == "conflict"
    assert target.read_bytes() == unrelated
    assert stat.S_IMODE(target.stat().st_mode) == 0o600


def _service_snapshot(scope: str, unit: str, active: bool) -> dict[str, Any]:
    return {"scope": scope, "unit": unit, "active": active, "active_state": "active" if active else "inactive"}


@pytest.mark.parametrize("original_scope", ["system", "user"])
@pytest.mark.parametrize("cef_active", [False, True])
def test_original_loader_and_cef_activation_are_restored_without_touching_other_state(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, original_scope: str, cef_active: bool
):
    account = SimpleNamespace(pw_name="deck")
    states = {
        ("system", vm.UPSTREAM_SYSTEM_UNIT): False,
        ("user", vm.USER_LOADER_UNIT): False,
        ("system", vm.CEF_FORWARDER_UNIT): cef_active,
        ("user", "unrelated.service"): True,
    }
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(vm, "_account", lambda _name: account)
    monkeypatch.setattr(vm, "_port_owners", lambda: [])
    monkeypatch.setattr(vm, "_systemd_unit_active", lambda scope, unit, _account: states[(scope, unit)])

    def system_command(args, **_kwargs):
        calls.append(("system", args[0] + ":" + args[1]))
        if args[0] == "start":
            states[("system", args[1])] = True
        return subprocess.CompletedProcess(args, 0, b"", b"")

    def user_command(_account, args, **_kwargs):
        calls.append(("user", args[0] + ":" + args[1]))
        if args[0] == "start":
            states[("user", args[1])] = True
        return subprocess.CompletedProcess(args, 0, b"", b"")

    monkeypatch.setattr(vm, "_system_command", system_command)
    monkeypatch.setattr(vm, "_user_command", user_command)
    snapshot = {
        "units": {
            "system": _service_snapshot("system", vm.UPSTREAM_SYSTEM_UNIT, original_scope == "system"),
            "user": _service_snapshot("user", vm.USER_LOADER_UNIT, original_scope == "user"),
        },
        "cef_forwarder": _service_snapshot("system", vm.CEF_FORWARDER_UNIT, cef_active),
        "cef_forwarder_socket": _service_snapshot("system", vm.CEF_FORWARDER_SOCKET, False),
    }
    unit = vm.UPSTREAM_SYSTEM_UNIT if original_scope == "system" else vm.USER_LOADER_UNIT
    ledger = {
        "user_name": "deck", "snapshot": snapshot, "ledger_path": str(tmp_path / "ledger.json"),
        "undo_entries": [{"kind": "normal_unit", "scope": original_scope, "unit": unit, "was_active": True, "state": "pending"}],
    }
    service_snapshots = {(scope, item["unit"]): item for scope, item in snapshot["units"].items()}
    service_snapshots[("system", vm.CEF_FORWARDER_UNIT)] = snapshot["cef_forwarder"]
    service_snapshots[("system", vm.CEF_FORWARDER_SOCKET)] = snapshot["cef_forwarder_socket"]
    monkeypatch.setattr(vm, "_known_unit_snapshot", lambda scope, unit, _account: service_snapshots[(scope, unit)])
    monkeypatch.setattr(vm, "_mutate_ledger", lambda _path, change: change(ledger) or ledger)
    conflicts: list[str] = []

    result = vm._restart_original_services(ledger, conflicts)

    assert states[(original_scope, vm.UPSTREAM_SYSTEM_UNIT if original_scope == "system" else vm.USER_LOADER_UNIT)]
    assert states[("system", vm.CEF_FORWARDER_UNIT)] is cef_active
    assert states[("user", "unrelated.service")] is True
    assert calls == [(original_scope, "start:" + (vm.UPSTREAM_SYSTEM_UNIT if original_scope == "system" else vm.USER_LOADER_UNIT))]
    assert not conflicts
    assert result[original_scope] is True and result["cef_forwarder"] is True
    assert ledger["undo_entries"][0]["state"] == "restored"


def test_service_recovery_preserves_unrelated_activation_changes(monkeypatch: pytest.MonkeyPatch):
    account = SimpleNamespace(pw_name="deck")
    states = {
        ("system", vm.UPSTREAM_SYSTEM_UNIT): True,
        ("user", vm.USER_LOADER_UNIT): True,
        ("system", vm.CEF_FORWARDER_UNIT): False,
    }
    calls: list[list[str]] = []
    monkeypatch.setattr(vm, "_account", lambda _name: account)
    monkeypatch.setattr(vm, "_port_owners", lambda: [])
    monkeypatch.setattr(vm, "_systemd_unit_active", lambda scope, unit, _account: states[(scope, unit)])
    monkeypatch.setattr(vm, "_system_command", lambda args, **_kwargs: calls.append(args) or subprocess.CompletedProcess(args, 0, b"", b""))
    monkeypatch.setattr(vm, "_user_command", lambda _account, args, **_kwargs: calls.append(args) or subprocess.CompletedProcess(args, 0, b"", b""))
    snapshot = {
        "units": {
            "system": _service_snapshot("system", vm.UPSTREAM_SYSTEM_UNIT, True),
            "user": _service_snapshot("user", vm.USER_LOADER_UNIT, False),
        },
        "cef_forwarder": _service_snapshot("system", vm.CEF_FORWARDER_UNIT, True),
        "cef_forwarder_socket": _service_snapshot("system", vm.CEF_FORWARDER_SOCKET, False),
    }
    conflicts: list[str] = []

    monkeypatch.setattr(vm, "_known_unit_snapshot", lambda _scope, unit, _account: {**snapshot["cef_forwarder" if unit == vm.CEF_FORWARDER_UNIT else "cef_forwarder_socket"], "active": False, "active_state": "inactive"})
    vm._restart_original_services({"user_name": "deck", "snapshot": snapshot}, conflicts)

    assert states[("user", vm.USER_LOADER_UNIT)] is True
    assert states[("system", vm.CEF_FORWARDER_UNIT)] is False
    assert calls == []
    assert "normal_loader:user:unexpectedly_active" in conflicts
    assert "cef_forwarder:activation_or_selection_changed" in conflicts


def test_pid_starttime_reuse_is_not_treated_as_the_captured_process(monkeypatch: pytest.MonkeyPatch):
    identity = {"pid": 271, "starttime": 100}
    monkeypatch.setattr(vm, "pid_starttime", lambda _pid: 101)
    assert not vm._same_process(identity)


def test_cgroup_drain_refuses_unknown_process_without_signaling_it(monkeypatch: pytest.MonkeyPatch):
    known = {"pid": 271, "starttime": 100, "captured_group": "/system.slice/bench.service"}
    killed: list[tuple[int, int]] = []
    monkeypatch.setattr(vm, "_system_command", lambda args, **_kwargs: subprocess.CompletedProcess(args, 0, b"", b""))
    monkeypatch.setattr(vm, "_pids_in_cgroup", lambda _group: [999])
    monkeypatch.setattr(vm, "_show_unit", lambda *_args: {"ActiveState": "inactive"})
    monkeypatch.setattr(vm, "pid_starttime", lambda pid: 101 if pid == 271 else 200)
    monkeypatch.setattr(vm, "_process_in_cgroup", lambda _pid, _group: False)
    monkeypatch.setattr(vm, "_wait_until", lambda predicate, *_args, **_kwargs: predicate())
    monkeypatch.setattr(vm.os, "kill", lambda pid, sig: killed.append((pid, sig)))

    with pytest.raises(vm.SafetyError, match="did not drain"):
        vm._drain_unit("system", "bench.service", SimpleNamespace(pw_name="deck"), group="/system.slice/bench.service", captured=[known], timeout=0)
    assert killed == []


def test_wait_until_observes_its_deadline_without_wall_clock_sleep():
    now = [0.0]

    def sleep(seconds: float) -> None:
        now[0] += seconds

    assert not vm._wait_until(lambda: False, 0.025, 0.01, clock=lambda: now[0], sleep=sleep)
    assert now[0] == pytest.approx(0.025)


def test_authority_failures_are_noninteractive_and_do_not_run_user_commands(monkeypatch: pytest.MonkeyPatch):
    observed: list[list[str]] = []
    monkeypatch.setattr(vm.os, "geteuid", lambda: 1000)

    def failed_sudo(args, **_kwargs):
        observed.append(list(args))
        raise vm.SafetyError("required local authority command failed")

    monkeypatch.setattr(vm, "_command", failed_sudo)
    with pytest.raises(vm.SafetyError):
        vm._require_root_authority()
    assert observed == [["sudo", "-n", "true"]]

    user_commands: list[list[str]] = []
    monkeypatch.setattr(vm, "_verified_user_bus", lambda _account: (_ for _ in ()).throw(vm.SafetyError("user bus unavailable")))
    monkeypatch.setattr(vm, "_command", lambda args, **_kwargs: user_commands.append(list(args)))
    with pytest.raises(vm.SafetyError, match="user bus unavailable"):
        vm._user_command(SimpleNamespace(pw_uid=1000, pw_name="deck"), ["start", "plugin_loader.service"])
    assert not user_commands




def test_collector_summary_uses_pss_deduplicates_pids_and_computes_cpu_rates(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(vm.os, "sysconf", lambda _name: 100)
    samples = [
        {
            "monotonic_ns": 1_000_000_000,
            "service_cpu_delta_usec": None,
            "errors": [],
            "processes": [
                {"pid": 10, "starttime": 1, "role": "metadata_python", "pss_kib": 40, "rss_kib": 60, "private_dirty_kib": 4},
                {"pid": 10, "starttime": 1, "role": "metadata_python", "pss_kib": 40, "rss_kib": 60, "private_dirty_kib": 4},
                {"pid": 11, "starttime": 2, "role": "metadata_python", "pss_kib": 60, "rss_kib": 90, "private_dirty_kib": 6},
                {"pid": 12, "starttime": 3, "role": "loader_overhead", "pss_kib": 30, "rss_kib": 50, "private_dirty_kib": 3},
            ],
        },
        {
            "monotonic_ns": 2_000_000_000,
            "service_cpu_delta_usec": 300_000,
            "errors": [],
            "processes": [
                {"pid": 10, "starttime": 1, "role": "metadata_python", "pss_kib": 55, "rss_kib": 80, "private_dirty_kib": 5},
                {"pid": 11, "starttime": 2, "role": "metadata_python", "pss_kib": 65, "rss_kib": 95, "private_dirty_kib": 7},
                {"pid": 12, "starttime": 3, "role": "loader_overhead", "pss_kib": 35, "rss_kib": 55, "private_dirty_kib": 4},
            ],
        },
    ]
    for index, sample in enumerate(samples):
        for process in sample["processes"]:
            process["cpu_ticks"] = {10: 10 + 5 * index, 11: 20 + 5 * index, 12: 10 + 20 * index}[process["pid"]]
    phases = [
        {"name": name, "monotonic_ns": 1_000_000_000 + index * 250_000_000}
        for index, name in enumerate(("idle", "warmup", "workload", "reload"))
    ]

    result = vm.summarize_samples(samples, "A", phases)

    assert result["service_cpu_seconds"] == pytest.approx(0.3)
    assert result["errors"] == []
    assert result["metadata"]["cpu_seconds"] == pytest.approx(0.1)
    assert result["host_service"]["cpu_seconds"] == pytest.approx(0.2)
    assert result["idle_one_core_percent"] == pytest.approx(30.0)
    assert result["memory"]["metadata_python"]["current"] == {
        "pss_kib": 120,
        "rss_kib": 175,
        "private_dirty_kib": 12,
    }
    assert result["memory"]["loader_overhead"]["current"]["pss_kib"] == 35
    assert result["memory"]["service_total"]["current"]["pss_kib"] == 155
    assert result["memory"]["service_total"]["sampled_peak"]["pss_kib"] == 155


def test_active_unreadable_process_memory_fails_instead_of_becoming_zero(monkeypatch: pytest.MonkeyPatch):
    group = "/system.slice/bench.service"
    identity = {"pid": 271, "starttime": 100, "exe": "/usr/bin/python3"}
    ledger = {
        "collector": {"service_group": group},
        "temp_service": {"cgroup": group, "arm": "A"},
        "phase_events": [],
    }
    monkeypatch.setattr(vm, "_cpu_usage_usec", lambda _group: 1000)
    monkeypatch.setattr(vm, "_identities_for_group", lambda _group: [identity])
    monkeypatch.setattr(vm, "_role_for_process", lambda *_args: "metadata_python")
    monkeypatch.setattr(vm, "_proc_stat", lambda _pid: (100, 1, 10))
    monkeypatch.setattr(vm, "_smaps_memory", lambda _pid: (_ for _ in ()).throw(vm.SafetyError("process memory accounting is unreadable")))

    with pytest.raises(vm.SafetyError, match="unreadable"):
        vm._collector_sample(ledger, None)


@pytest.mark.parametrize("keep_active", [False, True])
def test_collector_skips_a_gone_or_reused_pid_but_keeps_active_processes(monkeypatch: pytest.MonkeyPatch, keep_active: bool):
    group = "/system.slice/bench.service"
    identities = [
        {"pid": 271, "starttime": 100, "exe": "/usr/bin/python3"},
        {"pid": 272, "starttime": 200, "exe": "/usr/bin/python3"},
    ]
    if keep_active:
        identities.append({"pid": 273, "starttime": 300, "exe": "/usr/bin/python3"})
    ledger = {
        "collector": {"service_group": group},
        "temp_service": {"cgroup": group, "arm": "A"},
        "phase_events": [],
    }
    calls = {identity["pid"]: 0 for identity in identities}
    monkeypatch.setattr(vm, "_cpu_usage_usec", lambda _group: 1000)
    monkeypatch.setattr(vm, "_identities_for_group", lambda _group: identities)
    monkeypatch.setattr(vm, "_role_for_process", lambda *_args: "metadata_python")

    def proc_stat(pid: int):
        calls[pid] += 1
        if pid == 271:
            return None
        if pid == 272:
            return (201 if calls[pid] > 1 else 200, 1, 10)
        return (300, 1, 10)

    monkeypatch.setattr(vm, "_proc_stat", proc_stat)
    monkeypatch.setattr(vm, "_smaps_memory", lambda _pid: {"pss_kib": 1, "rss_kib": 2, "private_dirty_kib": 1})

    sample, _cpu = vm._collector_sample(ledger, None)

    assert [(process["pid"], process["starttime"]) for process in sample["processes"]] == ([(273, 300)] if keep_active else [])


def test_watchdog_expiry_records_intent_before_recovery(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    ledger_path = tmp_path / "ledger.json"
    monkeypatch.setattr(vm, "_ledger_lock", lambda *_args, **_kwargs: contextlib.nullcontext())
    writes: list[dict[str, Any]] = []
    monkeypatch.setattr(vm, "_write_ledger", lambda ledger: writes.append(json.loads(json.dumps(ledger))))
    monkeypatch.setattr(vm, "_load_ledger", lambda *_args: {
        "watchdog": {"state": "armed", "last_heartbeat_ns": 10, "timeout_seconds": 5},
        "recovery": {"state": "pending"},
    })
    recovered: list[tuple[Path, bool]] = []

    def recover(path: Path, from_watchdog: bool):
        assert writes[-1]["recovery"]["state"] == "running"
        recovered.append((path, from_watchdog))
        return {"ok": True}

    assert vm._watchdog_cycle(ledger_path, now_ns=5_000_000_009, recover=recover) == "waiting"
    assert writes == [] and recovered == []
    assert vm._watchdog_cycle(ledger_path, now_ns=5_000_000_010, recover=recover) == "recovered"
    assert recovered == [(ledger_path, True)]


def test_recovery_does_not_hold_ledger_lock_during_slow_undo(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    path = tmp_path / "ledger.json"
    lock = threading.Lock()
    entered_slow_undo = threading.Event()
    release_slow_undo = threading.Event()
    heartbeat_finished = threading.Event()
    store = {
        "watchdog": {"unit": None, "state": "armed", "timeout_seconds": 30, "last_heartbeat_ns": 1, "helper_path": None},
        "recovery": {"state": "pending", "conflicts": [], "verification": {}, "started_ns": None, "completed_ns": None},
        "collector": {"unit": None, "state": "stopped"},
        "temp_service": None,
        "undo_entries": [],
        "test_scope": True,
        "user_name": "deck",
        "snapshot": {},
    }

    @contextlib.contextmanager
    def ledger_lock(_path):
        lock.acquire()
        try:
            yield
        finally:
            lock.release()

    monkeypatch.setattr(vm, "_ledger_lock", ledger_lock)
    monkeypatch.setattr(vm, "_load_ledger", lambda *_args: json.loads(json.dumps(store)))
    monkeypatch.setattr(vm, "_write_ledger", lambda ledger: store.update(json.loads(json.dumps(ledger))))
    monkeypatch.setattr(vm, "_account", lambda _name: SimpleNamespace(pw_uid=1000, pw_name="deck"))
    monkeypatch.setattr(vm, "_verified_user_bus", lambda _account: {"XDG_RUNTIME_DIR": "/run/user/1000"})

    def slow_undo(_ledger, _path, _conflicts, *, only_kind=None):
        entered_slow_undo.set()
        assert release_slow_undo.wait(2)

    monkeypatch.setattr(vm, "_undo_actions", slow_undo)
    result: list[dict[str, Any]] = []
    recovery_thread = threading.Thread(target=lambda: result.append(vm._recover_ledger(path)))
    recovery_thread.start()
    assert entered_slow_undo.wait(2)

    def heartbeat():
        vm._mutate_ledger(path, lambda ledger: ledger["watchdog"].update({"last_heartbeat_ns": 2}))
        heartbeat_finished.set()

    heartbeat_thread = threading.Thread(target=heartbeat)
    heartbeat_thread.start()
    assert heartbeat_finished.wait(0.5), "heartbeat was serialized behind recovery's slow work"
    release_slow_undo.set()
    recovery_thread.join(2)
    heartbeat_thread.join(2)
    assert not recovery_thread.is_alive() and not heartbeat_thread.is_alive()
    assert result[0]["ok"] is True


def test_conditional_undo_preserves_a_change_during_backup_read(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    target = tmp_path / "probe.bin"
    backup = tmp_path / "original.bin"
    target.write_bytes(b"task replacement")
    target.chmod(0o600)
    backup.write_bytes(b"original")
    backup.chmod(0o600)
    entry = _test_file_entry(target, backup, b"original", b"task replacement")
    read_bytes = Path.read_bytes

    def concurrent_edit(path: Path):
        data = read_bytes(path)
        if path == backup:
            target.write_bytes(b"user's later edit")
        return data

    monkeypatch.setattr(Path, "read_bytes", concurrent_edit)
    assert vm._guarded_restore_file(entry, path_override=target, backup_root=tmp_path) == "conflict"
    assert target.read_bytes() == b"user's later edit"
    assert {path.name for path in tmp_path.iterdir()} == {"probe.bin", "original.bin"}


def test_removed_cgroup_is_drained_but_unreadable_cgroup_is_not(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    missing = tmp_path / "removed-cgroup"
    monkeypatch.setattr(vm, "_cgroup_directory", lambda _group: missing)
    assert vm._pids_in_cgroup("/system.slice/stopped.service") == []

    def denied(_directory, **kwargs):
        kwargs["onerror"](PermissionError(13, "permission denied"))
        return iter(())

    monkeypatch.setattr(vm.os, "walk", denied)
    with pytest.raises(vm.SafetyError):
        vm._pids_in_cgroup("/system.slice/unreadable.service")


def test_recovery_does_not_restart_a_service_stopped_by_the_user(monkeypatch: pytest.MonkeyPatch):
    states = {"system": False, "user": False}
    snapshot = {
        "units": {
            "system": _service_snapshot("system", vm.UPSTREAM_SYSTEM_UNIT, False),
            "user": _service_snapshot("user", vm.USER_LOADER_UNIT, True),
        },
        "cef_forwarder": _service_snapshot("system", vm.CEF_FORWARDER_UNIT, False),
        "cef_forwarder_socket": _service_snapshot("system", vm.CEF_FORWARDER_SOCKET, False),
    }
    monkeypatch.setattr(vm, "_account", lambda _name: SimpleNamespace(pw_name="deck"))
    monkeypatch.setattr(vm, "_systemd_unit_active", lambda scope, _unit, _account: states[scope])

    def change_activation(scope, args):
        if args[0] == "start":
            states[scope] = True
        return subprocess.CompletedProcess(args, 0, b"", b"")

    monkeypatch.setattr(vm, "_system_command", lambda args, **_kwargs: change_activation("system", args))
    monkeypatch.setattr(vm, "_user_command", lambda _account, args, **_kwargs: change_activation("user", args))
    monkeypatch.setattr(vm, "_known_unit_snapshot", lambda _scope, unit, _account: snapshot["cef_forwarder" if unit == vm.CEF_FORWARDER_UNIT else "cef_forwarder_socket"])
    conflicts: list[str] = []
    result = vm._restart_original_services({"user_name": "deck", "snapshot": snapshot, "undo_entries": []}, conflicts)
    assert states == {"system": False, "user": False}
    assert result["user"] is False and conflicts


@pytest.mark.parametrize("change", ["process", "command", "activation"])
def test_pause_preserves_a_changed_original_service(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, change: str):
    saved = {
        **_service_snapshot("user", vm.USER_LOADER_UNIT, True),
        "exec_start": "{ path=/loader ; argv[]=/loader ; start_time=old ; pid=271 }",
        "cgroup": "/user.slice/loader.service", "identities": [{"pid": 271, "starttime": 100}],
    }
    current = json.loads(json.dumps(saved))
    if change == "process":
        current["identities"][0]["starttime"] = 101
    elif change == "command":
        current["exec_start"] = "{ path=/different-loader ; argv[]=/different-loader ; start_time=old ; pid=271 }"
    active = [change != "activation"]
    ledger = {"user_name": "deck", "snapshot": {"units": {"user": saved}}, "undo_entries": []}
    monkeypatch.setattr(vm, "_account", lambda _name: SimpleNamespace(pw_name="deck"))
    monkeypatch.setattr(vm, "_systemd_unit_active", lambda *_args: active[0])
    monkeypatch.setattr(vm, "_known_unit_snapshot", lambda *_args: current)
    monkeypatch.setattr(vm, "_append_undo", lambda _path, entry: ledger["undo_entries"].append(entry))

    def stop(*_args, **_kwargs):
        active[0] = False
        return {"drained": True}

    monkeypatch.setattr(vm, "_drain_unit", stop)
    with pytest.raises(vm.SafetyError):
        vm._pause_original_services(tmp_path / "ledger.json", ledger)
    assert active[0] is (change != "activation")
    assert ledger["undo_entries"] == []


def test_recovery_fences_an_inflight_mutation(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    target = tmp_path / "probe.bin"
    target.write_bytes(b"original")
    path = tmp_path / "ledger.json"
    ledger = {"recovery": {"state": "pending"}}
    entered_mutation = threading.Event()
    release_mutation = threading.Event()
    attempted_recovery = threading.Event()
    entered_recovery = threading.Event()
    failures: list[BaseException] = []
    monkeypatch.setenv("TMPDIR", str(tmp_path.parent))
    monkeypatch.setattr(vm, "_account", lambda _name: SimpleNamespace(pw_uid=os.getuid(), pw_gid=os.getgid(), pw_name="deck"))
    monkeypatch.setattr(vm, "_load_ledger", lambda *_args: ledger)

    def mutation(_path, _payload):
        entered_mutation.set()
        assert release_mutation.wait(5)
        target.write_bytes(b"task replacement")
        return {"ok": True}

    def recovery(_path, _from_watchdog):
        entered_recovery.set()
        target.write_bytes(b"original")
        ledger["recovery"]["state"] = "recovered"
        return {"ok": True}

    def operate():
        try:
            vm._dispatch("downloads", path, {"archive": "rust"})
        except BaseException as error:
            failures.append(error)

    def recover():
        attempted_recovery.set()
        try:
            vm._recover_ledger(path)
        except BaseException as error:
            failures.append(error)

    monkeypatch.setattr(vm, "_downloads", mutation)
    monkeypatch.setattr(vm, "_recover_ledger_serialized", recovery)
    operation = threading.Thread(target=operate)
    operation.start()
    assert entered_mutation.wait(5)
    recovery_thread = threading.Thread(target=recover)
    recovery_thread.start()
    try:
        assert attempted_recovery.wait(5)
        assert not entered_recovery.wait(0.2)
    finally:
        release_mutation.set()
        operation.join(5)
        recovery_thread.join(5)
    assert not operation.is_alive() and not recovery_thread.is_alive()
    assert not failures
    assert ledger["recovery"]["state"] == "recovered"
    assert target.read_bytes() == b"original"


def test_native_name_undo_preserves_a_rename_between_probe_and_setter(monkeypatch: pytest.MonkeyPatch):
    state: dict[str, Any] = {}
    monkeypatch.setattr(vm, "_native_shortcut_probe", lambda _appid: {"native": True, "current": "Applied", "sortAs": "sort"})
    script = """
const entry = { appid: 42, app_type: 1073741824, display_name: "User's later name", sort_as: "sort" };
global.appStore = { allApps: [entry] };
global.SteamClient = { Apps: { SetShortcutName(id, name) {
  if (id !== entry.appid) throw new Error("wrong shortcut");
  entry.display_name = name;
} } };
Promise.resolve(eval(process.argv[1])).then(result => {
  process.stdout.write(JSON.stringify({ result, name: entry.display_name }));
}).catch(error => { console.error(error); process.exitCode = 1; });
"""

    def evaluate(expression: str):
        completed = subprocess.run(["node", "-e", script, expression], capture_output=True, text=True, check=True, timeout=10)
        state.update(json.loads(completed.stdout))
        return state["result"]

    monkeypatch.setattr(vm, "_cdp_eval", evaluate)
    entry = {"app_id": 42, "original_name": "Original", "original_sort": "sort", "applied_name": "Applied"}
    assert vm._restore_shortcut(entry) == "conflict"
    assert state["name"] == "User's later name"


def test_collector_tolerates_wakeup_latency_and_keeps_its_final_boundary(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    evidence = tmp_path / "evidence"
    evidence.mkdir()
    samples_path = evidence / "samples.jsonl"
    ledger = {"run_root": str(tmp_path), "collector": {"unit": "owned-collector.service", "path": str(samples_path), "state": "running"}}
    clock = [1_000_000_000]
    observed_cpu: list[int] = []

    def load(*_args):
        if len(observed_cpu) == 2:
            ledger["collector"]["state"] = "stopping"
        return ledger

    def sample(_ledger, previous):
        clock[0] += 1_000_000
        cpu = (len(observed_cpu) + 1) * 100
        observed_cpu.append(cpu)
        return {"monotonic_ns": clock[0], "cpu_delta": None if previous is None else cpu - previous}, cpu

    def sleep(seconds: float):
        clock[0] += int(seconds * 1_000_000_000) + 1_000_000

    monkeypatch.setattr(vm, "_load_ledger", load)
    monkeypatch.setattr(vm, "_collector_sample", sample)
    monkeypatch.setattr(vm, "_mutate_ledger", lambda _path, change: change(ledger) or ledger)
    monkeypatch.setattr(vm, "time", SimpleNamespace(monotonic_ns=lambda: clock[0], sleep=sleep))
    assert vm._collector_loop(tmp_path / "ledger.json") == 0
    records = [json.loads(line) for line in samples_path.read_text().splitlines()]
    assert [record["cpu_delta"] for record in records] == [None, 100, 100]
    assert all(left["monotonic_ns"] < right["monotonic_ns"] for left, right in zip(records, records[1:]))
    assert ledger["collector"]["exit_status"] == 0 and ledger["collector"]["exit_error"] is None


def test_service_fingerprint_preserves_symlink_selection_and_masks(tmp_path: Path):
    first = tmp_path / "first.service"
    second = tmp_path / "second.service"
    first.write_text("[Service]\nExecStart=/usr/bin/true\n")
    second.write_bytes(first.read_bytes())
    selected = tmp_path / "selected.service"
    selected.symlink_to(first.name)
    original = vm._unit_file_fingerprint(selected)
    selected.unlink()
    selected.symlink_to(second.name)
    assert vm._unit_file_fingerprint(selected) != original
    before_edit = vm._unit_file_fingerprint(selected)
    second.write_text("[Service]\nExecStart=/usr/bin/false\n")
    assert vm._unit_file_fingerprint(selected) != before_edit
    selected.unlink()
    selected.symlink_to("/dev/null")
    masked = vm._unit_file_fingerprint(selected)
    assert vm._unit_file_fingerprint(selected) == masked
    assert masked != before_edit


def test_completed_phase_windows_exclude_control_gaps(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(vm.os, "sysconf", lambda _name: 100)
    samples = [
        {
            "monotonic_ns": index * 1_000_000_000,
            "service_cpu_delta_usec": None if index == 0 else 100_000,
            "errors": [],
            "processes": [
                {"pid": pid, "starttime": pid, "role": role, "cpu_ticks": index, "pss_kib": 10, "rss_kib": 20, "private_dirty_kib": 5}
                for pid, role in ((10, "metadata_python"), (11, "loader_overhead"))
            ],
        }
        for index in range(9)
    ]
    phases = [
        event
        for name, start in (("idle", 1), ("warmup", 4), ("workload", 7))
        for event in (
            {"name": name, "monotonic_ns": start * 1_000_000_000},
            {"name": None, "monotonic_ns": (start + 1) * 1_000_000_000},
        )
    ]
    result = vm.summarize_samples(samples, "A", phases)
    assert result["errors"] == []
    assert result["service_cpu_seconds"] == pytest.approx(0.8)
    for name in ("idle", "warmup", "workload"):
        assert result["phase_totals"][name]["wall_seconds"] == pytest.approx(1)
        assert result["phase_totals"][name]["service_cpu_seconds"] == pytest.approx(0.1)


def test_recovery_cannot_be_rearmed_after_lease_revocation():
    ledger = {"watchdog": {"state": "installing"}, "recovery": {"state": "running"}}
    with pytest.raises(vm.SafetyError):
        vm._mark_watchdog_armed(ledger)
    assert ledger["watchdog"]["state"] == "installing"


def test_old_collector_exit_cannot_overwrite_the_next_trial(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    samples_path = tmp_path / "evidence" / "old.jsonl"
    samples_path.parent.mkdir()
    old = {"run_root": str(tmp_path), "collector": {"unit": "old.service", "path": str(samples_path), "state": "stopping"}}
    current = {"collector": {"unit": "new.service", "path": str(samples_path.with_name("new.jsonl")), "state": "running", "exit_status": None, "exit_error": None}}
    monkeypatch.setattr(vm, "_load_ledger", lambda *_args: old)
    monkeypatch.setattr(vm, "_collector_sample", lambda *_args: ({"monotonic_ns": 1}, 0))
    monkeypatch.setattr(vm, "_mutate_ledger", lambda _path, change: change(current) or current)
    assert vm._collector_loop(tmp_path / "ledger.json") == 0
    assert current["collector"]["state"] == "running"
    assert current["collector"]["exit_status"] is None and current["collector"]["exit_error"] is None


def _shortcut_fixture_entry(app_id: int | None = 3000000000) -> dict[str, Any]:
    return {
        "app_id": app_id, "original_ids": [2500000000],
        "name": "Metadata-Rust-listed-0123456789abcdef",
        "exe": "/var/tmp/run/native-fixtures/Metadata-Rust-listed-0123456789abcdef",
    }


def _shortcut_fixture_row(**changes: Any) -> dict[str, Any]:
    entry = _shortcut_fixture_entry()
    return {
        "app_id": entry["app_id"], "name": entry["name"], "launch_options": "",
        "exe": '"' + entry["exe"] + '"', "start_dir": "/var/tmp/run/native-fixtures/", "running": False,
        **changes,
    }


@pytest.mark.parametrize("app_id", [None, 3000000000])
def test_temporary_shortcut_cleanup_waits_for_creation_publication(app_id):
    entry = _shortcut_fixture_entry(app_id)
    row = _shortcut_fixture_row()
    assert vm._fixture_removal_target(entry, []) == ("pending", None)
    assert vm._fixture_removal_target(entry, [row]) == ("remove", row)


@pytest.mark.parametrize("change", [
    {"name": "User kept this shortcut"}, {"exe": "/usr/bin/other"},
    {"start_dir": "/home/deck"}, {"launch_options": "--user-options"},
    {"running": True},
])
def test_temporary_shortcut_cleanup_preserves_independent_changes(change):
    assert vm._fixture_removal_target(_shortcut_fixture_entry(), [_shortcut_fixture_row(**change)]) == ("conflict", None)


def test_temporary_shortcut_cleanup_never_selects_preexisting_or_ambiguous_entries():
    entry = _shortcut_fixture_entry(None)
    original = _shortcut_fixture_row(app_id=2500000000)
    unrelated = _shortcut_fixture_row(app_id=3100000000, name="User shortcut", exe="/usr/bin/other")
    assert vm._fixture_removal_target(entry, [original]) == ("pending", None)
    assert vm._fixture_removal_target(entry, [unrelated]) == ("conflict", None)
    assert vm._fixture_removal_target(entry, [_shortcut_fixture_row(), _shortcut_fixture_row(app_id=3100000000)]) == ("conflict", None)


@pytest.mark.parametrize("app_id", [None, 3000000000])
def test_unpublished_shortcut_never_counts_as_successful_recovery(monkeypatch, app_id):
    monkeypatch.setattr(vm, "_native_fixture_rows", lambda: [])
    monkeypatch.setattr(vm, "_wait_until", lambda predicate, *_: predicate())
    assert vm._remove_shortcut_fixture(_shortcut_fixture_entry(app_id)) == "failed"


@pytest.mark.parametrize("before,after", [(False, True), (True, False)])
def test_cef_proxy_activity_can_change_under_unchanged_active_socket(before, after):
    saved = _service_snapshot("system", vm.CEF_FORWARDER_UNIT, before)
    current = _service_snapshot("system", vm.CEF_FORWARDER_UNIT, after)
    socket = _service_snapshot("system", vm.CEF_FORWARDER_SOCKET, True)
    assert vm._cef_recovery_matches(saved, current, socket, socket) == (True, True)


@pytest.mark.parametrize("change", ["activation", "definition", "proxy_failure", "proxy_definition"])
def test_cef_policy_recovery_rejects_independent_changes(change):
    saved = _service_snapshot("system", vm.CEF_FORWARDER_UNIT, False)
    current = _service_snapshot("system", vm.CEF_FORWARDER_UNIT, True)
    socket = _service_snapshot("system", vm.CEF_FORWARDER_SOCKET, True)
    current_socket = dict(socket)
    if change == "activation":
        current_socket.update(active=False, active_state="inactive")
    elif change == "definition":
        current_socket["fragment_sha256"] = "a" * 64
    elif change == "proxy_failure":
        current.update(active=False, active_state="failed")
    else:
        current["fragment_sha256"] = "a" * 64
    assert vm._cef_recovery_matches(saved, current, socket, current_socket)[1] is False
