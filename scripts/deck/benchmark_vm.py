#!/usr/bin/env python3
"""Private VM authority for the Decky Metadata Loader benchmark.

The host helper sends one JSON object on stdin. This script owns the VM ledger,
short-lived Loader units, watchdog, guarded undo, authenticated readiness, and
external process/cgroup sampling. It never prints authentication or user data.
"""
from __future__ import annotations

import argparse
import contextlib
import errno
import fcntl
import hashlib
import json
import os
import pwd
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable, Iterator, Mapping, Sequence


UPSTREAM_RUNTIME_SHA256 = "c2cf316a53e1c1d318c6dda8821c827e5db275922987f9097956d7a1576e8258"
FORK_RUNTIME_SHA256 = "548f4d4c4ed66ca83b8fcd6a660c29b62ce97b996729ad75bd4668de115e231a"
FORK_SOURCE_COMMIT = "fa0b26aeb2fd85e92688b8c72396b10176e2cde0"
FORK_SOURCE_BASELINE = {
    "tag": "v3.3.0",
    "commit": "67196adfa9b299f20dfb0cc932e88a169417b7d5",
    "backend_tree": "6de1145f79df698a456915212a16d0b8c201aeb6",
    "frontend_tree": "e05a98c68e9446f187df3c69cf8fcf2dc865e3c8",
}
UPSTREAM_SYSTEM_UNIT = "plugin_loader.service"
USER_LOADER_UNIT = "plugin_loader.service"
CEF_FORWARDER_UNIT = "steam-web-debug-portforward.service"
CEF_FORWARDER_SOCKET = "steam-web-debug-portforward.socket"
LEDGER_SCHEMA_VERSION = 2
PLUGIN_NAME = "Decky Metadata"
PLUGIN_DIR_NAME = "Decky-Metadata"
DOWNLOAD_NAME = "Decky-Metadata.zip"
PORT = 1337
START_TIMEOUT_SECONDS = 120.0
RELOAD_TIMEOUT_SECONDS = 120.0
READY_POLL_SECONDS = 0.010
COLLECTOR_INTERVAL_SECONDS = 0.2
MAX_LEDGER_BYTES = 8 * 1024 * 1024
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_SAMPLE_BYTES = 64 * 1024 * 1024
MAX_ARCHIVE_FILES = 4096
_SHA_RE = re.compile(r"^[0-9a-f]{64}$")
_RUN_ID_RE = re.compile(r"^[0-9a-f]{16,32}$")
_SAFE_LABEL_RE = re.compile(r"^[ABC]-(?:100|1000)-[1-5]$")
_SAFE_PLUGIN_PATH_RE = re.compile(r"^[A-Za-z0-9._-]+$")
_BACKEND_READY_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})\s+\S+\s+\[decky:load\]\s+backend ready(?:\s|$)"
)


class SafetyError(RuntimeError):
    """An expected safety/authority failure suitable for a terse stderr line."""


class LedgerLockBusy(SafetyError):
    """A watchdog cycle must retry rather than wait behind a live ledger writer."""


class FileStateChanged(SafetyError):
    """A concurrent file change must survive conditional undo."""


def _fail(message: str) -> None:
    raise SafetyError(message)


def _no_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            _fail("duplicate JSON object key")
        result[key] = value
    return result


def parse_json_object(raw: bytes, *, limit: int = 1024 * 1024) -> dict[str, Any]:
    if len(raw) > limit:
        _fail("JSON input is too large")
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_no_duplicate_keys,
            parse_constant=lambda _: _fail("non-finite JSON number"),
        )
    except (UnicodeError, json.JSONDecodeError):
        _fail("stdin must contain one valid UTF-8 JSON object")
    if not isinstance(value, dict):
        _fail("stdin must contain one JSON object")
    return value


def exact_keys(value: Mapping[str, Any], required: Iterable[str], *, context: str) -> None:
    if set(value) != set(required):
        _fail(f"invalid {context} fields")


def is_plain_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _absolute_path(value: Any, *, label: str) -> Path:
    if not isinstance(value, str) or not value or "\x00" in value:
        _fail(f"{label} must be an absolute path")
    path = Path(value)
    if not path.is_absolute() or ".." in path.parts:
        _fail(f"{label} must be an absolute path without traversal")
    return path


def resolved(path: Path, *, strict: bool = True) -> Path:
    try:
        return path.resolve(strict=strict)
    except (OSError, RuntimeError):
        _fail("path cannot be resolved safely")


def require_contained(path: Path, root: Path, *, label: str, allow_equal: bool = False) -> Path:
    if not path.is_absolute() or ".." in path.parts:
        _fail(f"{label} must be an absolute path without traversal")
    parent = resolved(root, strict=True)
    lexical = Path(os.path.normpath(str(path)))
    if lexical == parent and allow_equal:
        return parent
    if parent not in lexical.parents:
        _fail(f"{label} must be lexically inside the private run directory")
    _reject_symlink_components(lexical, parent)
    candidate = resolved(path, strict=False)
    if candidate == parent or parent not in candidate.parents:
        _fail(f"{label} must resolve strictly inside the private run directory")
    return candidate


def _reject_symlink_components(path: Path, root: Path) -> None:
    """Reject symlinks in an action path even when their target stays contained."""
    current = root
    try:
        relative = path.relative_to(root)
    except ValueError:
        _fail("path escaped its private root")
    for component in relative.parts:
        current = current / component
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            continue
        except OSError:
            _fail("path cannot be inspected safely")
        if stat.S_ISLNK(mode):
            _fail("symlink paths are not allowed for benchmark mutations")


def _temp_base() -> Path:
    raw = os.environ.get("TMPDIR") or "/var/tmp/omp-1000"
    base = _absolute_path(raw, label="TMPDIR")
    base = resolved(base, strict=True)
    if not base.is_dir() or base == Path(base.anchor):
        _fail("temporary base must be an existing non-root directory")
    return base


def _validate_run_root(run_root: Path, user_uid: int) -> Path:
    if not run_root.is_absolute() or ".." in run_root.parts:
        _fail("run directory must be an absolute path without traversal")
    base = _temp_base()
    lexical = Path(os.path.normpath(str(run_root)))
    if lexical == base or base not in lexical.parents:
        _fail("run directory must be strictly below the temporary base")
    _reject_symlink_components(lexical, base)
    root = resolved(run_root, strict=True)
    if root == base or base not in root.parents:
        _fail("run directory must resolve strictly below the temporary base")
    info = root.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != user_uid or stat.S_IMODE(info.st_mode) & 0o077:
        _fail("run directory must be a private directory owned by the benchmark user")
    return root


def _validate_private_dir(path: Path, owner: int) -> None:
    if not path.parent.exists():
        _validate_private_dir(path.parent, owner)
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        pass
    else:
        if os.geteuid() == 0:
            os.chown(path, owner, pwd.getpwuid(owner).pw_gid, follow_symlinks=False)
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        _fail("private directory is not a real directory")
    if info.st_uid != owner:
        _fail("private directory has an unexpected owner")
    if stat.S_IMODE(info.st_mode) != 0o700:
        os.chmod(path, 0o700)
    if path.stat().st_uid != owner:
        _fail("private directory ownership changed")


def assert_scratch_isolated(run_root: Path, scratch: Path, normal: Path) -> tuple[Path, Path, Path]:
    """Enforce private-root containment and disjoint scratch/normal ancestry."""
    root = resolved(run_root, strict=True)
    if not scratch.is_absolute() or ".." in scratch.parts:
        _fail("scratch homebrew must be an absolute path without traversal")
    scratch_lexical = Path(os.path.normpath(str(scratch)))
    if root == scratch_lexical or root not in scratch_lexical.parents:
        _fail("scratch homebrew must be strictly below the unique run directory")
    _reject_symlink_components(scratch_lexical, root)
    scratch_real = resolved(scratch, strict=False)
    normal_real = resolved(normal, strict=True)
    if scratch_real == root or root not in scratch_real.parents:
        _fail("scratch homebrew must resolve strictly below the unique run directory")
    if scratch_real == normal_real or scratch_real in normal_real.parents or normal_real in scratch_real.parents:
        _fail("scratch and normal homebrew must not be equal or ancestors in either direction")
    return root, scratch_real, normal_real


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path, *, max_bytes: int | None = None) -> str:
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except OSError:
        _fail("required artifact is not a readable regular file")
    digest = hashlib.sha256()
    size = 0
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            _fail("required artifact is not a regular file")
        if max_bytes is not None and before.st_size > max_bytes:
            _fail("artifact exceeds the allowed size")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            while chunk := stream.read(1024 * 1024):
                size += len(chunk)
                if max_bytes is not None and size > max_bytes:
                    _fail("artifact exceeds the allowed size")
                digest.update(chunk)
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
        ) or size != before.st_size:
            _fail("artifact changed while being verified")
    finally:
        os.close(fd)
    return digest.hexdigest()


def _safe_regular(path: Path, *, executable: bool = False) -> os.stat_result:
    try:
        info = path.lstat()
    except OSError:
        _fail("required artifact is missing")
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        _fail("artifact must be a non-symlink regular file")
    if executable and not (info.st_mode & 0o111):
        _fail("runtime artifact is not executable")
    return info


def _elf_x86_64(path: Path) -> bool:
    try:
        with path.open("rb") as stream:
            header = stream.read(20)
    except OSError:
        return False
    return len(header) == 20 and header[:4] == b"\x7fELF" and header[4] == 2 and header[5] == 1 and int.from_bytes(header[18:20], "little") == 62


def _root_unit_prefix(unit_prefix: Any) -> tuple[str, str]:
    if not isinstance(unit_prefix, str):
        _fail("invalid transient unit prefix")
    match = re.fullmatch(r"decky-metadata-benchmark-([0-9a-f]{16,32})", unit_prefix)
    if not match:
        _fail("transient unit prefix is outside the benchmark namespace")
    return unit_prefix, match.group(1)


def _valid_unit_name(value: Any, prefix: str, suffixes: Sequence[str]) -> str:
    if not isinstance(value, str) or value not in {f"{prefix}-{suffix}.service" for suffix in suffixes}:
        _fail("ledger contains an unapproved systemd unit name")
    return value


def _command(
    argv: Sequence[str],
    *,
    timeout: float = 20.0,
    env: Mapping[str, str] | None = None,
    input_bytes: bytes | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[bytes]:
    try:
        result = subprocess.run(
            list(argv), input=input_bytes, capture_output=True, timeout=timeout,
            env=None if env is None else dict(env), check=False,
        )
    except subprocess.TimeoutExpired:
        _fail("required local authority command timed out")
    except OSError:
        _fail("required local authority command is unavailable")
    if check and result.returncode:
        _fail(f"required local authority command failed ({result.returncode})")
    return result


def _decode_output(data: bytes) -> str:
    return data.decode("utf-8", "replace").strip()


def _account(user_name: str) -> pwd.struct_passwd:
    if user_name != "deck":
        _fail("only the verified deck account is supported")
    try:
        account = pwd.getpwnam(user_name)
    except KeyError:
        _fail("benchmark user account is unavailable")
    if account.pw_uid <= 0 or account.pw_dir != "/home/deck":
        _fail("benchmark user account has an unexpected identity")
    return account


def _verified_user_bus(account: pwd.struct_passwd) -> dict[str, str]:
    runtime = Path(f"/run/user/{account.pw_uid}")
    bus = runtime / "bus"
    try:
        runtime_stat = runtime.lstat()
        bus_stat = bus.lstat()
    except OSError:
        _fail("verified deck user service bus is unavailable")
    if not stat.S_ISDIR(runtime_stat.st_mode) or runtime_stat.st_uid != account.pw_uid or stat.S_IMODE(runtime_stat.st_mode) & 0o077:
        _fail("deck runtime directory is not private and owned by deck")
    if not stat.S_ISSOCK(bus_stat.st_mode) or bus_stat.st_uid != account.pw_uid:
        _fail("deck user service bus is not a socket owned by deck")
    return {
        "HOME": account.pw_dir,
        "USER": account.pw_name,
        "LOGNAME": account.pw_name,
        "XDG_RUNTIME_DIR": str(runtime),
        "DBUS_SESSION_BUS_ADDRESS": f"unix:path={bus}",
        "PATH": "/usr/local/bin:/usr/bin:/bin",
    }


def _require_root_authority() -> None:
    if os.geteuid() == 0:
        return
    _command(["sudo", "-n", "true"], timeout=5)


def _user_command(account: pwd.struct_passwd, args: Sequence[str], *, timeout: float = 20.0, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    env = _verified_user_bus(account)
    prefix = ["systemctl", "--user"]
    if os.geteuid() == account.pw_uid:
        result = _command(prefix + list(args), timeout=timeout, env=env, check=check)
    else:
        argv = ["sudo", "-n", "-u", account.pw_name, "env"] + [f"{key}={value}" for key, value in env.items()] + prefix + list(args)
        result = _command(argv, timeout=timeout, check=check)
    return result


def _system_command(args: Sequence[str], *, timeout: float = 20.0, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    if os.geteuid() == 0:
        return _command(["systemctl"] + list(args), timeout=timeout, check=check)
    return _command(["sudo", "-n", "systemctl"] + list(args), timeout=timeout, check=check)


def _systemd_run(scope: str, account: pwd.struct_passwd, args: Sequence[str], *, timeout: float = 20.0) -> subprocess.CompletedProcess[bytes]:
    if scope == "system":
        prefix = ["systemd-run", "--system"]
        argv = prefix + list(args)
        if os.geteuid() != 0:
            argv = ["sudo", "-n"] + argv
        return _command(argv, timeout=timeout)
    if scope != "user":
        _fail("invalid systemd scope")
    env = _verified_user_bus(account)
    base = ["systemd-run", "--user"] + list(args)
    if os.geteuid() == account.pw_uid:
        return _command(base, timeout=timeout, env=env)
    argv = ["sudo", "-n", "-u", account.pw_name, "env"] + [f"{key}={value}" for key, value in env.items()] + base
    return _command(argv, timeout=timeout)


def _parse_properties(raw: bytes) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in _decode_output(raw).splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            result[key] = value
    return result


def _show_unit(scope: str, unit: str, account: pwd.struct_passwd) -> dict[str, str]:
    if scope == "system":
        result = _system_command(["show", unit, "--property=Id,LoadState,ActiveState,SubState,UnitFileState,FragmentPath,ControlGroup,MainPID,ExecStart"], check=False)
    else:
        result = _user_command(account, ["show", unit, "--property=Id,LoadState,ActiveState,SubState,UnitFileState,FragmentPath,ControlGroup,MainPID,ExecStart"], check=False)
    return _parse_properties(result.stdout)


def _unit_enabled(scope: str, unit: str, account: pwd.struct_passwd) -> str:
    if scope == "system":
        result = _system_command(["is-enabled", unit], check=False)
    else:
        result = _user_command(account, ["is-enabled", unit], check=False)
    return _decode_output(result.stdout) or "unknown"


def _systemd_unit_active(scope: str, unit: str, account: pwd.struct_passwd) -> bool:
    props = _show_unit(scope, unit, account)
    return props.get("ActiveState") == "active"


def _systemd_control_group(scope: str, unit: str, account: pwd.struct_passwd) -> str:
    props = _show_unit(scope, unit, account)
    group = props.get("ControlGroup", "")
    if not group:
        return ""
    if not group.startswith("/") or ".." in Path(group).parts or "\x00" in group:
        _fail("systemd returned an unsafe cgroup identity")
    return group


def _cgroup_directory(group: str) -> Path:
    root = Path("/sys/fs/cgroup").resolve()
    candidate = root / group.lstrip("/")
    real = resolved(candidate, strict=False)
    if real != candidate:
        _fail("cgroup path contains a symlink alias")
    if real != root and root not in real.parents:
        _fail("cgroup path escaped the system cgroup root")
    return real


def _proc_stat(pid: int) -> tuple[int, int, int] | None:
    """Return (starttime ticks, parent PID, total CPU ticks), tolerating a dead PID."""
    try:
        data = Path(f"/proc/{pid}/stat").read_text(encoding="ascii")
    except (FileNotFoundError, ProcessLookupError):
        return None
    except OSError:
        _fail("process identity is unreadable")
    closing = data.rfind(")")
    if closing < 0:
        _fail("process stat record is malformed")
    fields = data[closing + 2 :].split()
    if len(fields) < 20:
        _fail("process stat record is incomplete")
    try:
        ppid = int(fields[1])
        cpu_ticks = int(fields[11]) + int(fields[12])
        start_ticks = int(fields[19])
    except ValueError:
        _fail("process stat identity is malformed")
    return start_ticks, ppid, cpu_ticks


def pid_starttime(pid: int) -> int | None:
    current = _proc_stat(pid)
    return None if current is None else current[0]


def _proc_uptime_ticks() -> int:
    try:
        fields = Path("/proc/uptime").read_text(encoding="ascii").split()
        clock_ticks = os.sysconf("SC_CLK_TCK")
        if not fields or not re.fullmatch(r"\d+(?:\.\d+)?", fields[0]) or not is_plain_int(clock_ticks) or clock_ticks <= 0:
            _fail("collector start process-clock boundary is unreadable")
        return int(float(fields[0]) * clock_ticks)
    except OSError:
        _fail("collector start process-clock boundary is unreadable")


def _proc_cgroup(pid: int) -> str | None:
    try:
        lines = Path(f"/proc/{pid}/cgroup").read_text(encoding="ascii").splitlines()
    except (FileNotFoundError, ProcessLookupError):
        return None
    except OSError:
        _fail("process cgroup identity is unreadable")
    for line in lines:
        hierarchy, _, group = line.partition(":")
        if hierarchy == "0":
            _, _, group = group.partition(":")
            return group
    return None


def _pids_in_cgroup(group: str) -> list[int]:
    if not group:
        return []
    directory = _cgroup_directory(group)
    pids: set[int] = set()

    def walk_error(error: OSError) -> None:
        if error.errno != errno.ENOENT:
            _fail("service cgroup hierarchy is unreadable")

    for base, dirs, _files in os.walk(directory, topdown=True, followlinks=False, onerror=walk_error):
        current = Path(base)
        if current.is_symlink():
            _fail("service cgroup hierarchy contains a symlink")
        for name in dirs:
            if (current / name).is_symlink():
                _fail("service cgroup hierarchy contains a symlink")
        try:
            values = (current / "cgroup.procs").read_text(encoding="ascii").split()
        except FileNotFoundError:
            continue
        except OSError:
            _fail("service cgroup process list is unreadable")
        for value in values:
            if not value.isdecimal() or int(value) <= 0:
                _fail("service cgroup contains an invalid PID")
            pids.add(int(value))
    return sorted(pids)


def _process_identity(pid: int, group: str = "") -> dict[str, Any] | None:
    data = _proc_stat(pid)
    if data is None:
        return None
    start, ppid, cpu_ticks = data
    try:
        exe = os.readlink(f"/proc/{pid}/exe")
    except (FileNotFoundError, ProcessLookupError):
        return None
    except OSError:
        exe = "unreadable"
    try:
        cmd = Path(f"/proc/{pid}/cmdline").read_bytes()
    except (FileNotFoundError, ProcessLookupError):
        return None
    except OSError:
        cmd = b""
    current_group = _proc_cgroup(pid)
    return {
        "pid": pid,
        "starttime": start,
        "ppid": ppid,
        "exe": exe,
        "cmdline_sha256": _sha256_bytes(cmd),
        "cpu_ticks": cpu_ticks,
        "cgroup": current_group,
        "captured_group": group,
    }


def _identities_for_group(group: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for pid in _pids_in_cgroup(group):
        identity = _process_identity(pid, group)
        if identity is None:
            continue
        current_group = identity["cgroup"]
        if current_group != group and not (current_group or "").startswith(group.rstrip("/") + "/"):
            _fail("service cgroup PID changed ownership during inspection")
        result.append(identity)
    return result


def _same_process(identity: Mapping[str, Any]) -> bool:
    pid, start = identity.get("pid"), identity.get("starttime")
    return is_plain_int(pid) and is_plain_int(start) and pid_starttime(pid) == start


def _process_in_cgroup(pid: int, group: str) -> bool:
    current = _proc_cgroup(pid)
    return current is not None and (current == group or current.startswith(group.rstrip("/") + "/"))


def _signal_captured(identities: Sequence[Mapping[str, Any]], group: str, sig: int) -> list[int]:
    signaled: list[int] = []
    for identity in identities:
        pid = identity.get("pid")
        if not _same_process(identity) or not is_plain_int(pid) or not _process_in_cgroup(pid, group):
            continue
        try:
            os.kill(pid, sig)
            signaled.append(pid)
        except ProcessLookupError:
            pass
        except PermissionError:
            _fail("cannot signal a verified service process")
    return signaled


def _wait_until(predicate: Callable[[], bool], timeout: float, interval: float = 0.05, *, clock: Callable[[], float] = time.monotonic, sleep: Callable[[float], None] = time.sleep) -> bool:
    deadline = clock() + timeout
    while True:
        if predicate():
            return True
        remaining = deadline - clock()
        if remaining <= 0:
            return False
        sleep(min(interval, remaining))


def _service_drained(scope: str, unit: str, group: str, identities: Sequence[Mapping[str, Any]], account: pwd.struct_passwd) -> bool:
    if any(_same_process(identity) for identity in identities):
        return False
    if _pids_in_cgroup(group):
        return False
    props = _show_unit(scope, unit, account)
    return props.get("ActiveState", "inactive") != "active"


def _drain_unit(
    scope: str,
    unit: str,
    account: pwd.struct_passwd,
    *,
    group: str | None = None,
    captured: Sequence[Mapping[str, Any]] | None = None,
    timeout: float = 20.0,
) -> dict[str, Any]:
    if scope not in {"system", "user"}:
        _fail("invalid service scope")
    current_group = group if group is not None else _systemd_control_group(scope, unit, account)
    identities = list(captured) if captured is not None else _identities_for_group(current_group)
    if scope == "system":
        stop = _system_command(["stop", unit], timeout=timeout, check=False)
    else:
        stop = _user_command(account, ["stop", unit], timeout=timeout, check=False)
    # Upstream's pinned unit uses KillMode=process. Stop its known cgroup members
    # as well, without ever signaling a PID whose start time or ancestry changed.
    if not _wait_until(lambda: _service_drained(scope, unit, current_group, identities, account), min(timeout, 15.0)):
        _signal_captured(identities, current_group, signal.SIGTERM)
        if not _wait_until(lambda: _service_drained(scope, unit, current_group, identities, account), 5.0):
            _signal_captured(identities, current_group, signal.SIGKILL)
    drained = _wait_until(lambda: _service_drained(scope, unit, current_group, identities, account), 5.0)
    if not drained:
        _fail("Loader service cgroup or captured process identities did not drain")
    return {
        "unit": unit,
        "scope": scope,
        "cgroup": current_group,
        "captured_pids": [{"pid": item["pid"], "starttime": item["starttime"]} for item in identities],
        "stop_status": stop.returncode,
        "drained": True,
    }


def _known_unit_snapshot(scope: str, unit: str, account: pwd.struct_passwd) -> dict[str, Any]:
    props = _show_unit(scope, unit, account)
    group = props.get("ControlGroup", "")
    if group and (not group.startswith("/") or ".." in Path(group).parts):
        _fail("systemd returned an unsafe service cgroup")
    identities = _identities_for_group(group) if group else []
    fragment = props.get("FragmentPath", "")
    fragment_hash = None
    if fragment and not (fragment == "/dev/null" and props.get("UnitFileState") in {"masked", "masked-runtime"}):
        fragment_path = _validate_unit_file_path(fragment, scope, unit, account)
        if fragment_path.exists():
            fragment_hash = _unit_file_fingerprint(fragment_path)
    elif fragment == "/dev/null":
        fragment = ""
    return {
        "scope": scope,
        "unit": unit,
        "active": props.get("ActiveState") == "active",
        "active_state": props.get("ActiveState", "unknown"),
        "load_state": props.get("LoadState", "unknown"),
        "sub_state": props.get("SubState", "unknown"),
        "enabled": _unit_enabled(scope, unit, account),
        "exec_start": props.get("ExecStart", ""),
        "fragment_path": fragment,
        "fragment_sha256": fragment_hash,
        "cgroup": group,
        "pids": [{"pid": item["pid"], "starttime": item["starttime"]} for item in identities],
        "identities": identities,
    }


def _unit_definition_matches(current: Mapping[str, Any], saved: Mapping[str, Any]) -> bool:
    if any(current.get(key) != saved.get(key) for key in ("scope", "unit", "enabled", "load_state", "fragment_path", "fragment_sha256")):
        return False
    current_command = re.split(r";\s*start_time=", current.get("exec_start", ""), maxsplit=1)[0].strip()
    saved_command = re.split(r";\s*start_time=", saved.get("exec_start", ""), maxsplit=1)[0].strip()
    return current_command == saved_command


def _cef_recovery_matches(
    saved_service: Mapping[str, Any], current_service: Mapping[str, Any],
    saved_socket: Mapping[str, Any], current_socket: Mapping[str, Any],
) -> tuple[bool, bool]:
    socket_matches = (
        _unit_definition_matches(current_socket, saved_socket)
        and current_socket["active"] == saved_socket["active"]
    )
    service_matches = _unit_definition_matches(current_service, saved_service)
    same_state = current_service["active_state"] == saved_service["active_state"]
    # The socket proxy exits when idle and starts on connections; its policy lives in the socket.
    transient = saved_socket["active"] and {
        saved_service["active_state"], current_service["active_state"]
    }.issubset({"active", "inactive"})
    return socket_matches, socket_matches and service_matches and (same_state or transient)


def _pause_original_services(ledger_path: Path, ledger: Mapping[str, Any]) -> None:
    account = _account(ledger["user_name"])
    for scope, saved in ledger["snapshot"]["units"].items():
        if not saved["active"]:
            continue
        unit = saved["unit"]
        owned_stop = any(entry["kind"] == "normal_unit" and entry["scope"] == scope and entry["unit"] == unit and entry["state"] == "pending" for entry in ledger["undo_entries"])
        if not _systemd_unit_active(scope, unit, account):
            if owned_stop:
                continue
            _fail("original Loader activation changed before the task stopped it")
        current = _known_unit_snapshot(scope, unit, account)
        expected_pids = {(item["pid"], item["starttime"]) for item in saved["identities"]}
        current_pids = {(item["pid"], item["starttime"]) for item in current["identities"]}
        if not _unit_definition_matches(current, saved) or current["cgroup"] != saved["cgroup"] or current_pids != expected_pids:
            _fail("original Loader configuration or process identity changed before stop")
        if not owned_stop:
            _append_undo(ledger_path, {"kind": "normal_unit", "state": "pending", "unit": unit, "scope": scope, "was_active": True, "intent_ns": time.monotonic_ns()})
        _drain_unit(scope, unit, account, group=saved["cgroup"], captured=saved["identities"], timeout=20)


def _validate_unit_file_path(raw: str, scope: str, unit: str, account: pwd.struct_passwd) -> Path:
    path = Path(raw)
    if path.name != unit or not path.is_absolute() or ".." in path.parts:
        _fail("systemd unit file path is outside the expected unit")
    allowed = [Path("/etc/systemd/system"), Path("/usr/lib/systemd/system"), Path("/lib/systemd/system")]
    if scope == "user":
        allowed += [Path(account.pw_dir) / ".config/systemd/user", Path("/usr/lib/systemd/user"), Path("/etc/systemd/user")]
    if path.parent not in allowed:
        _fail("systemd unit file path is outside its trusted directory")
    return path


def _unit_file_fingerprint(path: Path) -> str:
    before = _file_identity(path)
    if not before:
        _fail("recorded service definition is missing")
    link = os.readlink(path) if stat.S_ISLNK(before[5]) else None
    target = resolved(path, strict=True)
    if link is not None and target == Path("/dev/null"):
        payload = b"masked\0" + os.fsencode(link)
    else:
        target_before = _file_identity(target)
        digest = sha256_file(target)
        if target_before != _file_identity(target):
            _fail("service definition changed while being fingerprinted")
        payload = b"linked\0" + os.fsencode(link) + b"\0" + bytes.fromhex(digest) if link is not None else None
    if before != _file_identity(path) or target != resolved(path, strict=True):
        _fail("service definition selection changed while being fingerprinted")
    return _sha256_bytes(payload) if payload is not None else digest


def _port_owners(port: int = PORT) -> list[dict[str, Any]]:
    result = _command(["ss", "-Hltpn", f"sport = :{port}"], timeout=5, check=False)
    owners: list[dict[str, Any]] = []
    text = _decode_output(result.stdout)
    if not text:
        return owners
    for line in text.splitlines():
        pids = re.findall(r"pid=(\d+)", line)
        if not pids:
            _fail("port 1337 has a listener with an unverifiable process owner")
        for raw_pid in pids:
            pid = int(raw_pid)
            identity = _process_identity(pid)
            if identity is None:
                _fail("port 1337 listener identity changed during inspection")
            owners.append({"pid": pid, "starttime": identity["starttime"], "cgroup": identity["cgroup"]})
    return owners


def _ensure_port_free() -> None:
    if _port_owners():
        _fail("port 1337 is already owned by an unverified process")


def _sha_tree(root: Path) -> dict[str, Any]:
    if not root.exists():
        return {"exists": False, "entries": [], "digest": _sha256_bytes(b"missing")}
    info = root.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        _fail("normal homebrew or plugin root is not a real directory")
    entries: list[dict[str, Any]] = []
    total = 0
    for base, dirs, files in os.walk(root, topdown=True, followlinks=False):
        base_path = Path(base)
        if base_path == root:
            dirs[:] = [name for name in dirs if name in {"plugins", "settings", "services"}]
        dirs.sort()
        files.sort()
        for directory in list(dirs):
            path = base_path / directory
            info = path.lstat()
            rel = path.relative_to(root).as_posix()
            if stat.S_ISLNK(info.st_mode):
                entries.append({"path": rel, "type": "symlink", "target_sha256": _sha256_bytes(os.readlink(path).encode()), "mode": stat.S_IMODE(info.st_mode)})
                dirs.remove(directory)
            elif not stat.S_ISDIR(info.st_mode):
                _fail("normal homebrew contains an unexpected directory entry")
        for file_name in files:
            path = base_path / file_name
            info = path.lstat()
            rel = path.relative_to(root).as_posix()
            if stat.S_ISLNK(info.st_mode):
                entries.append({"path": rel, "type": "symlink", "target_sha256": _sha256_bytes(os.readlink(path).encode()), "mode": stat.S_IMODE(info.st_mode)})
                continue
            if not stat.S_ISREG(info.st_mode):
                _fail("normal homebrew contains a non-regular file")
            total += info.st_size
            if total > 2 * 1024 * 1024 * 1024:
                _fail("normal homebrew evidence exceeds the bounded snapshot size")
            entries.append({"path": rel, "type": "file", "sha256": sha256_file(path), "size": info.st_size, "mode": stat.S_IMODE(info.st_mode)})
    entries.sort(key=lambda item: item["path"])
    digest_data = json.dumps(entries, sort_keys=True, separators=(",", ":")).encode()
    return {"exists": True, "entries": entries, "digest": _sha256_bytes(digest_data)}


def _tree_matches(root: Path, snapshot: Mapping[str, Any]) -> bool:
    try:
        current = _sha_tree(root)
    except SafetyError:
        return False
    return current.get("digest") == snapshot.get("digest") and current.get("exists") == snapshot.get("exists")


def _load_json_file(path: Path, *, max_bytes: int = 4 * 1024 * 1024) -> dict[str, Any]:
    try:
        raw = path.read_bytes()
    except OSError:
        _fail("required JSON file is unreadable")
    value = parse_json_object(raw, limit=max_bytes)
    return value


def _normal_settings_dir(normal: Path, identities: Sequence[Mapping[str, Any]]) -> Path:
    expected_plugin = normal / "plugins" / PLUGIN_DIR_NAME
    for identity in identities:
        pid = int(identity["pid"])
        try:
            data = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
        values: dict[str, str] = {}
        for item in data:
            key, sep, value = item.partition(b"=")
            if sep and key in {b"DECKY_PLUGIN_DIR", b"DECKY_PLUGIN_SETTINGS_DIR"}:
                values[key.decode()] = value.decode("utf-8", "strict")
        plugin = Path(values.get("DECKY_PLUGIN_DIR", "")) if values.get("DECKY_PLUGIN_DIR") else None
        settings = Path(values.get("DECKY_PLUGIN_SETTINGS_DIR", "")) if values.get("DECKY_PLUGIN_SETTINGS_DIR") else None
        if plugin and resolved(plugin, strict=False) == resolved(expected_plugin, strict=False) and settings:
            canonical = resolved(settings, strict=False)
            if normal / "settings" in canonical.parents:
                return canonical
    return resolved(normal / "settings" / PLUGIN_DIR_NAME, strict=False)


def _copy_private_tree(source: Path, destination: Path, owner_uid: int) -> None:
    if not source.exists():
        _validate_private_dir(destination, owner_uid)
        return
    source_info = source.lstat()
    if stat.S_ISLNK(source_info.st_mode) or not stat.S_ISDIR(source_info.st_mode):
        _fail("Metadata settings source is not a real directory")
    _validate_private_dir(destination, owner_uid)
    for base, dirs, files in os.walk(source, topdown=True, followlinks=False):
        base_path = Path(base)
        relative = base_path.relative_to(source)
        target_dir = destination / relative
        _validate_private_dir(target_dir, owner_uid)
        for name in dirs:
            src = base_path / name
            if stat.S_ISLNK(src.lstat().st_mode):
                _fail("Metadata settings contain a symlink")
        for name in files:
            src = base_path / name
            info = src.lstat()
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
                _fail("Metadata settings contain an unsafe file")
            data = src.read_bytes()
            target = target_dir / name
            _atomic_write(target, data, mode=0o600, owner=(owner_uid, pwd.getpwuid(owner_uid).pw_gid))


def _file_identity(path: Path) -> tuple[int, ...]:
    try:
        info = path.lstat()
    except FileNotFoundError:
        return ()
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_mode, info.st_uid, info.st_gid)


def _atomic_write(path: Path, data: bytes, *, mode: int = 0o600, owner: tuple[int, int] | None = None, guard_root: Path | None = None, expected_identity: tuple[int, ...] | None = None) -> None:
    if guard_root is not None:
        require_contained(path, guard_root, label="write target")
    parent = path.parent
    if not parent.is_dir() or parent.is_symlink():
        _fail("write parent must be a real directory")
    try:
        old = path.lstat()
    except FileNotFoundError:
        old = None
    except OSError:
        _fail("write target cannot be inspected")
    if old is not None and (stat.S_ISLNK(old.st_mode) or not stat.S_ISREG(old.st_mode)):
        _fail("write target must be a regular file")
    name = f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    temp = parent / name
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(temp, flags, mode)
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
            if owner is not None:
                os.fchown(stream.fileno(), owner[0], owner[1])
        if expected_identity is not None and _file_identity(path) != expected_identity:
            raise FileStateChanged("write target changed before conditional replacement")
        os.replace(temp, path)
        dir_fd = os.open(parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except (OSError, SafetyError) as error:
        with contextlib.suppress(OSError):
            temp.unlink()
        if isinstance(error, SafetyError):
            raise
        _fail("atomic private file write failed")


def _write_ledger(ledger: dict[str, Any]) -> None:
    path = Path(ledger["ledger_path"])
    owner = (int(ledger["user_uid"]), pwd.getpwuid(int(ledger["user_uid"])).pw_gid)
    data = (json.dumps(ledger, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode()
    if len(data) > MAX_LEDGER_BYTES:
        _fail("undo ledger exceeded its bounded size")
    _atomic_write(path, data, mode=0o600, owner=owner, guard_root=Path(ledger["run_root"]))


@contextlib.contextmanager
def _ledger_lock(path: Path, *, blocking: bool = True) -> Iterator[None]:
    account = _account("deck")
    if not path.is_absolute() or path.name not in {"ledger.json", "watchdog-test-ledger.json"}:
        _fail("undo ledger lock path is outside the private run directory")
    _validate_run_root(path.parent, account.pw_uid)
    lock_path = path.with_name(path.name + ".lock")
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    created = False
    try:
        fd = os.open(lock_path, flags | os.O_EXCL, 0o600)
        created = True
    except FileExistsError:
        try:
            fd = os.open(lock_path, flags, 0o600)
        except OSError:
            _fail("undo ledger lock cannot be opened safely")
    except OSError:
        _fail("undo ledger lock cannot be opened safely")
    try:
        if created and os.geteuid() == 0:
            os.fchown(fd, account.pw_uid, account.pw_gid)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != account.pw_uid or stat.S_IMODE(info.st_mode) != 0o600:
            _fail("undo ledger lock has unsafe permissions")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        except BlockingIOError as error:
            raise LedgerLockBusy("undo ledger is busy") from error
        try:
            link_info = lock_path.lstat()
        except OSError:
            _fail("undo ledger lock path changed")
        if stat.S_ISLNK(link_info.st_mode) or (link_info.st_dev, link_info.st_ino) != (info.st_dev, info.st_ino):
            _fail("undo ledger lock path changed")
        yield
    finally:
        with contextlib.suppress(OSError):
            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


@contextlib.contextmanager
def _recovery_lock(path: Path) -> Iterator[None]:
    account = _account("deck")
    if not path.is_absolute() or path.name not in {"ledger.json", "watchdog-test-ledger.json"}:
        _fail("recovery lock path is outside the private run directory")
    _validate_run_root(path.parent, account.pw_uid)
    lock_path = path.with_name(path.name + ".recovery.lock")
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    created = False
    try:
        fd = os.open(lock_path, flags | os.O_EXCL, 0o600)
        created = True
    except FileExistsError:
        try:
            fd = os.open(lock_path, flags, 0o600)
        except OSError:
            _fail("recovery lock cannot be opened safely")
    except OSError:
        _fail("recovery lock cannot be opened safely")
    locked = False
    try:
        if created and os.geteuid() == 0:
            os.fchown(fd, account.pw_uid, account.pw_gid)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != account.pw_uid or stat.S_IMODE(info.st_mode) != 0o600:
            _fail("recovery lock has unsafe permissions")
        fcntl.flock(fd, fcntl.LOCK_EX)
        locked = True
        try:
            link_info = lock_path.lstat()
        except OSError:
            _fail("recovery lock path changed")
        if stat.S_ISLNK(link_info.st_mode) or (link_info.st_dev, link_info.st_ino) != (info.st_dev, info.st_ino):
            _fail("recovery lock path changed")
        yield
    finally:
        if locked:
            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
LEDGER_KEYS = {
    "schema_version", "run_id", "ledger_path", "run_root", "scratch_homebrew", "normal_homebrew",
    "user_name", "user_uid", "unit_prefix", "inputs", "expected", "helper_source", "helper_sha256", "captured_at_ns",
    "snapshot", "arm", "dataset", "install_zip", "temp_service", "watchdog", "collector", "phase_events",
    "undo_entries", "recovery", "test_scope",
}
INPUT_KEYS = {"python_zip", "rust_zip", "upstream_runtime", "fork_runtime"}
EXPECTED_KEYS = {"python_zip_sha256", "rust_zip_sha256", "ui_sha256", "rust_binary_sha256", "python_version", "rust_version"}


def _validate_hash(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _SHA_RE.fullmatch(value):
        _fail(f"invalid {label} digest")
    return value


def _validate_archive_path(name: str) -> tuple[str, bool]:
    if not isinstance(name, str) or not name or "\x00" in name or "\\" in name or "//" in name:
        _fail("archive contains an unsafe member path")
    directory = name.endswith("/")
    parts = name.split("/")[:-1] if directory else name.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        _fail("archive contains path traversal")
    path = PurePosixPath(name)
    if path.is_absolute() or not path.parts or path.parts[0] != PLUGIN_DIR_NAME:
        _fail("archive member is outside the plugin folder")
    return path.as_posix(), directory


def _archive_index(path: Path, expected_archive_sha: str) -> tuple[zipfile.ZipFile, dict[str, zipfile.ZipInfo]]:
    _safe_regular(path)
    if sha256_file(path, max_bytes=MAX_ARCHIVE_BYTES) != expected_archive_sha:
        _fail("staged ZIP digest does not match the captured artifact")
    try:
        archive = zipfile.ZipFile(path, "r")
    except (OSError, zipfile.BadZipFile):
        _fail("staged plugin ZIP is invalid")
    infos = archive.infolist()
    if not infos or len(infos) > MAX_ARCHIVE_FILES:
        archive.close()
        _fail("plugin ZIP has an invalid member count")
    indexed: dict[str, zipfile.ZipInfo] = {}
    total = 0
    for info in infos:
        normalized, directory = _validate_archive_path(info.filename)
        if normalized in indexed:
            archive.close()
            _fail("plugin ZIP contains duplicate member paths")
        mode = (info.external_attr >> 16) & 0xFFFF
        kind = stat.S_IFMT(mode)
        if kind not in {0, stat.S_IFREG, stat.S_IFDIR} or stat.S_ISLNK(mode):
            archive.close()
            _fail("plugin ZIP contains a symlink or special file")
        if directory and kind not in {0, stat.S_IFDIR}:
            archive.close()
            _fail("plugin ZIP directory type is inconsistent")
        if not directory and kind not in {0, stat.S_IFREG}:
            archive.close()
            _fail("plugin ZIP file type is inconsistent")
        total += info.file_size
        if info.file_size < 0 or total > MAX_ARCHIVE_BYTES:
            archive.close()
            _fail("plugin ZIP expands beyond its safety limit")
        if info.flag_bits & 1 or (info.compress_size and info.file_size > info.compress_size * 1000):
            archive.close()
            _fail("plugin ZIP uses an unsafe compression mode")
        indexed[normalized] = info
    required = {f"{PLUGIN_DIR_NAME}/plugin.json", f"{PLUGIN_DIR_NAME}/dist/index.js", f"{PLUGIN_DIR_NAME}/main.py"}
    if not required.issubset(indexed):
        archive.close()
        _fail("plugin ZIP is missing required runtime files")
    return archive, indexed


def _archive_file_hash(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> str:
    digest = hashlib.sha256()
    total = 0
    with archive.open(info, "r") as stream:
        while chunk := stream.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_ARCHIVE_BYTES:
                _fail("plugin ZIP member exceeded its size limit")
            digest.update(chunk)
    if total != info.file_size:
        _fail("plugin ZIP member size changed")
    return digest.hexdigest()


def _zip_metadata(archive: zipfile.ZipFile, index: Mapping[str, zipfile.ZipInfo], expected: Mapping[str, Any], arm: str) -> dict[str, Any]:
    try:
        plugin = json.loads(archive.read(index[f"{PLUGIN_DIR_NAME}/plugin.json"]))
        package = json.loads(archive.read(index[f"{PLUGIN_DIR_NAME}/package.json"])) if f"{PLUGIN_DIR_NAME}/package.json" in index else {}
    except (KeyError, UnicodeError, json.JSONDecodeError, zipfile.BadZipFile):
        _fail("plugin ZIP manifest is invalid")
    if not isinstance(plugin, dict) or plugin.get("name") != PLUGIN_NAME or plugin.get("api_version") != 1:
        _fail("plugin ZIP identity does not match Decky Metadata")
    expected_version = expected["python_version"] if arm == "A" else expected["rust_version"]
    if plugin.get("version") != expected_version:
        _fail("plugin ZIP version does not match the captured arm")
    ui_hash = _archive_file_hash(archive, index[f"{PLUGIN_DIR_NAME}/dist/index.js"])
    if ui_hash != expected["ui_sha256"]:
        _fail("plugin ZIP frontend does not match the pinned UI bundle")
    backend_info = index.get(f"{PLUGIN_DIR_NAME}/bin/backend")
    if arm == "A":
        if backend_info is not None:
            _fail("original Python ZIP unexpectedly contains a native backend")
    else:
        if plugin.get("backend") != "bin/backend" or backend_info is None:
            _fail("Rust ZIP is missing its declared native backend")
        mode = (backend_info.external_attr >> 16) & 0o777
        if mode != 0o755 or _archive_file_hash(archive, backend_info) != expected["rust_binary_sha256"]:
            _fail("Rust ZIP backend digest or executable mode is incorrect")
        if not _elf_bytes_x86_64(archive.read(backend_info)):
            _fail("Rust ZIP backend is not an x86-64 ELF executable")
    return {"version": plugin["version"], "ui_sha256": ui_hash, "package_version": package.get("version")}


def _elf_bytes_x86_64(data: bytes) -> bool:
    return len(data) >= 20 and data[:4] == b"\x7fELF" and data[4] == 2 and data[5] == 1 and int.from_bytes(data[18:20], "little") == 62


def _extract_verified(archive: zipfile.ZipFile, index: Mapping[str, zipfile.ZipInfo], destination: Path, root: Path, owner: tuple[int, int]) -> None:
    require_contained(destination, root, label="plugin extraction root")
    _validate_private_dir(destination, owner[0])
    for name, info in index.items():
        relative = PurePosixPath(name).relative_to(PLUGIN_DIR_NAME)
        target = destination.joinpath(*relative.parts)
        require_contained(target, root, label="archive extraction target")
        if info.is_dir() or name.endswith("/"):
            _validate_private_dir(target, owner[0])
            continue
        _validate_private_dir(target.parent, owner[0])
        _reject_symlink_components(target.parent, root)
        data = archive.read(info)
        mode = (info.external_attr >> 16) & 0o777
        if name == f"{PLUGIN_DIR_NAME}/bin/backend":
            mode = 0o755
        elif mode & 0o111:
            mode = 0o755
        else:
            mode = 0o644
        _atomic_write(target, data, mode=mode, owner=owner, guard_root=root)
    for base, dirs, files in os.walk(destination, topdown=False, followlinks=False):
        os.chmod(base, 0o755)
        for name in dirs:
            path = Path(base) / name
            if path.is_symlink():
                _fail("extracted plugin tree contains a symlink")
            os.chmod(path, 0o755)


def _verify_installed_plugin(root: Path, zip_path: Path, expected: Mapping[str, Any], arm: str) -> dict[str, Any]:
    archive, index = _archive_index(zip_path, expected["python_zip_sha256"] if arm == "A" else expected["rust_zip_sha256"])
    try:
        metadata = _zip_metadata(archive, index, expected, arm)
        installed = root / "plugins" / PLUGIN_DIR_NAME
        require_contained(installed, root, label="installed plugin root")
        if not installed.is_dir() or installed.is_symlink():
            _fail("the expected Metadata plugin is not installed in scratch")
        files: dict[str, str] = {}
        for name, info in index.items():
            if info.is_dir() or name.endswith("/"):
                continue
            relative = PurePosixPath(name).relative_to(PLUGIN_DIR_NAME)
            current = installed.joinpath(*relative.parts)
            require_contained(current, root, label="installed plugin file")
            _safe_regular(current, executable=relative.as_posix() == "bin/backend")
            archive_hash = _archive_file_hash(archive, info)
            if sha256_file(current, max_bytes=MAX_ARCHIVE_BYTES) != archive_hash:
                _fail("installed plugin file differs from its verified ZIP")
            files[relative.as_posix()] = archive_hash
        if arm != "A":
            backend = installed / "bin/backend"
            if stat.S_IMODE(backend.stat().st_mode) != 0o755 or sha256_file(backend) != expected["rust_binary_sha256"] or not _elf_x86_64(backend):
                _fail("installed native backend identity is invalid")
        return {"installed_root": str(installed), "manifest_version": metadata["version"], "files": files, "hashes": {"ui_sha256": metadata["ui_sha256"], "rust_binary_sha256": expected["rust_binary_sha256"] if arm != "A" else None}}
    finally:
        archive.close()


def _runtime_bundle(path: Path) -> dict[str, Any]:
    if not path.is_dir() or path.is_symlink():
        _fail("fork runtime input must be a real bundle directory")
    manifest_path = path / "bundle.json"
    _safe_regular(manifest_path)
    manifest = _load_json_file(manifest_path, max_bytes=4 * 1024 * 1024)
    build = manifest.get("build")
    if (
        manifest.get("kind") != "decky-loader-runtime"
        or not isinstance(build, dict)
        or build.get("base_commit") != FORK_SOURCE_COMMIT
        or manifest.get("source_baseline") != FORK_SOURCE_BASELINE
        or manifest.get("release_version") != "dev"
        or manifest.get("worker_packaging") != "onedir"
    ):
        _fail("fork runtime bundle is not the pinned build")
    executable_name = manifest.get("rust_executable")
    if executable_name != "decky-loader-runtime":
        _fail("fork runtime executable name is not pinned")
    hashes = manifest.get("sha256")
    if not isinstance(hashes, dict) or not hashes:
        _fail("fork runtime bundle has no payload digests")
    expected_paths: set[str] = set()
    for relative, digest in hashes.items():
        if not isinstance(relative, str):
            _fail("fork runtime manifest contains an unsafe payload path")
        _validate_relative_file(relative)
        _validate_hash(digest, "fork runtime payload")
        file_path = path.joinpath(*PurePosixPath(relative).parts)
        require_contained(file_path, path, label="fork runtime payload")
        _safe_regular(file_path, executable=relative in {executable_name, "DeckyPluginWorker"})
        if sha256_file(file_path, max_bytes=MAX_ARCHIVE_BYTES) != digest:
            _fail("fork runtime payload digest mismatch")
        expected_paths.add(relative)
    if not {executable_name, "DeckyPluginWorker"}.issubset(expected_paths):
        _fail("fork runtime bundle is missing its runtime or worker executable")
    actual: set[str] = set()
    for base, dirs, files in os.walk(path, topdown=True, followlinks=False):
        for directory in dirs:
            if (Path(base) / directory).is_symlink():
                _fail("fork runtime bundle contains a symlink")
        for file_name in files:
            file_path = Path(base) / file_name
            if file_path == manifest_path:
                continue
            if file_path.is_symlink() or not file_path.is_file():
                _fail("fork runtime bundle contains an unsafe file")
            actual.add(file_path.relative_to(path).as_posix())
    if actual != expected_paths:
        _fail("fork runtime bundle payload list is incomplete or has extra files")
    executable = path / executable_name
    worker = path / "DeckyPluginWorker"
    if not _elf_x86_64(executable) or not worker.stat().st_mode & 0o111 or not (path / "assets").is_dir() or not (path / "locales").is_dir():
        _fail("fork runtime executable, worker, assets, or locales are incomplete")
    executable_sha = hashes[executable_name]
    if executable_sha != FORK_RUNTIME_SHA256:
        _fail("fork Loader executable does not match the pinned build digest")
    return {"bundle": str(path), "executable": str(executable), "executable_sha256": executable_sha, "manifest_sha256": sha256_file(manifest_path), "files": len(hashes)}


def _validate_relative_file(relative: str) -> None:
    if not relative or "\\" in relative or "\x00" in relative:
        _fail("runtime manifest contains an unsafe path")
    parts = relative.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        _fail("runtime manifest contains path traversal")
    path = PurePosixPath(relative)
    if path.is_absolute():
        _fail("runtime manifest contains path traversal")

def _fixture_path(run_root: Path, dataset: int) -> Path:
    candidates = [run_root / "inputs" / f"fixture-{dataset}.json", run_root / f"fixture-{dataset}.json"]
    existing = [path for path in candidates if path.exists()]
    if len(existing) != 1:
        _fail("exactly one staged deterministic fixture is required")
    return require_contained(existing[0], run_root, label="fixture input")


def _validate_fixture(path: Path, dataset: int) -> dict[str, Any]:
    value = _load_json_file(path, max_bytes=MAX_ARCHIVE_BYTES)
    records = value.get("metadata")
    if not isinstance(records, dict) or len(records) != dataset:
        _fail("staged fixture has the wrong record count")
    if value.get("release_date_format") != "date-only-v1" or not isinstance(value.get("settings"), dict):
        _fail("staged fixture has an invalid storage envelope")
    settings = value["settings"]
    trailers = settings.get("game_trailers", {})
    badges = settings.get("protondb_badges", {})
    updates = value.get("update_settings", {})
    if settings.get("debug_logging") is not False or settings.get("mini_achievements_enabled") is not False:
        _fail("fixture must disable Metadata debug logging and mini-achievements")
    if not isinstance(trailers, dict) or trailers.get("enabled") is not False or trailers.get("homeEnabled") is not False:
        _fail("fixture must disable trailer activity")
    if not isinstance(badges, dict) or badges.get("enabled") is not False:
        _fail("fixture must disable badge activity")
    if not isinstance(updates, dict) or updates.get("automatic_update_checks") is not False:
        _fail("fixture must disable automatic update checks")
    if sorted(records) != [str(i) for i in range(2147483648, 2147483648 + dataset)]:
        _fail("staged fixture key order or IDs are invalid")
    for index in range(dataset):
        key = str(2147483648 + index)
        if records[key] != _fixture_record(index):
            _fail("staged fixture record differs from the deterministic contract")
    return value


def _fixture_record(index: int) -> dict[str, Any]:
    suffix = f"{index:04d}"
    description = "" if index % 4 == 3 else "D" * 512
    return {
        "appid": 2147483648 + index,
        "id": f"benchmark-{suffix}",
        "title": f"Benchmark Fixture {suffix} — Café",
        "source": "Manual",
        "description": description,
        "steam_store_state": "unknown",
        "source_url": "",
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
                "id": f"screenshot-{suffix}-{slot + 1}",
                "url": f"https://images.example.invalid/decky-metadata/shot-{slot + 1}.jpg",
                "caption": f"Fixture {suffix} screenshot {slot + 1}",
                "width": 1920,
                "height": 1080,
            }
            for slot in range(4)
        ],
        "steam_appid": None,
        "steam_store_name": "",
        "steam_dlc_appids": [],
        "has_points_shop": False,
        "steam_store_url": "",
        "steam_news": [
            {
                "id": f"news-{suffix}-{slot + 1}",
                "gid": f"news-{suffix}-{slot + 1}",
                "news_id": f"news-{suffix}-{slot + 1}",
                "announcement_gid": f"news-{suffix}-{slot + 1}",
                "event_gid": f"news-{suffix}-{slot + 1}",
                "event_type": 28,
                "type": 28,
                "title": f"Fixture news {suffix} {slot + 1}",
                "url": f"https://news.example.invalid/decky-metadata/{suffix}/{slot + 1}",
                "summary": "N" * 256,
                "body": "N" * 256,
                "raw_body": "N" * 256,
                "image": "",
                "image_sources": [],
                "author": "Benchmark",
                "feedLabel": "Benchmark",
                "date": 1626048000 + slot,
            }
            for slot in range(6)
        ],
        "steam_news_enriched_at": 1626048000,
        "updated_at": 1626048000,
    }


def _capture_ui() -> dict[str, Any]:
    result = _cdp_eval(
        r"""(() => {
          const trees=window.DFL?.getGamepadNavigationTrees?.();
          const menu=trees?.find(tree=>tree?.id==="QuickAccess-NA")?.m_Root?.m_element?.ownerDocument;
          if(!menu)throw new Error("native Quick Access window unavailable");
          const selected=Array.from(menu.querySelectorAll("[role='tab'][aria-selected='true'][id^='quickaccess_tab_']"));
          const match=selected.length===1&&/^quickaccess_tab_(\d+)$/.exec(selected[0].id);
          if(!match)throw new Error("native Quick Access tab is ambiguous");
          const tab=Number(match[1]);
          if(!Number.isSafeInteger(tab))throw new Error("invalid native Quick Access tab");
          const live=globalThis.SteamUIStore?.RunningApps;
          if(!Array.isArray(live))throw new Error("native running-app state is unavailable");
          const running=live.map(app=>Number(app.appid)).sort((a,b)=>a-b);
          if(running.some(id=>!Number.isSafeInteger(id)||id<=0||id>4294967295))throw new Error("native running-app identity is invalid");
          const route=location.pathname.replace(/^\/routes(?=\/)/,"")+location.search+location.hash;
          return {route,quickAccess:{available:true,open:!menu.hidden,tab},running_apps:running};
        })()"""
    )
    if not isinstance(result, dict) or not isinstance(result.get("route"), str) or not result["route"].startswith("/") or not isinstance(result.get("quickAccess"), dict) or not isinstance(result.get("running_apps"), list):
        _fail("Steam native UI state could not be captured safely")
    return result


def _restore_ui(saved: Mapping[str, Any]) -> dict[str, Any]:
    params = json.dumps({"route": saved.get("route"), "quickAccess": saved.get("quickAccess")}, ensure_ascii=False, separators=(",", ":"))
    expression = """(async()=>{
      const p=PARAMETERS;
      const deadline=performance.now()+30000;
      while(typeof window.DFL?.Navigation?.Navigate!=="function"){
        if(performance.now()>=deadline)throw new Error("native navigation unavailable");
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      const nav=window.DFL.Navigation;
      nav.Navigate(p.route);
      if(p.quickAccess.tab!==null){
        if(!Number.isSafeInteger(p.quickAccess.tab)||typeof nav.OpenQuickAccessMenu!=="function")throw new Error("saved Quick Access tab unavailable");
        nav.OpenQuickAccessMenu(p.quickAccess.tab);
      }
      if(!p.quickAccess.open){
        if(typeof nav.CloseSideMenus!=="function")throw new Error("native menu close unavailable");
        nav.CloseSideMenus();
      }
      return true;
    })()""".replace("PARAMETERS", params)
    _cdp_eval(expression, timeout=35)
    actual: dict[str, Any] = {}
    def restored() -> bool:
        nonlocal actual
        try:
            actual = _capture_ui()
        except SafetyError:
            return False
        return actual["route"] == saved["route"] and actual["quickAccess"] == saved["quickAccess"]
    if not _wait_until(restored, 10):
        _fail("native route or Quick Access tab restore did not match the snapshot")
    return actual


def _reset_steam_ui_context(account: pwd.struct_passwd) -> dict[str, Any]:
    result = _command(["pgrep", "-u", str(account.pw_uid), "-x", "steamwebhelper"], timeout=5, check=False)
    if result.returncode not in {0, 1}:
        _fail("Steam browser process inventory failed")
    identities = []
    for raw in _decode_output(result.stdout).split():
        if not raw.isdecimal():
            _fail("Steam browser process inventory is invalid")
        pid = int(raw)
        identity = _process_identity(pid)
        if identity is None:
            continue
        try:
            owner = Path(f"/proc/{pid}").stat().st_uid
        except FileNotFoundError:
            continue
        if owner != account.pw_uid or Path(identity["exe"]).name != "steamwebhelper" or not identity["cgroup"]:
            _fail("Steam browser process ownership changed")
        identities.append(identity)
    # Destroy old clients before restoring normal Loader RPCs, so queued writes cannot replay.
    for identity in identities:
        _signal_captured([identity], identity["cgroup"], signal.SIGTERM)
    gone = lambda: not any(_same_process(identity) for identity in identities)
    if not _wait_until(gone, 15):
        for identity in identities:
            _signal_captured([identity], identity["cgroup"], signal.SIGKILL)
    if not _wait_until(gone, 5):
        _fail("old Steam browser clients did not stop")
    def ready() -> bool:
        try:
            return _cdp_eval("""(()=>{
                const apps=globalThis.appStore?.allApps;
                const running=globalThis.SteamUIStore?.RunningApps;
                const steamApps=globalThis.SteamClient?.Apps;
                return document.readyState==="complete" && Array.isArray(apps) && apps.length>0
                    && Array.isArray(running)
                    && typeof steamApps?.RegisterForAppDetails==="function"
                    && typeof steamApps?.RemoveShortcut==="function"
                    && typeof steamApps?.SetShortcutName==="function";
            })()""") is True
        except SafetyError:
            return False
    if not _wait_until(ready, 40, 0.2):
        _fail("Steam did not recreate its native JS context")
    return {"old_processes": _safe_identities(identities), "old_processes_gone": True, "shared_js_context_ready": True}


def _cdp_module() -> Any:
    helper = Path(os.environ.get("BENCHMARK_VM_HELPER_DIR", str(Path(__file__).resolve().parent)))
    if helper.is_symlink() or not (helper / "cdp.py").is_file() or not (helper / "temp_paths.py").is_file():
        _fail("existing CDP transport helpers are not staged beside benchmark_vm.py")
    source = str(helper.resolve())
    if source not in sys.path:
        sys.path.insert(0, source)
    try:
        import cdp  # type: ignore[import-not-found]
    except Exception:
        _fail("existing CDP transport helpers could not be loaded")
    return cdp


def _cdp_eval(expression: str, *, timeout: float = 15.0) -> Any:
    cdp = _cdp_module()
    cdp.HOST = "127.0.0.1"
    cdp.PORT = int(os.environ.get("BENCHMARK_VM_STEAM_CDP_PORT", "8080"))
    try:
        result = cdp.evaluate("SharedJSContext", expression, timeout=timeout)
    except (Exception, SystemExit):
        _fail("Steam native UI probe failed")
    if not isinstance(result, dict) or "value" not in result:
        _fail("Steam native UI probe returned no serialized value")
    return result["value"]


def _plugin_log_path(scratch: Path) -> Path:
    return scratch / "logs" / PLUGIN_DIR_NAME / "decky-metadata.log"


def _backend_log_candidates(path: Path) -> tuple[Path, ...]:
    return (path, *(path.with_name(f"{path.name}.{number}") for number in range(1, 4)))


def _backend_log_cursor(path: Path) -> dict[str, Any]:
    offsets: dict[tuple[int, int], int] = {}
    anchors: dict[tuple[int, int], tuple[int, bytes]] = {}
    for candidate in _backend_log_candidates(path):
        try:
            info = candidate.lstat()
        except FileNotFoundError:
            continue
        except OSError:
            _fail("scratch plugin log cannot be inspected")
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
            _fail("scratch plugin log is not a regular file")
        try:
            fd = os.open(candidate, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
        except OSError:
            _fail("scratch plugin log cannot be inspected")
        with os.fdopen(fd, "rb") as stream:
            current = os.fstat(stream.fileno())
            if not stat.S_ISREG(current.st_mode):
                _fail("scratch plugin log is not a regular file")
            key = (current.st_dev, current.st_ino)
            offsets[key] = current.st_size
            start = max(0, current.st_size - 64)
            stream.seek(start)
            anchors[key] = (start, stream.read(current.st_size - start))
    return {"offsets": offsets, "anchors": anchors, "pending": {}}


def _backend_ready_timestamp_ns(line: bytes) -> int | None:
    match = _BACKEND_READY_RE.match(line.decode("utf-8", "replace").rstrip("\r\n"))
    if not match:
        return None
    try:
        stamp = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S,%f")
    except ValueError:
        return None
    return int(stamp.timestamp()) * 1_000_000_000 + stamp.microsecond * 1_000


def _backend_ready_after(cursor: dict[str, Any], path: Path) -> int | None:
    offsets = cursor["offsets"]
    anchors = cursor["anchors"]
    pending = cursor["pending"]
    ready_times: list[int] = []
    for candidate in _backend_log_candidates(path):
        try:
            fd = os.open(candidate, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
        except FileNotFoundError:
            continue
        except OSError:
            _fail("scratch plugin log cannot be read")
        try:
            with os.fdopen(fd, "rb") as stream:
                fd = -1
                info = os.fstat(stream.fileno())
                if not stat.S_ISREG(info.st_mode):
                    _fail("scratch plugin log is not a regular file")
                key = (info.st_dev, info.st_ino)
                offset = offsets.get(key, 0)
                if info.st_size < offset:
                    offset = 0
                    pending.pop(key, None)
                else:
                    anchor = anchors.get(key)
                    if anchor is not None:
                        anchor_start, expected = anchor
                        stream.seek(anchor_start)
                        if stream.read(len(expected)) != expected:
                            offset = 0
                            pending.pop(key, None)
                stream.seek(offset)
                data = stream.read()
                offset = stream.tell()
                offsets[key] = offset
                anchor_start = max(0, offset - 64)
                stream.seek(anchor_start)
                anchors[key] = (anchor_start, stream.read(offset - anchor_start))
                buffered = pending.pop(key, b"") + data
                lines = buffered.splitlines(keepends=True)
                if lines and not lines[-1].endswith(b"\n"):
                    pending[key] = lines.pop()
                for line in lines:
                    timestamp_ns = _backend_ready_timestamp_ns(line)
                    if timestamp_ns is not None:
                        ready_times.append(timestamp_ns)
        finally:
            if fd >= 0:
                os.close(fd)
    return min(ready_times) if ready_times else None


def _loader_http_ready(timeout: float = 3.0) -> bool:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(f"http://127.0.0.1:{PORT}/auth/token", timeout=timeout) as response:
            return response.status == 200
    except urllib.error.HTTPError:
        return False
    except OSError:
        return False


def _loader_frontend_request(
    route: str, args: Sequence[str], *, timeout: float = 15.0, record_start: bool = False,
) -> Any:
    if route == "loader/reload_plugin" and list(args) == [PLUGIN_NAME] and record_start:
        pass
    elif route == "loader/call_plugin_method" and list(args) == [PLUGIN_NAME, "get_plugin_version"] and not record_start:
        pass
    else:
        _fail("unapproved frontend Loader route or arguments")
    call = "window.DeckyBackend.call(" + ", ".join(
        [json.dumps(route), *(json.dumps(argument) for argument in args)]
    ) + ")"
    if record_start:
        expression = f"(async()=>{{const started=Date.now();await {call};return started;}})()"
    else:
        expression = f"(async()=>await {call})()"
    return _cdp_eval(expression, timeout=timeout)


def _loader_process_identities(group: str, executable: Path) -> list[dict[str, Any]]:
    expected = resolved(executable, strict=True)
    return [
        identity for identity in _identities_for_group(group)
        if identity.get("exe") != "unreadable"
        and resolved(Path(str(identity["exe"]).removesuffix(" (deleted)")), strict=False) == expected
    ]


def _loader_frontend_version(timeout: float = 3.0) -> str | None:
    result = _loader_frontend_request(
        "loader/call_plugin_method", [PLUGIN_NAME, "get_plugin_version"], timeout=timeout,
    )
    return result if isinstance(result, str) else None


def _loader_frontend_reload(timeout: float = 10.0) -> int:
    result = _loader_frontend_request(
        "loader/reload_plugin", [PLUGIN_NAME], timeout=timeout, record_start=True,
    )
    if not is_plain_int(result) or result <= 0:
        _fail("Steam frontend reload did not return its page start time")
    return result


def _validate_ledger(ledger: Any, requested: Path | None = None) -> dict[str, Any]:
    if not isinstance(ledger, dict) or set(ledger) != LEDGER_KEYS or ledger.get("schema_version") != LEDGER_SCHEMA_VERSION:
        _fail("undo ledger schema is invalid")
    if not is_plain_int(ledger.get("user_uid")) or ledger.get("user_uid") <= 0 or ledger.get("user_name") != "deck":
        _fail("undo ledger user identity is invalid")
    account = _account(ledger["user_name"])
    if ledger["user_uid"] != account.pw_uid:
        _fail("undo ledger user identity changed")
    run_id = ledger.get("run_id")
    if not isinstance(run_id, str) or not _RUN_ID_RE.fullmatch(run_id):
        _fail("undo ledger run identity is invalid")
    prefix, prefix_id = _root_unit_prefix(ledger.get("unit_prefix"))
    if prefix_id != run_id:
        _fail("undo ledger unit namespace does not match its run identity")
    run_root = _absolute_path(ledger.get("run_root"), label="ledger run root")
    canonical_root = _validate_run_root(run_root, account.pw_uid)
    ledger_path = _absolute_path(ledger.get("ledger_path"), label="ledger path")
    canonical_ledger = resolved(ledger_path, strict=True)
    if canonical_ledger.parent != canonical_root or canonical_ledger.name not in {"ledger.json", "watchdog-test-ledger.json"}:
        _fail("undo ledger path is outside its private run directory")
    if requested is not None and resolved(requested, strict=True) != canonical_ledger:
        _fail("requested ledger does not match its recorded identity")
    info = canonical_ledger.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != account.pw_uid:
        _fail("undo ledger must be a user-owned regular file with mode 0600")
    if not isinstance(ledger.get("captured_at_ns"), int) or not is_plain_int(ledger.get("captured_at_ns")) or ledger["captured_at_ns"] <= 0:
        _fail("undo ledger capture time is invalid")
    scratch = _absolute_path(ledger.get("scratch_homebrew"), label="scratch homebrew")
    normal = _absolute_path(ledger.get("normal_homebrew"), label="normal homebrew")
    _, scratch_real, normal_real = assert_scratch_isolated(canonical_root, scratch, normal)
    if scratch_real != resolved(scratch, strict=False) or normal_real != resolved(normal, strict=True):
        _fail("undo ledger paths are not canonical")
    inputs = ledger.get("inputs")
    exact_keys(inputs, INPUT_KEYS, context="ledger input")
    for name, value in inputs.items():
        path = _absolute_path(value, label=f"{name} input")
        require_contained(path, canonical_root, label=f"{name} input")
    expected = ledger.get("expected")
    exact_keys(expected, EXPECTED_KEYS, context="ledger expectation")
    for key in {"python_zip_sha256", "rust_zip_sha256", "ui_sha256", "rust_binary_sha256"}:
        _validate_hash(expected[key], key)
    for key in {"python_version", "rust_version"}:
        if not isinstance(expected[key], str) or not expected[key] or len(expected[key]) > 128 or any(ch in expected[key] for ch in "\r\n\x00"):
            _fail("undo ledger version identity is invalid")
    helper_source = _absolute_path(ledger.get("helper_source"), label="helper source")
    require_contained(helper_source, canonical_root, label="helper source")
    if helper_source.name != "benchmark_vm.py" or helper_source.parent != canonical_root / "tools":
        _fail("benchmark helper must live under run_root/tools")
    helper_hash = _validate_hash(ledger.get("helper_sha256"), "benchmark helper")
    current_helper = Path(__file__).resolve()
    if current_helper == helper_source:
        if not helper_source.is_file() or sha256_file(helper_source) != helper_hash:
            _fail("staged benchmark helper changed after capture")
    elif current_helper != Path("/run/decky-metadata-benchmark") / run_id / "benchmark_vm.py" or os.geteuid() != 0 or sha256_file(current_helper) != helper_hash:
        _fail("executing benchmark helper is not the immutable root watchdog copy")
    for sibling in ("cdp.py", "temp_paths.py"):
        dependency = helper_source.parent / sibling
        require_contained(dependency, canonical_root, label="CDP helper dependency")
        if not dependency.is_file() or dependency.is_symlink():
            _fail("existing CDP helper dependencies are not staged")
    test_scope = ledger.get("test_scope")
    if not isinstance(test_scope, bool):
        _fail("undo ledger recovery scope is invalid")
    snapshot = ledger.get("snapshot")
    if not isinstance(snapshot, dict):
        _fail("undo ledger snapshot is invalid")
    if test_scope:
        if snapshot:
            _fail("watchdog fixture ledger must not contain normal-state snapshots")
    else:
        _validate_snapshot(snapshot, account, normal_real)
    temp = ledger.get("temp_service")
    if temp is not None:
        temp_keys = {"unit", "scope", "cgroup", "identities", "plugin_root", "arm", "started_at_ns"}
        if not isinstance(temp, dict) or set(temp) != temp_keys or temp.get("arm") not in {"A", "B", "C"} or temp.get("arm") != ledger.get("arm"):
            _fail("undo ledger temporary service identity is invalid")
        arm = temp["arm"]
        unit = _valid_unit_name(temp.get("unit"), prefix, [arm.lower()])
        scope = "system" if arm in {"A", "B"} else "user"
        if temp.get("scope") != scope or temp.get("plugin_root") != str(scratch_real / "plugins" / PLUGIN_DIR_NAME):
            _fail("undo ledger temporary service scope or plugin root is invalid")
        group = _validate_cgroup_identity(temp.get("cgroup"), scope, unit, account.pw_uid, allow_empty=False)
        _validate_identity_list(temp.get("identities", []), group)
        if not is_plain_int(temp.get("started_at_ns")) or temp["started_at_ns"] <= 0:
            _fail("undo ledger temporary service start time is invalid")
    watchdog = ledger.get("watchdog")
    if not isinstance(watchdog, dict) or set(watchdog) != {"unit", "state", "timeout_seconds", "last_heartbeat_ns", "helper_path"}:
        _fail("undo ledger watchdog state is invalid")
    if watchdog["unit"] is not None:
        suffix = "watchdog-test-watchdog" if test_scope else "watchdog"
        _valid_unit_name(watchdog["unit"], prefix, [suffix])
        expected_helper = Path("/run/decky-metadata-benchmark") / run_id / "benchmark_vm.py"
        if Path(watchdog["helper_path"]) != expected_helper or watchdog["state"] == "unarmed":
            _fail("undo ledger root helper identity is invalid")
    elif watchdog["helper_path"] is not None or watchdog["state"] not in {"unarmed", "stopped", "failed"}:
        _fail("unarmed watchdog has an unexpected root helper")
    if watchdog["state"] not in {"unarmed", "installing", "armed", "stopped", "failed"}:
        _fail("undo ledger watchdog state is invalid")
    if not is_plain_int(watchdog["timeout_seconds"]) or not 1 <= watchdog["timeout_seconds"] <= 600:
        _fail("undo ledger watchdog timeout is invalid")
    if not is_plain_int(watchdog["last_heartbeat_ns"]) or watchdog["last_heartbeat_ns"] < 0:
        _fail("undo ledger watchdog lease is invalid")
    collector = ledger.get("collector")
    collector_keys = {"unit", "scope", "label", "path", "state", "start_ns", "service_group", "arm", "exit_status", "exit_error"}
    if not isinstance(collector, dict) or set(collector) != collector_keys or collector.get("state") not in {"stopped", "running", "stopping"}:
        _fail("undo ledger collector state is invalid")
    if collector["exit_status"] not in {None, 0, 1} or (collector["exit_error"] is not None and (not isinstance(collector["exit_error"], str) or len(collector["exit_error"]) > 1024 or "\x00" in collector["exit_error"])):
        _fail("undo ledger collector exit status is invalid")
    if collector["unit"] is None:
        if any(collector[key] is not None for key in {"label", "path", "start_ns", "service_group", "arm", "exit_status", "exit_error"}) or collector["state"] != "stopped":
            _fail("empty collector state is inconsistent")
    else:
        label = collector.get("label")
        if not isinstance(label, str) or not _SAFE_LABEL_RE.fullmatch(label):
            _fail("undo ledger collector label is invalid")
        _valid_unit_name(collector["unit"], prefix, ["collector-" + label.lower()])
        if collector.get("scope") != "system" or collector.get("arm") != label[0] or collector.get("arm") != ledger.get("arm"):
            _fail("undo ledger collector unit is invalid")
        if not is_plain_int(collector.get("start_ns")) or collector["start_ns"] <= 0:
            _fail("undo ledger collector start time is invalid")
        if not isinstance(collector.get("service_group"), str) or not collector["service_group"]:
            _fail("undo ledger service cgroup is invalid")
        service_scope = "user" if collector["arm"] == "C" else "system"
        service_unit = prefix + "-" + collector["arm"].lower() + ".service"
        _validate_cgroup_identity(collector["service_group"], service_scope, service_unit, account.pw_uid, allow_empty=False)
        if temp is None:
            if collector["state"] == "running":
                _fail("running collector has no selected Loader")
        elif collector["service_group"] != temp["cgroup"]:
            _fail("collector is not bound to the selected Loader cgroup")
        sample = _absolute_path(collector.get("path"), label="collector samples")
        require_contained(sample, canonical_root / "evidence", label="collector samples")
        if sample.name != f"{label}.jsonl":
            _fail("undo ledger collector path does not match its label")
    if not isinstance(ledger.get("phase_events"), list) or len(ledger["phase_events"]) > 10000:
        _fail("undo ledger phase history is invalid")
    for event in ledger["phase_events"]:
        if not isinstance(event, dict) or set(event) != {"name", "monotonic_ns"} or event["name"] not in {None, "idle", "workload", "warmup", "reload"} or not is_plain_int(event["monotonic_ns"]):
            _fail("undo ledger phase event is invalid")
    undo = ledger.get("undo_entries")
    if not isinstance(undo, list) or len(undo) > 1000:
        _fail("undo ledger entries are invalid")
    for entry in undo:
        _validate_undo_entry(entry, ledger, prefix)
    recovery = ledger.get("recovery")
    if not isinstance(recovery, dict) or set(recovery) != {"state", "conflicts", "verification", "started_ns", "completed_ns"}:
        _fail("undo ledger recovery state is invalid")
    if recovery["state"] not in {"pending", "running", "failed", "recovered"} or not isinstance(recovery["conflicts"], list) or not isinstance(recovery["verification"], dict):
        _fail("undo ledger recovery state is invalid")
    if ledger.get("arm") not in {None, "A", "B", "C"} or ledger.get("dataset") not in {None, 100, 1000} or not isinstance(ledger.get("install_zip"), bool):
        _fail("undo ledger arm state is invalid")
    return ledger


def _validate_cgroup_identity(value: Any, scope: str, unit: str, uid: int, *, allow_empty: bool = True) -> str:
    if not isinstance(value, str) or "\x00" in value or ".." in Path(value).parts:
        _fail("service cgroup identity is invalid")
    if not value:
        if allow_empty:
            return value
        _fail("active service has no verifiable cgroup")
    if scope == "system":
        expected = f"/system.slice/{unit}"
        if value != expected:
            _fail("system service cgroup is outside its exact unit")
    elif scope == "user":
        root = f"/user.slice/user-{uid}.slice/user@{uid}.service/"
        if not value.startswith(root) or not value.endswith("/" + unit) or "/../" in value:
            _fail("user service cgroup is outside its exact user unit")
    else:
        _fail("invalid service cgroup scope")
    return value


def _validate_snapshot(snapshot: Mapping[str, Any], account: pwd.struct_passwd, normal: Path) -> None:
    keys = {"units", "cef_forwarder", "cef_forwarder_socket", "normal_tree", "normal_service_files", "metadata_settings_relative", "ui", "running_apps", "metadata_identities"}
    exact_keys(snapshot, keys, context="normal-state snapshot")
    units = snapshot["units"]
    if not isinstance(units, dict) or set(units) != {"system", "user"}:
        _fail("normal Loader snapshot is invalid")

    def validate_service(item: Any, scope: str, unit: str, label: str) -> None:
        required = {"scope", "unit", "active", "active_state", "load_state", "sub_state", "enabled", "exec_start", "fragment_path", "fragment_sha256", "cgroup", "pids", "identities"}
        if not isinstance(item, dict):
            _fail(f"{label} service snapshot is invalid")
        exact_keys(item, required, context=f"{label} service snapshot")
        if item["scope"] != scope or item["unit"] != unit or not isinstance(item["active"], bool):
            _fail(f"{label} service snapshot contains an unapproved unit")
        for key in {"active_state", "load_state", "sub_state", "enabled", "exec_start", "fragment_path"}:
            if not isinstance(item[key], str) or "\x00" in item[key] or len(item[key]) > 16384:
                _fail(f"{label} service snapshot contains invalid text")
        if item["active"] != (item["active_state"] == "active"):
            _fail(f"{label} service activation snapshot is inconsistent")
        if item["active"] and not item["exec_start"] and unit != CEF_FORWARDER_SOCKET:
            _fail(f"{label} active service has no captured runtime selection")
        _validate_cgroup_identity(item["cgroup"], scope, unit, account.pw_uid, allow_empty=not item["active"] or unit == CEF_FORWARDER_SOCKET)
        _validate_identity_list(item["identities"], item["cgroup"] or None)
        expected_pids = [{"pid": identity["pid"], "starttime": identity["starttime"]} for identity in item["identities"]]
        if item["pids"] != expected_pids:
            _fail(f"{label} service PID snapshot does not match its process identities")
        if item["fragment_path"]:
            _validate_unit_file_path(item["fragment_path"], scope, unit, account)
            _validate_hash(item["fragment_sha256"], f"{label} service file")
        elif item["fragment_sha256"] is not None:
            _fail(f"{label} service file hash has no recorded path")

    for scope, unit in (("system", UPSTREAM_SYSTEM_UNIT), ("user", USER_LOADER_UNIT)):
        validate_service(units[scope], scope, unit, "Loader")
    cef = snapshot["cef_forwarder"]
    validate_service(cef, "system", CEF_FORWARDER_UNIT, "CEF")
    validate_service(snapshot["cef_forwarder_socket"], "system", CEF_FORWARDER_SOCKET, "CEF socket")
    _validate_tree_snapshot(snapshot["normal_tree"])
    services = snapshot["normal_service_files"]
    allowed_services = {
        f"system:{UPSTREAM_SYSTEM_UNIT}": ("system", UPSTREAM_SYSTEM_UNIT),
        f"user:{USER_LOADER_UNIT}": ("user", USER_LOADER_UNIT),
        f"system:{CEF_FORWARDER_UNIT}": ("system", CEF_FORWARDER_UNIT),
        f"system:{CEF_FORWARDER_SOCKET}": ("system", CEF_FORWARDER_SOCKET),
    }
    if not isinstance(services, dict) or not set(services).issubset(allowed_services):
        _fail("normal service file inventory is invalid")
    for key, record in services.items():
        if not isinstance(record, dict) or set(record) != {"scope", "unit", "path", "sha256"}:
            _fail("normal service file record is invalid")
        scope, unit = allowed_services[key]
        if record["scope"] != scope or record["unit"] != unit:
            _fail("normal service file identity does not match its inventory key")
        _validate_unit_file_path(record["path"], scope, unit, account)
        _validate_hash(record["sha256"], "normal service file")
    relative = snapshot["metadata_settings_relative"]
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute() or ".." in Path(relative).parts:
        _fail("Metadata settings source is outside normal homebrew")
    require_contained(normal / relative, normal, label="Metadata settings source")
    ui = snapshot["ui"]
    if not isinstance(ui, dict) or set(ui) != {"route", "quickAccess", "running_apps"} or not isinstance(ui["route"], str) or not ui["route"].startswith("/") or len(ui["route"]) > 4096:
        _fail("Steam UI snapshot is invalid")
    menu = ui["quickAccess"]
    if not isinstance(menu, dict) or set(menu) != {"available", "open", "tab"} or not isinstance(menu["available"], bool) or not isinstance(menu["open"], bool) or (menu["tab"] is not None and (not is_plain_int(menu["tab"]) or menu["tab"] < 0)):
        _fail("Steam menu snapshot is invalid")
    for app_list in (ui["running_apps"], snapshot["running_apps"]):
        if not isinstance(app_list, list) or any(not is_plain_int(app) or app < 0 for app in app_list):
            _fail("running-app snapshot is invalid")
    if sorted(set(ui["running_apps"])) != snapshot["running_apps"]:
        _fail("running-app snapshot does not match the captured UI")
    _validate_identity_list(snapshot["metadata_identities"])


def _validate_tree_snapshot(snapshot: Any) -> None:
    if not isinstance(snapshot, dict) or set(snapshot) != {"exists", "entries", "digest"} or not isinstance(snapshot["exists"], bool):
        _fail("normal homebrew hash snapshot is invalid")
    _validate_hash(snapshot["digest"], "normal homebrew tree")
    entries = snapshot["entries"]
    if not isinstance(entries, list) or len(entries) > 100000:
        _fail("normal homebrew file inventory is invalid")
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            _fail("normal homebrew inventory entry is invalid")
        relative = PurePosixPath(entry["path"])
        if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts) or entry["path"] in seen:
            _fail("normal homebrew inventory path is unsafe")
        seen.add(entry["path"])
        if entry.get("type") == "file":
            if set(entry) != {"path", "type", "sha256", "size", "mode"} or not is_plain_int(entry["size"]) or entry["size"] < 0 or not is_plain_int(entry["mode"]):
                _fail("normal file hash record is invalid")
            _validate_hash(entry["sha256"], "normal file")
        elif entry.get("type") == "symlink":
            if set(entry) != {"path", "type", "target_sha256", "mode"} or not is_plain_int(entry["mode"]):
                _fail("normal symlink record is invalid")
            _validate_hash(entry["target_sha256"], "normal symlink")
        else:
            _fail("normal homebrew inventory contains an unknown entry")


def _validate_identity_list(value: Any, group: str | None = None) -> None:
    if not isinstance(value, list) or len(value) > 10000:
        _fail("ledger process identities are invalid")
    seen: set[tuple[int, int]] = set()
    for item in value:
        if not isinstance(item, dict) or set(item) != {"pid", "starttime", "ppid", "exe", "cmdline_sha256", "cpu_ticks", "cgroup", "captured_group"}:
            _fail("ledger process identity is invalid")
        if not is_plain_int(item["pid"]) or item["pid"] <= 0 or not is_plain_int(item["starttime"]) or item["starttime"] <= 0:
            _fail("ledger process identity is invalid")
        identity = (item["pid"], item["starttime"])
        if identity in seen:
            _fail("ledger contains duplicate PID start times")
        seen.add(identity)
        if not is_plain_int(item["cpu_ticks"]) or item["cpu_ticks"] < 0:
            _fail("ledger process CPU identity is invalid")
        _validate_hash(item["cmdline_sha256"], "process command line")
        for key in {"exe", "cgroup", "captured_group"}:
            if not isinstance(item[key], str) or "\x00" in item[key] or len(item[key]) > 4096:
                _fail("ledger process identity is invalid")
        if group is not None and (item["captured_group"] != group or (item["cgroup"] and item["cgroup"] != group and not item["cgroup"].startswith(group.rstrip("/") + "/"))):
            _fail("ledger PID does not belong to its recorded service cgroup")

def _validate_undo_entry(entry: Any, ledger: Mapping[str, Any], prefix: str) -> None:
    if not isinstance(entry, dict) or not isinstance(entry.get("kind"), str) or not isinstance(entry.get("state"), str):
        _fail("undo ledger contains an invalid action")
    if entry["state"] not in {"pending", "restored", "conflict", "failed"}:
        _fail("undo ledger action state is invalid")
    if entry["kind"] == "downloads":
        exact_keys(entry, {"kind", "state", "path", "backup_path", "original_exists", "original_sha256", "original_mode", "replacement_sha256", "replacement_mode", "intent_ns"}, context="Downloads undo")
        expected = Path(pwd.getpwnam("deck").pw_dir) / "Downloads" / DOWNLOAD_NAME
        path = _absolute_path(entry["path"], label="Downloads undo")
        if path != expected:
            _fail("Downloads undo path is not the fixed task archive")
        if not isinstance(entry["original_exists"], bool) or not is_plain_int(entry["intent_ns"]) or entry["intent_ns"] <= 0:
            _fail("Downloads undo state is invalid")
        if entry["replacement_mode"] != 0o600:
            _fail("Downloads replacement mode is invalid")
        if entry["original_exists"]:
            _validate_hash(entry["original_sha256"], "original Downloads")
            if not is_plain_int(entry["original_mode"]) or entry["original_mode"] & ~0o777:
                _fail("original Downloads mode is invalid")
            backup = _absolute_path(entry["backup_path"], label="Downloads backup")
            require_contained(backup, Path(ledger["run_root"]) / "undo", label="Downloads backup")
            if backup.name != f"downloads-original-{entry['original_sha256']}.bin":
                _fail("Downloads backup name does not match its recorded digest")
        elif entry["original_sha256"] is not None or entry["original_mode"] is not None or entry["backup_path"] is not None:
            _fail("absence undo record has unexpected original data")
        _validate_hash(entry["replacement_sha256"], "replacement Downloads")
    elif entry["kind"] == "shortcut_name":
        exact_keys(entry, {"kind", "state", "app_id", "original_name", "original_sort", "applied_name", "intent_ns"}, context="shortcut undo")
        if not is_plain_int(entry["app_id"]) or not 0 < entry["app_id"] <= 0xFFFFFFFF:
            _fail("shortcut undo app ID is invalid")
        for key in {"original_name", "original_sort", "applied_name"}:
            if not isinstance(entry[key], str) or "\x00" in entry[key] or len(entry[key]) > 1024:
                _fail("shortcut undo name state is invalid")
        if not entry["original_name"] or not entry["applied_name"] or entry["original_name"] == entry["applied_name"] or not is_plain_int(entry["intent_ns"]) or entry["intent_ns"] <= 0:
            _fail("shortcut undo intent is invalid")
    elif entry["kind"] == "shortcut_fixture":
        exact_keys(entry, {"kind", "state", "role", "name", "exe", "app_id", "original_ids", "intent_ns"}, context="temporary shortcut undo")
        role = entry["role"]
        if ledger.get("test_scope") or role not in {"listed", "delisted", "never"}:
            _fail("temporary shortcut role is invalid")
        name = f"Metadata-Rust-{role}-{prefix.rsplit('-', 1)[-1]}"
        if entry["name"] != name or entry["exe"] != str(Path(ledger["run_root"]) / "native-fixtures" / name):
            _fail("temporary shortcut ownership marker is invalid")
        ids = entry["original_ids"]
        if not isinstance(ids, list) or len(ids) > 4096 or any(not is_plain_int(value) or not 0 < value <= 0xFFFFFFFF for value in ids) or len(set(ids)) != len(ids):
            _fail("temporary shortcut original identities are invalid")
        app_id = entry["app_id"]
        if app_id is not None and (not is_plain_int(app_id) or not 0 < app_id <= 0xFFFFFFFF or app_id in ids):
            _fail("temporary shortcut identity is invalid")
        if not is_plain_int(entry["intent_ns"]) or entry["intent_ns"] <= 0:
            _fail("temporary shortcut intent is invalid")
    elif entry["kind"] == "temp_unit":
        exact_keys(entry, {"kind", "state", "unit", "scope", "arm", "cgroup", "identities", "intent_ns"}, context="temporary service undo")
        arm = entry["arm"]
        if arm not in {"A", "B", "C", "test"}:
            _fail("temporary service undo arm is invalid")
        scope = "system" if arm in {"A", "B"} else "user"
        suffix = arm.lower() if arm in {"A", "B", "C"} else "watchdog-test"
        _valid_unit_name(entry["unit"], prefix, [suffix])
        if entry["scope"] != scope or not is_plain_int(entry["intent_ns"]) or entry["intent_ns"] <= 0:
            _fail("temporary service undo identity is invalid")
        group = _validate_cgroup_identity(entry["cgroup"], scope, entry["unit"], int(ledger["user_uid"]), allow_empty=True)
        _validate_identity_list(entry["identities"], group or None)
        if not group and entry["identities"]:
            _fail("temporary service identities have no cgroup")
    elif entry["kind"] == "normal_unit":
        exact_keys(entry, {"kind", "state", "unit", "scope", "was_active", "intent_ns"}, context="normal service undo")
        scope = entry["scope"]
        allowed = {"system": {UPSTREAM_SYSTEM_UNIT, CEF_FORWARDER_UNIT}, "user": {USER_LOADER_UNIT}}
        if scope not in allowed or entry["unit"] not in allowed[scope] or not isinstance(entry["was_active"], bool) or not is_plain_int(entry["intent_ns"]) or entry["intent_ns"] <= 0:
            _fail("normal service undo identity is invalid")
        if ledger.get("test_scope"):
            _fail("normal service undo is not allowed in watchdog tests")
    elif entry["kind"] == "test_file":
        exact_keys(entry, {"kind", "state", "path", "original_exists", "original_sha256", "original_mode", "backup_path", "replacement_sha256", "replacement_mode", "intent_ns"}, context="watchdog test file undo")
        if not ledger.get("test_scope"):
            _fail("test fixture undo entry appears in a real run")
        root = Path(ledger["run_root"]) / "watchdog-test"
        path = _absolute_path(entry["path"], label="watchdog test file")
        if path != root / "probe.bin":
            _fail("watchdog fixture path is not the fixed disposable file")
        require_contained(path, root, label="watchdog test file")
        if not isinstance(entry["original_exists"], bool) or entry["replacement_mode"] != 0o600 or not is_plain_int(entry["intent_ns"]) or entry["intent_ns"] <= 0:
            _fail("watchdog test file undo state is invalid")
        if entry["original_exists"]:
            _validate_hash(entry["original_sha256"], "fixture original")
            _validate_hash(entry["replacement_sha256"], "fixture replacement")
            if not is_plain_int(entry["original_mode"]) or entry["original_mode"] & ~0o777:
                _fail("watchdog test original mode is invalid")
            backup = _absolute_path(entry["backup_path"], label="watchdog test backup")
            if backup != root / "original.bin":
                _fail("watchdog test backup path is not the fixed fixture backup")
            require_contained(backup, root, label="watchdog test backup")
        elif any(entry[key] is not None for key in {"original_sha256", "original_mode", "backup_path"}):
            _fail("watchdog test absence record has unexpected original data")
        _validate_hash(entry["replacement_sha256"], "fixture replacement")
    else:
        _fail("undo ledger contains an unknown action type")


def _load_ledger(path: Path, requested: Path | None = None) -> dict[str, Any]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
    except OSError:
        _fail("undo ledger is unavailable")
    try:
        info = os.fstat(fd)
        account = _account("deck")
        if not stat.S_ISREG(info.st_mode) or info.st_uid != account.pw_uid or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > MAX_LEDGER_BYTES:
            _fail("undo ledger is not a bounded user-owned mode-0600 file")
        with os.fdopen(fd, "rb") as stream:
            fd = -1
            raw = stream.read(MAX_LEDGER_BYTES + 1)
        if len(raw) > MAX_LEDGER_BYTES:
            _fail("undo ledger exceeded its bounded size")
    except OSError:
        _fail("undo ledger is unavailable")
    finally:
        if fd >= 0:
            os.close(fd)
    value = parse_json_object(raw, limit=MAX_LEDGER_BYTES)
    return _validate_ledger(value, requested)


def _mutate_ledger(path: Path, callback: Callable[[dict[str, Any]], None]) -> dict[str, Any]:
    with _ledger_lock(path):
        ledger = _load_ledger(path, path)
        callback(ledger)
        _write_ledger(ledger)
        return ledger


def _new_ledger(path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, {"run_root", "scratch_homebrew", "normal_homebrew", "user_name", "unit_prefix", "inputs", "expected"}, context="capture payload")
    account = _account(payload["user_name"])
    _require_root_authority()
    _verified_user_bus(account)
    run_root = _validate_run_root(_absolute_path(payload["run_root"], label="run root"), account.pw_uid)
    ledger_path = _absolute_path(str(path), label="ledger path")
    if resolved(ledger_path, strict=False) != run_root / "ledger.json":
        _fail("capture ledger must be run_root/ledger.json")
    if ledger_path.exists() or ledger_path.is_symlink():
        _fail("capture refuses an existing ledger")
    scratch = _absolute_path(payload["scratch_homebrew"], label="scratch homebrew")
    normal = _absolute_path(payload["normal_homebrew"], label="normal homebrew")
    _, scratch_real, normal_real = assert_scratch_isolated(run_root, scratch, normal)
    if normal_real != Path("/home/deck/homebrew"):
        _fail("normal homebrew must be the installed deck homebrew")
    if scratch_real != run_root / "scratch-homebrew":
        _fail("scratch homebrew must use the unique run directory's fixed scratch path")
    prefix, run_id = _root_unit_prefix(payload["unit_prefix"])
    inputs = payload["inputs"]
    exact_keys(inputs, INPUT_KEYS, context="capture input")
    input_paths = {key: _absolute_path(value, label=f"{key} input") for key, value in inputs.items()}
    for name, item in input_paths.items():
        require_contained(item, run_root, label=f"{name} input")
    expected = payload["expected"]
    exact_keys(expected, EXPECTED_KEYS, context="capture expectation")
    for name in {"python_zip_sha256", "rust_zip_sha256", "ui_sha256", "rust_binary_sha256"}:
        _validate_hash(expected[name], name)
    for name in {"python_version", "rust_version"}:
        if not isinstance(expected[name], str) or not expected[name] or len(expected[name]) > 128:
            _fail("capture plugin version is invalid")
    if sha256_file(input_paths["upstream_runtime"], max_bytes=512 * 1024 * 1024) != UPSTREAM_RUNTIME_SHA256:
        _fail("upstream runtime does not match the pinned release digest")
    if not _elf_x86_64(input_paths["upstream_runtime"]):
        _fail("upstream Loader is not an x86-64 ELF executable")
    if not _safe_regular(input_paths["upstream_runtime"], executable=True):
        _fail("upstream Loader is not executable")
    archive, python_index = _archive_index(input_paths["python_zip"], expected["python_zip_sha256"])
    try:
        _zip_metadata(archive, python_index, expected, "A")
    finally:
        archive.close()
    archive, rust_index = _archive_index(input_paths["rust_zip"], expected["rust_zip_sha256"])
    try:
        _zip_metadata(archive, rust_index, expected, "B")
    finally:
        archive.close()
    _runtime_bundle(input_paths["fork_runtime"])
    helper_source = Path(__file__).resolve()
    if helper_source != run_root / "tools" / "benchmark_vm.py":
        _fail("benchmark_vm.py must be staged at run_root/tools/benchmark_vm.py")
    for sibling in {"cdp.py", "temp_paths.py"}:
        if not (helper_source.parent / sibling).is_file() or (helper_source.parent / sibling).is_symlink():
            _fail("existing CDP helper dependencies are not staged beside benchmark_vm.py")
    _validate_private_dir(scratch_real, account.pw_uid)
    if any(scratch_real.iterdir()):
        _fail("scratch homebrew must be empty before capture")
    for child in ("plugins", "settings", "services", "data", "logs"):
        _validate_private_dir(scratch_real / child, account.pw_uid)
    ui = _capture_ui()
    system = _known_unit_snapshot("system", UPSTREAM_SYSTEM_UNIT, account)
    user = _known_unit_snapshot("user", USER_LOADER_UNIT, account)
    cef = _known_unit_snapshot("system", CEF_FORWARDER_UNIT, account)
    cef_socket = _known_unit_snapshot("system", CEF_FORWARDER_SOCKET, account)
    active_loader = [item for item in (system, user) if item["active"]]
    if len(active_loader) != 1:
        _fail("capture requires exactly one active original Loader service")
    owners = _port_owners()
    if owners:
        recorded = {(item["pid"], item["starttime"]) for service in active_loader for item in service["identities"]}
        if any((owner["pid"], owner["starttime"]) not in recorded for owner in owners):
            _fail("port 1337 is owned by an unverified process")
    if not (normal_real / "plugins" / PLUGIN_DIR_NAME).is_dir():
        _fail("normal homebrew does not contain the baseline Metadata plugin")
    settings_dir = _normal_settings_dir(normal_real, active_loader[0]["identities"])
    if settings_dir != normal_real and normal_real not in settings_dir.parents:
        _fail("Metadata settings source is outside normal homebrew")
    normal_tree = _sha_tree(normal_real)
    service_files = {}
    for scope, service in (("system", system), ("user", user), ("system", cef), ("system", cef_socket)):
        if service["fragment_path"] and service["fragment_sha256"]:
            service_files[f"{scope}:{service['unit']}"] = {"scope": scope, "unit": service["unit"], "path": service["fragment_path"], "sha256": service["fragment_sha256"]}
    _validate_private_dir(run_root / "undo", account.pw_uid)
    _validate_private_dir(run_root / "evidence", account.pw_uid)
    settings_backup = run_root / "scratch-settings"
    _copy_private_tree(settings_dir, settings_backup, account.pw_uid)
    loader_settings_src = normal_real / "settings" / "loader.json"
    if loader_settings_src.exists():
        loader_settings = _load_json_file(loader_settings_src)
    else:
        loader_settings = {}
    loader_settings["cef_forward"] = bool(cef_socket["active"])
    loader_settings["pluginOrder"] = [PLUGIN_NAME]
    _atomic_write(scratch_real / "settings" / "loader.json", (json.dumps(loader_settings, ensure_ascii=False, indent=2) + "\n").encode(), mode=0o600, owner=(account.pw_uid, account.pw_gid), guard_root=run_root)
    snapshot = {
        "units": {"system": system, "user": user},
        "cef_forwarder": cef,
        "cef_forwarder_socket": cef_socket,
        "normal_tree": normal_tree,
        "normal_service_files": service_files,
        "metadata_settings_relative": settings_dir.relative_to(normal_real).as_posix(),
        "ui": ui,
        "running_apps": sorted(set(ui["running_apps"])),
        "metadata_identities": active_loader[0]["identities"],
    }
    ledger: dict[str, Any] = {
        "schema_version": LEDGER_SCHEMA_VERSION,
        "run_id": run_id,
        "ledger_path": str(ledger_path),
        "run_root": str(run_root),
        "scratch_homebrew": str(scratch_real),
        "normal_homebrew": str(normal_real),
        "user_name": account.pw_name,
        "user_uid": account.pw_uid,
        "unit_prefix": prefix,
        "inputs": {key: str(value) for key, value in input_paths.items()},
        "expected": dict(expected),
        "helper_source": str(helper_source),
        "helper_sha256": sha256_file(helper_source),
        "captured_at_ns": time.monotonic_ns(),
        "snapshot": snapshot,
        "arm": None,
        "dataset": None,
        "install_zip": False,
        "temp_service": None,
        "watchdog": {"unit": None, "state": "unarmed", "timeout_seconds": 30, "last_heartbeat_ns": 0, "helper_path": None},
        "collector": {"unit": None, "scope": "system", "label": None, "path": None, "state": "stopped", "start_ns": None, "service_group": None, "arm": None, "exit_status": None, "exit_error": None},
        "phase_events": [],
        "undo_entries": [],
        "recovery": {"state": "pending", "conflicts": [], "verification": {}, "started_ns": None, "completed_ns": None},
        "test_scope": False,
    }
    _validate_ledger_shape_for_write(ledger)
    _write_ledger(ledger)
    return ledger


def _validate_ledger_shape_for_write(ledger: dict[str, Any]) -> None:
    # Validate invariants before the first durable creation without requiring an
    # on-disk ledger file to exist yet.
    if set(ledger) != LEDGER_KEYS:
        _fail("internal undo ledger shape is invalid")
    if ledger["watchdog"]["state"] != "unarmed":
        _fail("new ledger watchdog must be unarmed")


def _append_undo(path: Path, entry: dict[str, Any]) -> dict[str, Any]:
    def update(ledger: dict[str, Any]) -> None:
        if ledger["recovery"]["state"] != "pending":
            _fail("recovering or recovered run cannot accept new undo actions")
        _validate_undo_entry(entry, ledger, ledger["unit_prefix"])
        if entry["kind"] == "shortcut_name":
            for old in ledger["undo_entries"]:
                if old["kind"] == "shortcut_name" and old["app_id"] == entry["app_id"]:
                    if {key: old[key] for key in ("original_name", "original_sort", "applied_name")} == {key: entry[key] for key in ("original_name", "original_sort", "applied_name")}:
                        return
                    _fail("shortcut undo already exists with different captured state")
        ledger["undo_entries"].append(entry)
    return _mutate_ledger(path, update)


def _write_capture_settings(ledger: Mapping[str, Any], dataset: int | None) -> dict[str, Any] | None:
    run_root = Path(ledger["run_root"])
    settings_dir = Path(ledger["scratch_homebrew"]) / "settings" / PLUGIN_DIR_NAME
    require_contained(settings_dir, run_root, label="scratch Metadata settings")
    if settings_dir.exists():
        _remove_scratch_tree(settings_dir, run_root)
    _copy_private_tree(run_root / "scratch-settings", settings_dir, int(ledger["user_uid"]))
    if dataset is None:
        return None
    fixture = _validate_fixture(_fixture_path(run_root, dataset), dataset)
    target = settings_dir / "decky_metadata.json"
    canonical = (json.dumps(fixture, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    account = _account(ledger["user_name"])
    _atomic_write(target, canonical, mode=0o600, owner=(account.pw_uid, account.pw_gid), guard_root=run_root)
    return {"path": str(target), "sha256": _sha256_bytes(canonical), "records": dataset}


def _remove_scratch_tree(path: Path, run_root: Path) -> None:
    target = require_contained(path, run_root, label="scratch reset target")
    if target == Path(run_root) or target == Path(ledger_dummy := "/"):
        _fail("refusing broad scratch removal")
    if target.is_symlink():
        _fail("refusing to remove a symlinked scratch path")
    if not target.exists():
        return
    for base, dirs, files in os.walk(target, topdown=False, followlinks=False):
        for name in files:
            item = Path(base) / name
            require_contained(item, run_root, label="scratch file removal")
            if item.is_symlink() or not item.is_file():
                _fail("scratch removal encountered a non-regular file")
            item.unlink()
        for name in dirs:
            item = Path(base) / name
            require_contained(item, run_root, label="scratch directory removal")
            if item.is_symlink():
                _fail("scratch removal encountered a symlink")
            item.rmdir()
    target.rmdir()


def _chown_verified_scratch(ledger: Mapping[str, Any]) -> list[str]:
    scratch = Path(ledger["scratch_homebrew"])
    plugin = scratch / "plugins" / PLUGIN_DIR_NAME
    require_contained(plugin, Path(ledger["run_root"]), label="scratch ownership target")
    if not plugin.is_dir() or plugin.is_symlink():
        _fail("only a verified scratch Metadata plugin may be re-owned")
    # Re-own only fixed writable directories beneath the verified scratch root.
    arm = ledger["arm"]
    archive_path = Path(ledger["inputs"]["python_zip"] if arm == "A" else ledger["inputs"]["rust_zip"])
    _verify_installed_plugin(scratch, archive_path, ledger["expected"], arm)
    targets = [scratch / name for name in ("plugins", "settings", "data", "logs", "services")]
    account = _account(ledger["user_name"])
    changed: list[str] = []
    for target in targets:
        if not target.exists():
            continue
        require_contained(target, Path(ledger["run_root"]), label="scratch ownership target")
        for base, dirs, files in os.walk(target, topdown=True, followlinks=False):
            base_path = Path(base)
            if base_path.is_symlink():
                _fail("scratch ownership target contains a symlink")
            os.chown(base_path, account.pw_uid, account.pw_gid, follow_symlinks=False)
            changed.append(str(base_path))
            for name in dirs + files:
                item = base_path / name
                if item.is_symlink():
                    _fail("scratch ownership target contains a symlink")
                os.chown(item, account.pw_uid, account.pw_gid, follow_symlinks=False)
                if item.is_file() and stat.S_IMODE(item.stat().st_mode) & 0o111:
                    os.chmod(item, stat.S_IMODE(item.stat().st_mode) | 0o111)
                changed.append(str(item))
    return changed


def _record_temp_unit_intent(path: Path, unit: str, scope: str, arm: str) -> None:
    entry = {"kind": "temp_unit", "state": "pending", "unit": unit, "scope": scope, "arm": arm, "cgroup": "", "identities": [], "intent_ns": time.monotonic_ns()}
    _append_undo(path, entry)


def _replace_temp_entry(path: Path, unit: str, update_values: Mapping[str, Any]) -> dict[str, Any]:
    def update(ledger: dict[str, Any]) -> None:
        for entry in ledger["undo_entries"]:
            if entry["kind"] == "temp_unit" and entry["unit"] == unit:
                entry.update(update_values)
                return
        _fail("temporary service has no durable undo intent")
    return _mutate_ledger(path, update)


def _stop_temp_service(ledger_path: Path) -> dict[str, Any] | None:
    ledger = _load_ledger(ledger_path, ledger_path)
    temp = ledger["temp_service"]
    if ledger["collector"]["state"] != "stopped":
        _fail("collector must stop before its measured service is cleared")
    if temp is None:
        return None
    account = _account(ledger["user_name"])
    result = _drain_unit(temp["scope"], temp["unit"], account, group=temp.get("cgroup") or None, captured=temp.get("identities") or None, timeout=20)
    def update(state: dict[str, Any]) -> None:
        state["temp_service"] = None
        state["collector"] = {"unit": None, "scope": "system", "label": None, "path": None, "state": "stopped", "start_ns": None, "service_group": None, "arm": None, "exit_status": None, "exit_error": None}
        for entry in state["undo_entries"]:
            if entry["kind"] == "temp_unit" and entry["unit"] == temp["unit"]:
                entry["state"] = "restored"
                entry["cgroup"] = result["cgroup"]
                entry["identities"] = temp.get("identities", [])
    _mutate_ledger(ledger_path, update)
    return result


def _prepare(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, {"arm", "dataset", "install_zip"}, context="prepare payload")
    arm = payload["arm"]
    dataset = payload["dataset"]
    install_zip = payload["install_zip"]
    if arm not in {"A", "B", "C"} or dataset not in {None, 100, 1000} or not isinstance(install_zip, bool):
        _fail("invalid preparation selection")
    ledger = _load_ledger(ledger_path, ledger_path)
    if ledger["recovery"]["state"] == "recovered" or ledger["watchdog"]["state"] != "armed":
        _fail("prepare requires an armed, unrecovered run")
    run_root = Path(ledger["run_root"])
    scratch = Path(ledger["scratch_homebrew"])
    normal = Path(ledger["normal_homebrew"])
    assert_scratch_isolated(run_root, scratch, normal)
    if dataset is not None:
        fixture_path = _fixture_path(run_root, dataset)
        _validate_fixture(fixture_path, dataset)
    archive_path = Path(ledger["inputs"]["python_zip"] if arm == "A" else ledger["inputs"]["rust_zip"])
    archive, index = _archive_index(archive_path, ledger["expected"]["python_zip_sha256"] if arm == "A" else ledger["expected"]["rust_zip_sha256"])
    try:
        archive_info = _zip_metadata(archive, index, ledger["expected"], arm)
    finally:
        archive.close()
    _stop_temp_service(ledger_path)
    if ledger["arm"] in {"A", "B", "C"}:
        _chown_verified_scratch(_load_ledger(ledger_path, ledger_path))
    _pause_original_services(ledger_path, ledger)
    _ensure_port_free()
    context_reset = None
    if dataset is not None:
        # A document reload can retain old CEF heaps across benchmark trials.
        context_reset = _reset_steam_ui_context(_account(ledger["user_name"]))
    ledger = _load_ledger(ledger_path, ledger_path)
    plugin_root = scratch / "plugins" / PLUGIN_DIR_NAME
    require_contained(plugin_root, run_root, label="scratch reset target")
    if plugin_root.exists():
        _remove_scratch_tree(plugin_root, run_root)
    fixture_evidence = _write_capture_settings(ledger, dataset)
    if install_zip:
        _validate_private_dir(plugin_root, int(ledger["user_uid"]))
        archive, index = _archive_index(archive_path, ledger["expected"]["python_zip_sha256"] if arm == "A" else ledger["expected"]["rust_zip_sha256"])
        try:
            _extract_verified(archive, index, plugin_root, run_root, (int(ledger["user_uid"]), pwd.getpwuid(int(ledger["user_uid"])).pw_gid))
        finally:
            archive.close()
    # Rebuild only scratch Loader preferences; preserve normal global CEF state.
    normal_settings = Path(ledger["normal_homebrew"]) / "settings" / "loader.json"
    if normal_settings.exists():
        loader_settings = _load_json_file(normal_settings)
    else:
        loader_settings = {}
    loader_settings["cef_forward"] = bool(ledger["snapshot"]["cef_forwarder_socket"]["active"])
    loader_settings["pluginOrder"] = [PLUGIN_NAME]
    target_settings = scratch / "settings" / "loader.json"
    require_contained(target_settings, run_root, label="scratch Loader settings")
    _atomic_write(target_settings, (json.dumps(loader_settings, ensure_ascii=False, indent=2) + "\n").encode(), mode=0o600, owner=(int(ledger["user_uid"]), pwd.getpwuid(int(ledger["user_uid"])).pw_gid), guard_root=run_root)
    _mutate_ledger(ledger_path, lambda state: state.update({"arm": arm, "dataset": dataset, "install_zip": install_zip, "phase_events": []}))
    return {"ok": True, "arm": arm, "dataset": dataset, "install_zip": install_zip, "temp_unit": ledger["unit_prefix"] + "-" + arm.lower() + ".service", "mode": "upstream" if arm in {"A", "B"} else "fork", "scratch_homebrew": str(scratch), "fixture": fixture_evidence, "archive": archive_info, "steam_ui_context_reset": context_reset}


def _start(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, {"measure_backend"}, context="start payload")
    if not isinstance(payload["measure_backend"], bool):
        _fail("measure_backend must be a boolean")
    ledger = _load_ledger(ledger_path, ledger_path)
    if ledger["watchdog"]["state"] != "armed" or ledger["arm"] not in {"A", "B", "C"} or ledger["recovery"]["state"] == "recovered":
        _fail("start requires an armed prepared Loader")
    if ledger["temp_service"] is not None:
        _fail("a temporary Loader is already active")
    run_root = Path(ledger["run_root"])
    scratch = Path(ledger["scratch_homebrew"])
    assert_scratch_isolated(run_root, scratch, Path(ledger["normal_homebrew"]))
    arm = ledger["arm"]
    expected_arm_version = ledger["expected"]["python_version"] if arm == "A" else ledger["expected"]["rust_version"]
    plugin_root = scratch / "plugins" / PLUGIN_DIR_NAME
    if payload["measure_backend"]:
        archive_path = Path(ledger["inputs"]["python_zip"] if arm == "A" else ledger["inputs"]["rust_zip"])
        _verify_installed_plugin(scratch, archive_path, ledger["expected"], arm)
    unit = ledger["unit_prefix"] + "-" + arm.lower() + ".service"
    scope = "system" if arm in {"A", "B"} else "user"
    _record_temp_unit_intent(ledger_path, unit, scope, arm)
    _ensure_port_free()
    account = _account(ledger["user_name"])
    scratch_services = scratch / "services"
    backend_log = _plugin_log_path(scratch)
    if payload["measure_backend"]:
        require_contained(backend_log, run_root, label="scratch plugin readiness log")
    if arm in {"A", "B"}:
        runtime = Path(ledger["inputs"]["upstream_runtime"])
        if sha256_file(runtime) != UPSTREAM_RUNTIME_SHA256 or not _elf_x86_64(runtime) or not (runtime.stat().st_mode & 0o111):
            _fail("upstream runtime changed after capture")
        require_contained(scratch_services, run_root, label="temporary Loader service directory")
        scratch_services.mkdir(parents=True, exist_ok=True, mode=0o700)
        props = ["--unit=" + unit, "--collect", "--property=Type=simple", "--property=Restart=no", "--property=KillMode=mixed", "--property=TimeoutStopSec=15s", "--property=WorkingDirectory=" + str(scratch_services)]
        envs = {
            "UNPRIVILEGED_PATH": str(scratch), "PRIVILEGED_PATH": str(scratch), "UNPRIVILEGED_USER": "deck",
            "TMPDIR": str(_temp_base()),
            "SERVER_HOST": "127.0.0.1", "SERVER_PORT": str(PORT), "LOG_LEVEL": "INFO",
        }
        props.extend("--setenv=" + key + "=" + value for key, value in envs.items())
        if payload["measure_backend"]:
            log_cursor = _backend_log_cursor(backend_log)
        started_at = time.monotonic_ns()
        request_time_ns = time.time_ns()
        _systemd_run("system", account, props + ["--", str(runtime)], timeout=20)
    else:
        bundle = _runtime_bundle(Path(ledger["inputs"]["fork_runtime"]))
        runtime = Path(bundle["executable"])
        args = [
            "--worker", str(Path(ledger["inputs"]["fork_runtime"]) / "DeckyPluginWorker"),
            "--worker-mode", "fork", "--release-version", "dev", "--plugin-root", str(scratch / "plugins"),
            "--homebrew", str(scratch), "--user", "deck", "--assets", str(Path(ledger["inputs"]["fork_runtime"]) / "assets"),
            "--locales", str(Path(ledger["inputs"]["fork_runtime"]) / "locales"), "--listen", "127.0.0.1:1337",
            "--service-name", unit.removesuffix(".service"), "--cef-url", "http://127.0.0.1:8080", "--inject-frontend", "true",
        ]
        props = ["--unit=" + unit, "--collect", "--property=Type=simple", "--property=Restart=no", "--property=KillMode=mixed", "--property=TimeoutStopSec=15s", "--working-directory=" + str(Path(ledger["inputs"]["fork_runtime"]))]
        props.append("--setenv=TMPDIR=" + str(_temp_base()))
        if payload["measure_backend"]:
            log_cursor = _backend_log_cursor(backend_log)
        started_at = time.monotonic_ns()
        request_time_ns = time.time_ns()
        _systemd_run("user", account, props + ["--", str(runtime)] + args, timeout=20)
    group = _systemd_control_group(scope, unit, account)
    if not group:
        _fail("temporary Loader has no verifiable service cgroup")
    _replace_temp_entry(ledger_path, unit, {"cgroup": group})
    if not _wait_until(lambda: _systemd_unit_active(scope, unit, account), 15.0, 0.05):
        _fail("temporary Loader service did not become active")
    identities = _identities_for_group(group)
    service_identity = {"unit": unit, "scope": scope, "cgroup": group, "identities": identities, "plugin_root": str(plugin_root), "arm": arm, "started_at_ns": started_at}
    ledger = _mutate_ledger(ledger_path, lambda state: state.update({"temp_service": service_identity}))
    _replace_temp_entry(ledger_path, unit, {"identities": identities, "state": "pending"})
    deadline = time.monotonic() + START_TIMEOUT_SECONDS
    last_error = "scratch plugin log or Loader identity is not ready"
    backend_ready_ns: int | None = None
    while time.monotonic() < deadline:
        if not payload["measure_backend"]:
            if _loader_http_ready():
                pids = _loader_process_identities(group, runtime)
                if pids:
                    current_identities = _identities_for_group(group)
                    _mutate_ledger(ledger_path, lambda state: state["temp_service"].update({"identities": current_identities}))
                    return {
                        "ok": True, "elapsed_ms": (time.monotonic_ns() - started_at) / 1_000_000,
                        "pids": _safe_identities(pids), "service_ready": True, "backend_ready": False,
                        "readiness_kind": "loader_auth_token_http", "arm": arm,
                        "unit": unit, "identities": _safe_identities(current_identities),
                    }
            last_error = "Loader auth-token HTTP endpoint or process identity is not ready"
        else:
            if backend_ready_ns is None:
                backend_ready_ns = _backend_ready_after(log_cursor, backend_log)
            pids = _metadata_identities(ledger, arm)
            if backend_ready_ns is not None and pids:
                current_identities = _identities_for_group(group)
                _mutate_ledger(ledger_path, lambda state: state["temp_service"].update({"identities": current_identities}))
                return {
                    "ok": True, "backend_ready_log_ms": (backend_ready_ns - request_time_ns) / 1_000_000,
                    "request_time_ns": request_time_ns, "backend_ready_log_time_ns": backend_ready_ns,
                    "readiness_resolution_ms": 1, "pids": _safe_identities(pids),
                    "service_ready": True, "backend_ready": True,
                    "readiness_kind": "plugin_log_backend_ready", "arm": arm,
                    "unit": unit, "version": expected_arm_version,
                    "identities": _safe_identities(current_identities),
                }
            last_error = "backend-ready log line or Metadata process identity is not ready"
        time.sleep(READY_POLL_SECONDS)
    _fail("backend readiness timed out: " + last_error)


def _safe_identities(identities: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return [{"pid": item["pid"], "starttime": item["starttime"], "exe": Path(item["exe"]).name if isinstance(item.get("exe"), str) else "unknown"} for item in identities]


def _metadata_identities(ledger: Mapping[str, Any], arm: str) -> list[dict[str, Any]]:
    temp = ledger.get("temp_service")
    if not isinstance(temp, dict):
        return []
    return [
        identity for identity in _identities_for_group(temp["cgroup"])
        if _role_for_process(ledger, arm, identity) in _ARM_METADATA_ROLES[arm]
    ]


def _verify_plugin(ledger: Mapping[str, Any]) -> dict[str, Any]:
    arm = ledger.get("arm")
    if arm not in {"A", "B", "C"}:
        _fail("no prepared Loader arm is selected")
    temp = ledger.get("temp_service")
    if not isinstance(temp, dict):
        _fail("no temporary Loader is active")
    account = _account(ledger["user_name"])
    scope = temp["scope"]
    if not _systemd_unit_active(scope, temp["unit"], account):
        _fail("temporary Loader service is not active")
    if _systemd_control_group(scope, temp["unit"], account) != temp["cgroup"]:
        _fail("temporary Loader cgroup identity changed")
    assert_scratch_isolated(Path(ledger["run_root"]), Path(ledger["scratch_homebrew"]), Path(ledger["normal_homebrew"]))
    require_contained(Path(temp["plugin_root"]), Path(ledger["scratch_homebrew"]), label="active scratch plugin root")
    archive = Path(ledger["inputs"]["python_zip"] if arm == "A" else ledger["inputs"]["rust_zip"])
    installed = _verify_installed_plugin(Path(ledger["scratch_homebrew"]), archive, ledger["expected"], arm)
    pids = _metadata_identities(ledger, arm)
    if not pids:
        _fail("Metadata process identity is not visible in the temporary Loader cgroup")
    expected_version = ledger["expected"]["python_version"] if arm == "A" else ledger["expected"]["rust_version"]
    version = installed["manifest_version"]
    if version != expected_version:
        _fail("installed Metadata version does not match the verified ZIP")
    identities = _identities_for_group(temp["cgroup"])
    if any(item["exe"] == "unreadable" for item in pids):
        _fail("Metadata executable identity is unreadable")
    if arm == "C":
        expected_exe = resolved(Path(installed["installed_root"]) / "bin" / "backend", strict=True)
        if not any(resolved(Path(item["exe"]), strict=False) == expected_exe and sha256_file(Path(item["exe"])) == ledger["expected"]["rust_binary_sha256"] for item in pids):
            _fail("fork Metadata process is not the verified direct Rust backend")
        runtime_exe = resolved(Path(_runtime_bundle(Path(ledger["inputs"]["fork_runtime"]))["executable"]), strict=True)
        for item in pids:
            parent = _process_identity(int(item["ppid"]), temp["cgroup"])
            if parent is None or parent["exe"] == "unreadable" or resolved(Path(parent["exe"]), strict=False) != runtime_exe or not _process_in_cgroup(parent["pid"], temp["cgroup"]):
                _fail("fork Metadata is not a direct child of the verified Rust Loader")
    if arm == "B":
        rust_processes = [item for item in pids if Path(item["exe"]).name == ".decky-native-backend"]
        if not rust_processes or not any(sha256_file(Path(item["exe"])) == ledger["expected"]["rust_binary_sha256"] for item in rust_processes):
            _fail("upstream shim child is not the verified Rust binary")
    if arm == "A":
        for item in identities:
            exe = item.get("exe")
            if not isinstance(exe, str) or exe == "unreadable":
                _fail("Loader process executable identity is unreadable")
            if Path(exe).name in {".decky-native-backend", "backend"} and sha256_file(Path(exe)) == ledger["expected"]["rust_binary_sha256"]:
                _fail("original Python arm unexpectedly runs the Rust binary")
    runtime_copy = None
    if arm == "B":
        path = Path(ledger["scratch_homebrew"]) / "data" / PLUGIN_DIR_NAME / ".decky-native-backend"
        if not path.is_file() or path.is_symlink() or sha256_file(path) != ledger["expected"]["rust_binary_sha256"]:
            _fail("upstream shim runtime executable copy does not match the packaged backend")
        runtime_copy = str(path)
    loader_runtime_sha256 = UPSTREAM_RUNTIME_SHA256 if arm in {"A", "B"} else _runtime_bundle(Path(ledger["inputs"]["fork_runtime"]))["executable_sha256"]
    return {
        "arm": arm,
        "unit": temp["unit"],
        "scope": scope,
        "service_ready": True,
        "plugin_root": installed["installed_root"],
        "version": version,
        "pids": _safe_identities(pids),
        "runtime_copy": runtime_copy,
        "hashes": {
            "python_zip_sha256": ledger["expected"]["python_zip_sha256"],
            "rust_zip_sha256": ledger["expected"]["rust_zip_sha256"],
            "ui_sha256": ledger["expected"]["ui_sha256"],
            "rust_binary_sha256": ledger["expected"]["rust_binary_sha256"],
            "loader_runtime_sha256": loader_runtime_sha256,
            "fork_binary_sha256": None if arm == "A" else ledger["expected"]["rust_binary_sha256"],
        },
        "installed": installed,
    }


def _reload(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, set(), context="reload payload")
    ledger = _load_ledger(ledger_path, ledger_path)
    temp = ledger.get("temp_service")
    if not isinstance(temp, dict) or ledger["arm"] not in {"A", "B", "C"}:
        _fail("reload requires an active prepared Metadata backend")
    arm = ledger["arm"]
    expected = ledger["expected"]["python_version"] if arm == "A" else ledger["expected"]["rust_version"]
    log_path = _plugin_log_path(Path(ledger["scratch_homebrew"]))
    require_contained(log_path, Path(ledger["run_root"]), label="scratch plugin readiness log")
    old = _metadata_identities(ledger, arm)
    if not old:
        _fail("reload could not capture the old Metadata process identity")
    old_keys = {(item["pid"], item["starttime"]) for item in old}
    deadline = time.monotonic() + RELOAD_TIMEOUT_SECONDS
    log_cursor = _backend_log_cursor(log_path)
    started_ms = _loader_frontend_reload()
    ready_ns: int | None = None
    while time.monotonic() < deadline:
        if ready_ns is None:
            ready_ns = _backend_ready_after(log_cursor, log_path)
        current = _metadata_identities(_load_ledger(ledger_path, ledger_path), arm)
        gone = all(pid_starttime(pid) != start for pid, start in old_keys)
        new = [item for item in current if (item["pid"], item["starttime"]) not in old_keys]
        if gone and new and ready_ns is not None:
            try:
                version = _loader_frontend_version()
            except SafetyError:
                version = None
            if version == expected:
                identities = _identities_for_group(temp["cgroup"])
                _mutate_ledger(ledger_path, lambda state: state["temp_service"].update({"identities": identities}))
                _replace_temp_entry(ledger_path, temp["unit"], {"identities": identities})
                return {
                    "ok": True, "backend_ready_log_ms": ready_ns / 1_000_000 - started_ms,
                    "reload_start_page_time_ms": started_ms, "backend_ready_log_time_ns": ready_ns,
                    "readiness_resolution_ms": 1, "newpids": _safe_identities(new),
                    "version": version, "old_pids_gone": True, "poll_ms": 10,
                    "readiness_kind": "plugin_log_backend_ready",
                }
        time.sleep(READY_POLL_SECONDS)
    _fail("plugin-log backend reload readiness timed out")

def _heartbeat(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, set(), context="heartbeat payload")
    now = time.monotonic_ns()

    def update(ledger: dict[str, Any]) -> None:
        if ledger["watchdog"]["state"] != "armed" or ledger["recovery"]["state"] != "pending":
            _fail("recovered or recovering run cannot renew its lease")
        ledger["watchdog"]["last_heartbeat_ns"] = now

    _mutate_ledger(ledger_path, update)
    return {"heartbeat_monotonic_ns": now, "lease_active": True}


def _arm(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, {"heartbeat_timeout_seconds"}, context="arm payload")
    timeout = payload["heartbeat_timeout_seconds"]
    if not is_plain_int(timeout) or not 5 <= timeout <= 600:
        _fail("heartbeat timeout must be an integer from 5 to 600 seconds")
    ledger = _load_ledger(ledger_path, ledger_path)
    if ledger["watchdog"]["state"] != "unarmed" or ledger["recovery"]["state"] != "pending":
        _fail("run watchdog cannot be rearmed")
    if not ledger["snapshot"] or not ledger["captured_at_ns"]:
        _fail("watchdog requires captured original state")
    _require_root_authority()
    account = _account(ledger["user_name"])
    _verified_user_bus(account)
    unit = ledger["unit_prefix"] + "-watchdog.service"
    helper_dir = Path("/run/decky-metadata-benchmark") / ledger["run_id"]
    helper_path = helper_dir / "benchmark_vm.py"
    source = Path(ledger["helper_source"])
    source_bytes = source.read_bytes()
    if _sha256_bytes(source_bytes) != ledger["helper_sha256"]:
        _fail("staged benchmark helper changed after capture")
    _mutate_ledger(ledger_path, lambda state: state.update({"watchdog": {"unit": unit, "state": "installing", "timeout_seconds": timeout, "last_heartbeat_ns": time.monotonic_ns(), "helper_path": str(helper_path)}}))
    _install_root_helper(helper_dir, helper_path, source_bytes)
    props = ["--unit=" + unit, "--collect", "--property=Type=simple", "--property=Restart=no", "--property=KillMode=control-group", "--property=TimeoutStopSec=5s", "--setenv=BENCHMARK_VM_HELPER_DIR=" + str(source.parent)]
    props.append("--setenv=TMPDIR=" + str(_temp_base()))
    _systemd_run("system", account, props + ["--", sys.executable, str(helper_path), "--internal-watchdog", "--ledger", str(ledger_path)], timeout=15)
    if not _wait_until(lambda: _systemd_unit_active("system", unit, account), 5.0, 0.05):
        _fail("independent root watchdog did not become active")
    _mutate_ledger(ledger_path, _mark_watchdog_armed)
    return {"ok": True, "watchdog_unit": unit, "heartbeat_timeout_seconds": timeout, "independent_root_service": True}


def _mark_watchdog_armed(ledger: dict[str, Any]) -> None:
    if ledger["watchdog"]["state"] != "installing" or ledger["recovery"]["state"] != "pending":
        _fail("recovering or recovered watchdog cannot be armed")
    ledger["watchdog"].update({"state": "armed", "last_heartbeat_ns": time.monotonic_ns()})


def _install_root_helper(directory: Path, helper_path: Path, source: bytes) -> None:
    base = Path("/run/decky-metadata-benchmark")
    if not base.exists():
        _command(["sudo", "-n", "install", "-d", "-o", "root", "-g", "root", "-m", "0700", str(base)], timeout=5)
    base_info = base.lstat()
    if stat.S_ISLNK(base_info.st_mode) or not stat.S_ISDIR(base_info.st_mode) or base_info.st_uid != 0 or stat.S_IMODE(base_info.st_mode) != 0o700:
        _fail("root watchdog helper directory is not trusted")
    if directory.exists() or directory.is_symlink():
        _fail("root watchdog helper identity already exists")
    _command(["sudo", "-n", "install", "-d", "-o", "root", "-g", "root", "-m", "0700", str(directory)], timeout=5)
    result = _command(["sudo", "-n", "tee", str(helper_path)], input_bytes=source, timeout=10)
    if result.returncode:
        _fail("root watchdog helper could not be installed")
    _command(["sudo", "-n", "chown", "root:root", str(helper_path)], timeout=5)
    _command(["sudo", "-n", "chmod", "0500", str(helper_path)], timeout=5)
    digest = _command(["sudo", "-n", "sha256sum", str(helper_path)], timeout=5)
    if not _decode_output(digest.stdout).startswith(_sha256_bytes(source) + " "):
        _fail("root watchdog helper copy failed digest verification")
    info = _command(["sudo", "-n", "stat", "-c", "%u:%a", str(helper_path)], timeout=5)
    if _decode_output(info.stdout) != "0:500":
        _fail("root watchdog helper permissions are unsafe")


def _watchdog_expired(now_ns: int, last_heartbeat_ns: int, timeout_seconds: int) -> bool:
    return now_ns >= last_heartbeat_ns and now_ns - last_heartbeat_ns >= timeout_seconds * 1_000_000_000


def _watchdog_cycle(ledger_path: Path, *, now_ns: int | None = None, recover: Callable[[Path, bool], dict[str, Any]] | None = None) -> str:
    now = time.monotonic_ns() if now_ns is None else now_ns
    try:
        with _ledger_lock(ledger_path, blocking=False):
            ledger = _load_ledger(ledger_path, ledger_path)
            watchdog = ledger["watchdog"]
            recovery_state = ledger["recovery"]["state"]
            if recovery_state == "recovered":
                return "done"
            if recovery_state == "failed" or watchdog["state"] == "failed":
                return "failed"
            if watchdog["state"] in {"unarmed", "stopped"}:
                return "done"
            if watchdog["state"] not in {"armed", "installing"}:
                return "failed"
            if not _watchdog_expired(now, watchdog["last_heartbeat_ns"], watchdog["timeout_seconds"]):
                return "waiting"
            ledger["recovery"].update({"state": "running", "started_ns": now, "conflicts": []})
            _write_ledger(ledger)
    except LedgerLockBusy:
        return "waiting"
    callback = recover or _recover_ledger
    result = callback(ledger_path, True)
    return "recovered" if result.get("ok") else "failed"


def _watchdog_main(ledger_path: Path) -> int:
    while True:
        try:
            state = _watchdog_cycle(ledger_path)
        except SafetyError:
            return 1
        if state == "done":
            return 0
        if state == "recovered":
            try:
                with _recovery_lock(ledger_path):
                    _cleanup_root_helper(_load_ledger(ledger_path, ledger_path))
            except SafetyError:
                return 1
            return 0
        if state == "failed":
            return 1
        time.sleep(0.5)


def _phase(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, {"name", "start_ns", "end_ns"}, context="phase payload")
    name, start, end = payload["name"], payload["start_ns"], payload["end_ns"]
    if name not in {"idle", "workload", "warmup", "reload"} or not is_plain_int(start) or not is_plain_int(end) or not 0 < start < end <= time.monotonic_ns():
        _fail("invalid measurement phase window")
    def update(ledger: dict[str, Any]) -> None:
        collector = ledger["collector"]
        if ledger["temp_service"] is None or ledger["watchdog"]["state"] != "armed" or collector["state"] != "running":
            _fail("phase windows require an active Loader, collector and watchdog")
        previous = ledger["phase_events"]
        if start < collector["start_ns"] or (previous and (previous[-1]["name"] is not None or start < previous[-1]["monotonic_ns"])):
            _fail("measurement phase windows overlap or precede the collector")
        previous.extend(({"name": name, "monotonic_ns": start}, {"name": None, "monotonic_ns": end}))
    _mutate_ledger(ledger_path, update)
    return {"name": name, "start_ns": start, "end_ns": end}


def _cpu_usage_usec(group: str) -> int:
    path = _cgroup_directory(group) / "cpu.stat"
    try:
        lines = path.read_text(encoding="ascii").splitlines()
    except OSError:
        _fail("service cgroup CPU accounting is unreadable")
    for line in lines:
        fields = line.split()
        if len(fields) == 2 and fields[0] == "usage_usec" and fields[1].isdecimal():
            return int(fields[1])
    _fail("service cgroup CPU accounting has no usage_usec")


def _smaps_memory(pid: int) -> dict[str, int]:
    try:
        text = Path(f"/proc/{pid}/smaps_rollup").read_text(encoding="ascii")
    except (FileNotFoundError, ProcessLookupError):
        _fail("process disappeared before memory sampling")
    except OSError:
        _fail("process memory accounting is unreadable")
    fields: dict[str, int] = {}
    for line in text.splitlines():
        name, sep, rest = line.partition(":")
        if sep and name in {"Pss", "Rss", "Private_Dirty"}:
            words = rest.split()
            if words and words[0].isdecimal():
                fields[name] = int(words[0])
    if set(fields) != {"Pss", "Rss", "Private_Dirty"}:
        _fail("process memory accounting is incomplete")
    return {"pss_kib": fields["Pss"], "rss_kib": fields["Rss"], "private_dirty_kib": fields["Private_Dirty"]}


def _phase_at(events: Sequence[Mapping[str, Any]], monotonic_ns: int) -> str | None:
    active = None
    for event in events:
        if event["monotonic_ns"] <= monotonic_ns:
            active = event["name"]
        else:
            break
    return active

def interpolate_service_cpu_window(
    samples: Sequence[Mapping[str, Any]], start_ns: int, end_ns: int,
) -> dict[str, int | float | None]:
    if not is_plain_int(start_ns) or not is_plain_int(end_ns) or not 0 < start_ns < end_ns:
        return {"service_cpu_usec": None, "covered_wall_ns": 0}
    times = [sample.get("monotonic_ns") for sample in samples]
    if not all(is_plain_int(value) for value in times) or any(right <= left for left, right in zip(times, times[1:])):
        return {"service_cpu_usec": None, "covered_wall_ns": 0}
    covered_wall_ns = 0
    service_cpu_usec = 0.0
    valid = True
    for index in range(1, len(samples)):
        left = max(start_ns, times[index - 1])
        right = min(end_ns, times[index])
        if right <= left:
            continue
        covered_wall_ns += right - left
        delta = samples[index].get("service_cpu_delta_usec")
        if is_plain_int(delta) and delta >= 0:
            service_cpu_usec += delta * (right - left) / (times[index] - times[index - 1])
        else:
            valid = False
    return {
        "service_cpu_usec": service_cpu_usec if valid and covered_wall_ns else None,
        "covered_wall_ns": covered_wall_ns,
    }


def _role_for_process(ledger: Mapping[str, Any], arm: str, identity: Mapping[str, Any]) -> str:
    plugin = resolved(Path(ledger["scratch_homebrew"]) / "plugins" / PLUGIN_DIR_NAME, strict=False)
    exe = identity.get("exe")
    if not isinstance(exe, str) or exe == "unreadable":
        _fail("service executable identity is unreadable")
    exe_path = resolved(Path(exe.removesuffix(" (deleted)")), strict=False)
    if arm == "C" and exe_path == resolved(plugin / "bin" / "backend", strict=False):
        return "metadata_native"
    runtime_backend = resolved(Path(ledger["scratch_homebrew"]) / "data" / PLUGIN_DIR_NAME / ".decky-native-backend", strict=False)
    if arm == "B" and exe_path == runtime_backend:
        return "metadata_rust"
    if arm in {"A", "B"} and exe_path == resolved(Path(ledger["inputs"]["upstream_runtime"]), strict=False):
        try:
            title = Path(f"/proc/{identity['pid']}/cmdline").read_bytes().split(b"\0", 1)[0]
        except (FileNotFoundError, ProcessLookupError):
            return "loader_overhead"
        except OSError:
            _fail("upstream process title is unreadable")
        expected_title = f"{PLUGIN_NAME} ({plugin / 'main.py'})".encode()
        if title == expected_title and pid_starttime(int(identity["pid"])) == identity["starttime"]:
            return "metadata_python" if arm == "A" else "metadata_shim"
    return "loader_overhead"


def _collector_sample(
    ledger: Mapping[str, Any], previous_cpu: int | None, collector_start_ticks: int | None = None,
) -> tuple[dict[str, Any], int]:
    collector = ledger["collector"]
    temp = ledger.get("temp_service")
    if not isinstance(temp, dict) or collector["service_group"] != temp["cgroup"]:
        _fail("collector no longer has an active measured service identity")
    now = time.monotonic_ns()
    cpu = _cpu_usage_usec(temp["cgroup"])
    identities = _identities_for_group(temp["cgroup"])
    processes: list[dict[str, Any]] = []
    for identity in identities:
        pid = int(identity["pid"])
        before = _proc_stat(pid)
        if before is None or before[0] != identity["starttime"]:
            continue
        role = _role_for_process(ledger, temp["arm"], identity)
        try:
            memory = _smaps_memory(pid)
        except SafetyError as exc:
            if str(exc) == "process disappeared before memory sampling":
                after = _proc_stat(pid)
                if after is None or after[0] != before[0]:
                    continue
            raise
        after = _proc_stat(pid)
        if after is None or after[0] != before[0]:
            continue
        if after[2] < before[2]:
            _fail("process CPU accounting moved backwards")
        processes.append(
            {
                "pid": pid,
                "starttime": before[0],
                "role": role,
                **memory,
                "cpu_ticks": after[2],
            }
        )
    # Assign completed browser windows only after their timestamps are returned.
    if previous_cpu is not None and cpu < previous_cpu:
        _fail("service cgroup CPU accounting moved backwards")
    sample = {
        "monotonic_ns": now,
        "service_cpu_usage_usec": cpu,
        "service_cpu_delta_usec": None if previous_cpu is None else cpu - previous_cpu,
        "processes": processes,
        "errors": [],
    }
    if collector_start_ticks is not None:
        sample["collector_starttime_ticks"] = collector_start_ticks
    return sample, cpu


_MEMORY_FIELDS = ("pss_kib", "rss_kib", "private_dirty_kib")
_METADATA_ROLES = ("metadata_python", "metadata_shim", "metadata_rust", "metadata_native")
_ARM_METADATA_ROLES = {"A": {"metadata_python"}, "B": {"metadata_shim", "metadata_rust"}, "C": {"metadata_native"}}
_PHASES = ("idle", "warmup", "workload", "reload")


def _memory_totals(samples: Sequence[Mapping[str, Any]], roles: set[str]) -> tuple[list[dict[str, int]], bool]:
    totals: list[dict[str, int]] = []
    observed = False
    for sample in samples:
        current = dict.fromkeys(_MEMORY_FIELDS, 0)
        seen: set[tuple[int, int]] = set()
        for process in sample.get("processes", []):
            if not isinstance(process, Mapping) or process.get("role") not in roles:
                continue
            pid, start = process.get("pid"), process.get("starttime")
            if not is_plain_int(pid) or pid <= 0 or not is_plain_int(start) or start <= 0:
                continue
            key = (pid, start)
            if key in seen:
                continue
            seen.add(key)
            observed = True
            for field in _MEMORY_FIELDS:
                value = process.get(field)
                if not is_plain_int(value) or value < 0:
                    return totals, False
                current[field] += value
        totals.append(current)
    return totals, observed


def _memory_attribution(
    samples: Sequence[Mapping[str, Any]], roles: set[str], *, allow_zero: bool = False
) -> dict[str, Any]:
    totals, observed = _memory_totals(samples, roles)
    if len(totals) != len(samples) or (not observed and not allow_zero):
        return {"current": None, "sampled_peak": None, "readable": False}
    return {
        "current": totals[-1],
        "sampled_peak": {field: max(item[field] for item in totals) for field in _MEMORY_FIELDS},
        "readable": True,
    }


def summarize_samples(samples: Sequence[Mapping[str, Any]], arm: str, phase_events: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    errors: list[Any] = []
    for item in samples:
        if not isinstance(item, Mapping):
            errors.append("invalid collector sample")
            continue
        sample_errors = item.get("errors", [])
        if not isinstance(sample_errors, list):
            errors.append("invalid sample error list")
        else:
            errors.extend(sample_errors)
    if not samples:
        return {"sample_count": 0, "wall_seconds": None, "service_cpu_seconds": None, "idle_one_core_percent": None, "metadata": None, "host_service": None, "phase_totals": {}, "errors": errors + ["no collector samples"]}
    if arm not in {"A", "B", "C"}:
        errors.append("invalid collector arm")
    times = [item.get("monotonic_ns") if isinstance(item, Mapping) else None for item in samples]
    if not all(is_plain_int(value) and value >= 0 for value in times) or any(right <= left for left, right in zip(times, times[1:])):
        errors.append("invalid monotonic sample boundaries")
        return {"sample_count": len(samples), "wall_seconds": None, "service_cpu_seconds": None, "idle_one_core_percent": None, "metadata": None, "host_service": None, "phase_totals": {}, "errors": errors}
    collector_start_ticks = samples[0].get("collector_starttime_ticks")
    collector_start_valid = collector_start_ticks is None or (
        is_plain_int(collector_start_ticks) and collector_start_ticks >= 0
    )
    if not collector_start_valid or any("collector_starttime_ticks" in sample for sample in samples[1:]):
        errors.append("collector start process-clock boundary is invalid or repeated")
        collector_start_valid = False

    role_names = _ARM_METADATA_ROLES.get(arm, set())
    service_cpu_usec = 0
    service_cpu_valid = True
    for index, sample in enumerate(samples):
        delta = sample.get("service_cpu_delta_usec")
        if index == 0 and delta is None:
            continue
        if not is_plain_int(delta) or delta < 0:
            service_cpu_valid = False
            errors.append("unreadable or negative service CPU accounting")
            continue
        service_cpu_usec += delta

    observed_roles: set[str] = set()
    role_cpu_ticks = dict.fromkeys((*_METADATA_ROLES, "loader_overhead"), 0)
    role_cpu_valid = collector_start_valid
    previous: dict[tuple[int, int], tuple[str, int]] = {}
    for sample in samples:
        current: dict[tuple[int, int], tuple[str, int]] = {}
        processes = sample.get("processes")
        if not isinstance(processes, list):
            errors.append("invalid process attribution sample")
            role_cpu_valid = False
            previous = current
            continue
        missing_roles = role_names - {process.get("role") for process in processes if isinstance(process, Mapping)}
        if missing_roles and _phase_at(phase_events, sample["monotonic_ns"]) != "reload":
            errors.append({"error": "metadata_process_not_observed", "roles": sorted(missing_roles)})
        for process in processes:
            if not isinstance(process, Mapping):
                errors.append("invalid process attribution record")
                role_cpu_valid = False
                continue
            pid, start, ticks, role = process.get("pid"), process.get("starttime"), process.get("cpu_ticks"), process.get("role")
            if not is_plain_int(pid) or pid <= 0 or not is_plain_int(start) or start <= 0 or not is_plain_int(ticks) or ticks < 0 or role not in role_cpu_ticks:
                errors.append("invalid process identity, role, or CPU accounting")
                role_cpu_valid = False
                continue
            key = (pid, start)
            if key in current:
                if current[key] != (role, ticks):
                    errors.append("conflicting duplicate process identity")
                    role_cpu_valid = False
                continue
            if any(previous_key[0] == pid and previous_key[1] != start for previous_key in previous):
                errors.append("PID starttime changed within collector samples")
            current[key] = (role, ticks)
            observed_roles.add(role)
        for key, (role, ticks) in current.items():
            prior = previous.get(key)
            if prior is None:
                if collector_start_valid and collector_start_ticks is not None and key[1] > collector_start_ticks:
                    role_cpu_ticks[role] += ticks
                continue
            if prior[0] != role or ticks < prior[1]:
                errors.append("process CPU accounting changed identity or moved backwards")
                role_cpu_valid = False
                continue
            role_cpu_ticks[role] += ticks - prior[1]
        previous = current

    clock_ticks = os.sysconf("SC_CLK_TCK")
    if not is_plain_int(clock_ticks) or clock_ticks <= 0:
        errors.append("system process CPU tick rate is unreadable")
        role_cpu_valid = False
        clock_ticks = 1
    metadata_ticks = sum(role_cpu_ticks[role] for role in role_names)
    metadata_cpu_seconds = metadata_ticks / clock_ticks if role_cpu_valid else None
    service_cpu_seconds = service_cpu_usec / 1_000_000 if service_cpu_valid else None
    host_cpu = role_cpu_ticks["loader_overhead"] / clock_ticks if role_cpu_valid else None
    if role_cpu_valid and service_cpu_seconds is not None:
        attributed_cpu = sum(role_cpu_ticks.values()) / clock_ticks
        role_identities = {
            (process["pid"], process["starttime"])
            for sample in samples
            for process in sample.get("processes", [])
            if isinstance(process, Mapping) and process.get("role") in role_cpu_ticks
            and is_plain_int(process.get("pid")) and is_plain_int(process.get("starttime"))
        }
        rounding = len(role_identities) / clock_ticks
        remaining = service_cpu_seconds - attributed_cpu
        if remaining < -rounding:
            errors.append("attributed process CPU exceeds service cgroup CPU accounting")
            unattributed_cpu = None
        else:
            unattributed_cpu = max(0.0, remaining)
    else:
        unattributed_cpu = None

    by_role = {
        role: _memory_attribution(samples, {role}, allow_zero=role == "loader_overhead")
        for role in (*_METADATA_ROLES, "loader_overhead")
    }
    for role in role_names:
        if role not in observed_roles:
            errors.append(f"expected Metadata role was not observed: {role}")
    metadata_memory = _memory_attribution(samples, role_names)
    host_memory = by_role["loader_overhead"]
    if not metadata_memory["readable"]:
        errors.append("Metadata PSS/RSS/private-dirty attribution is unreadable")
    if not host_memory["readable"]:
        errors.append("host Loader PSS/RSS/private-dirty attribution is unreadable")
    metadata = {
        "cpu_seconds": metadata_cpu_seconds,
        "memory": metadata_memory,
        "roles": {role: by_role[role] for role in sorted(role_names)},
    }
    host_service = {"cpu_seconds": host_cpu, "memory": host_memory}
    memory = {
        **by_role,
        "metadata": metadata_memory,
        "service_total": _memory_attribution(samples, set(role_cpu_ticks), allow_zero=True),
    }

    phase_ranges = []
    prior_time = -1
    for event in phase_events:
        if not isinstance(event, Mapping) or (event.get("name") is not None and event["name"] not in _PHASES) or not is_plain_int(event.get("monotonic_ns")) or event["monotonic_ns"] < prior_time:
            errors.append("invalid phase boundary")
            continue
        prior_time = event["monotonic_ns"]
        phase_ranges.append((event["monotonic_ns"], event["name"]))
    phase_acc = {name: {"wall_ns": 0, "cpu_usec": 0.0, "cpu_valid": True} for name in _PHASES}
    for index in range(len(phase_ranges) - 1):
        start, active = phase_ranges[index]
        end, _ = phase_ranges[index + 1]
        if active not in phase_acc or end <= start:
            continue
        bucket = phase_acc[active]
        interval = interpolate_service_cpu_window(samples, start, end)
        bucket["wall_ns"] += int(interval["covered_wall_ns"])
        cpu_usec = interval["service_cpu_usec"]
        if isinstance(cpu_usec, (int, float)) and not isinstance(cpu_usec, bool):
            bucket["cpu_usec"] += cpu_usec
        else:
            bucket["cpu_valid"] = False
    phase_totals = {}
    for name, bucket in phase_acc.items():
        wall = bucket["wall_ns"] / 1_000_000_000 if bucket["wall_ns"] else None
        cpu = bucket["cpu_usec"] / 1_000_000 if bucket["cpu_valid"] and bucket["wall_ns"] else None
        phase_totals[name] = {
            "wall_seconds": wall,
            "service_cpu_seconds": cpu,
            "idle_one_core_percent": None if cpu is None or wall is None else 100.0 * cpu / wall,
        }
        if name != "reload" and (wall is None or cpu is None):
            errors.append(f"collector has no complete {name} phase interval")

    wall_seconds = (times[-1] - times[0]) / 1_000_000_000
    idle_percent = phase_totals["idle"]["idle_one_core_percent"]
    if idle_percent is None:
        errors.append("collector has no complete service CPU/wall interval")
    return {
        "sample_count": len(samples),
        "collector_starttime_ticks": collector_start_ticks,
        "wall_seconds": wall_seconds,
        "service_cpu_seconds": service_cpu_seconds,
        "idle_one_core_percent": idle_percent,
        "metadata": metadata,
        "host_service": host_service,
        "unattributed": {"cpu_seconds": unattributed_cpu},
        "phase_totals": phase_totals,
        "phase_cpu_attribution": "linear interpolation between 5 Hz cgroup samples",
        "memory": memory,
        "errors": errors,
    }


def _read_samples(path: Path) -> list[dict[str, Any]]:
    info = _safe_regular(path)
    if info.st_size > MAX_SAMPLE_BYTES:
        _fail("collector sample file exceeds its size limit")
    result: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as stream:
            for line in stream:
                if line.strip():
                    value = json.loads(line)
                    if not isinstance(value, dict):
                        _fail("collector sample record is not an object")
                    result.append(value)
    except (OSError, UnicodeError, json.JSONDecodeError):
        _fail("collector sample file is unreadable")
    return result


def _collector_loop(ledger_path: Path) -> int:
    ledger = _load_ledger(ledger_path, ledger_path)
    collector = ledger["collector"]
    path = Path(collector["path"])
    require_contained(path, Path(ledger["run_root"]) / "evidence", label="collector output")
    collector_start_ticks = _proc_uptime_ticks()
    interval_ns = int(COLLECTOR_INTERVAL_SECONDS * 1_000_000_000)
    deadline_ns: int | None = None
    previous_cpu = None
    start_ticks_pending: int | None = collector_start_ticks
    status = 0
    missed_deadlines = 0
    error = None
    try:
        with path.open("a", encoding="utf-8", buffering=1) as stream:
            os.chmod(path, 0o600)
            while True:
                ledger = _load_ledger(ledger_path, ledger_path)
                if ledger["collector"]["state"] not in {"running", "stopping"}:
                    break
                now_ns = time.monotonic_ns()
                if deadline_ns is not None and now_ns >= deadline_ns + interval_ns:
                    # A busy VM can stall one poll (e.g. during Steam's webhelper restart).
                    # CPU comes from cumulative counters, so count the gap and resync
                    # instead of discarding the trial; memory peaks in the gap are unsampled.
                    missed_deadlines += (now_ns - deadline_ns) // interval_ns
                    deadline_ns = now_ns - interval_ns
                sample, previous_cpu = _collector_sample(ledger, previous_cpu, start_ticks_pending)
                sample["missed_deadlines"] = missed_deadlines
                start_ticks_pending = None
                stream.write(json.dumps(sample, separators=(",", ":"), ensure_ascii=False) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
                if ledger["collector"]["state"] == "stopping":
                    break
                deadline_ns = time.monotonic_ns() + interval_ns if deadline_ns is None else deadline_ns + interval_ns
                delay_ns = deadline_ns - time.monotonic_ns()
                # The next iteration rejects a full-period delay; smaller overruns can catch up.
                if delay_ns > 0:
                    time.sleep(delay_ns / 1_000_000_000)
    except Exception as exc:
        status = 1
        error = f"{type(exc).__name__}: {exc}"
    finally:
        os.chmod(path, 0o600)
    def record_exit(state: dict[str, Any]) -> None:
        current = state["collector"]
        if current["unit"] == collector["unit"] and current["path"] == str(path):
            current.update({"exit_status": status, "exit_error": error})
    _mutate_ledger(ledger_path, record_exit)
    return status


def _collect_start(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, {"label"}, context="collect-start payload")
    label = payload["label"]
    if not isinstance(label, str) or not _SAFE_LABEL_RE.fullmatch(label):
        _fail("collector label must match ARM-DATASET-TRIAL")
    ledger = _load_ledger(ledger_path, ledger_path)
    if ledger["watchdog"]["state"] != "armed" or ledger["temp_service"] is None or ledger["arm"] != label[0]:
        _fail("collector requires the selected active Loader arm and watchdog")
    if ledger["collector"]["state"] in {"running", "stopping"}:
        _fail("collector is already running")
    temp = ledger["temp_service"]
    sample_path = Path(ledger["run_root"]) / "evidence" / f"{label}.jsonl"
    require_contained(sample_path, Path(ledger["run_root"]) / "evidence", label="collector output")
    if sample_path.is_symlink():
        _fail("collector output path is a symlink")
    if sample_path.exists():
        # A retried trial keeps its earlier attempt's samples beside the new file.
        attempt = 1
        while (archived := sample_path.with_name(f"{label}.attempt-{attempt}.jsonl")).exists():
            attempt += 1
        require_contained(archived, Path(ledger["run_root"]) / "evidence", label="collector output")
        os.rename(sample_path, archived)
    _atomic_write(sample_path, b"", mode=0o600, owner=(int(ledger["user_uid"]), pwd.getpwuid(int(ledger["user_uid"])).pw_gid), guard_root=Path(ledger["run_root"]))
    unit = ledger["unit_prefix"] + "-collector-" + label.lower() + ".service"
    _mutate_ledger(ledger_path, lambda state: state.update({"collector": {"unit": unit, "scope": "system", "label": label, "path": str(sample_path), "state": "running", "start_ns": time.monotonic_ns(), "service_group": temp["cgroup"], "arm": temp["arm"], "exit_status": None, "exit_error": None}}))
    helper_path = Path(ledger["watchdog"]["helper_path"] or "")
    if not helper_path.is_file() or helper_path.is_symlink():
        _fail("root watchdog helper is unavailable to the collector")
    account = _account(ledger["user_name"])
    props = ["--unit=" + unit, "--collect", "--property=Type=simple", "--property=Restart=no", "--property=KillMode=control-group", "--property=TimeoutStopSec=5s"]
    props.extend(["--setenv=TMPDIR=" + str(_temp_base()), "--setenv=BENCHMARK_VM_HELPER_DIR=" + str(Path(ledger["helper_source"]).parent)])
    _systemd_run("system", account, props + ["--", sys.executable, str(helper_path), "--internal-collector", "--ledger", str(ledger_path)], timeout=15)
    collector_group = _systemd_control_group("system", unit, account)
    if not collector_group or collector_group == temp["cgroup"] or collector_group.startswith(temp["cgroup"].rstrip("/") + "/") or temp["cgroup"].startswith(collector_group.rstrip("/") + "/"):
        _fail("collector is not outside the measured Loader cgroup")
    if not _wait_until(lambda: _systemd_unit_active("system", unit, account), 5.0, 0.05):
        _fail("external authorized collector did not start")
    return {"ok": True, "label": label, "samples_path": str(sample_path), "collector_unit": unit, "interval_hz": 5, "outside_service_cgroup": True}


def _collect_stop(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, set(), context="collect-stop payload")
    ledger = _load_ledger(ledger_path, ledger_path)
    collector = ledger["collector"]
    if collector["unit"] is None or collector["path"] is None:
        _fail("no collector is recorded for this trial")
    unit, sample_path = collector["unit"], Path(collector["path"])
    require_contained(sample_path, Path(ledger["run_root"]) / "evidence", label="collector output")
    account = _account(ledger["user_name"])
    if collector["state"] in {"running", "stopping"}:
        _mutate_ledger(ledger_path, lambda state: state["collector"].update({"state": "stopping"}))
        if not _wait_until(lambda: not _systemd_unit_active("system", unit, account), 10.0, 0.05):
            _fail("collector did not exit after its stop request")
    _drain_unit("system", unit, account, timeout=10)
    _mutate_ledger(ledger_path, lambda state: state["collector"].update({"state": "stopped"}))
    final = _load_ledger(ledger_path, ledger_path)
    collector = final["collector"]
    sample_info = _safe_regular(sample_path)
    if sample_info.st_uid != int(final["user_uid"]) or stat.S_IMODE(sample_info.st_mode) != 0o600:
        _fail("collector sample file has unsafe ownership or permissions")
    samples = _read_samples(sample_path)
    phase_boundaries = final["phase_events"]
    summary = summarize_samples(samples, collector["arm"], phase_boundaries)
    exit_status = collector["exit_status"]
    exit_error = collector["exit_error"]
    exit_errors = [] if is_plain_int(exit_status) and exit_status == 0 and exit_error is None else [exit_error or "collector exit status is unavailable or nonzero"]
    collector_exit = {
        "ok": not exit_errors,
        "result": "success" if not exit_errors else "exit-code",
        "status": exit_status,
        "errors": exit_errors,
    }
    return {
        "ok": collector_exit["ok"] and not summary["errors"],
        "samples_path": str(sample_path),
        "summary": summary,
        "samples": samples,
        "label": collector["label"],
        "phase_boundaries": phase_boundaries,
        "collector_exit": collector_exit,
    }


def _stop(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, set(), context="stop payload")
    collector = _load_ledger(ledger_path, ledger_path)["collector"]
    if collector["state"] in {"running", "stopping"}:
        _collect_stop(ledger_path, {})
    drained = _stop_temp_service(ledger_path)
    if _port_owners():
        _fail("port 1337 remains owned after temporary Loader drain")
    return {"ok": True, "stopped": True, "temporary_service": drained, "normal_restored": False}


def _downloads_target(account: pwd.struct_passwd) -> Path:
    target = Path(account.pw_dir) / "Downloads" / DOWNLOAD_NAME
    current = Path(target.anchor)
    for component in target.parts[1:-1]:
        current /= component
        try:
            info = current.lstat()
        except OSError:
            _fail("Downloads path is unavailable")
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            _fail("Downloads path contains a symlink or non-directory")
        if current in {Path(account.pw_dir), target.parent} and info.st_uid != account.pw_uid:
            _fail("Downloads directories are not owned by deck")
    if target.exists() or target.is_symlink():
        _safe_regular(target)
    return target


def _downloads(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, {"archive"}, context="downloads payload")
    choice = payload["archive"]
    if choice not in {"python", "rust"}:
        _fail("archive must be python or rust")
    ledger = _load_ledger(ledger_path, ledger_path)
    if ledger["recovery"]["state"] == "recovered" or ledger["watchdog"]["state"] != "armed":
        _fail("Downloads delivery requires an armed unrecovered run")
    source = Path(ledger["inputs"]["python_zip"] if choice == "python" else ledger["inputs"]["rust_zip"])
    digest_key = "python_zip_sha256" if choice == "python" else "rust_zip_sha256"
    digest = ledger["expected"][digest_key]
    if sha256_file(source, max_bytes=MAX_ARCHIVE_BYTES) != digest:
        _fail("staged ZIP changed before Downloads delivery")
    account = _account("deck")
    target = _downloads_target(account)
    observed_identity = _file_identity(target)
    backup_path = None
    original_exists = target.exists()
    original_sha = None
    original_mode = None
    if original_exists:
        info = _safe_regular(target)
        if (info.st_uid, info.st_gid) != (account.pw_uid, account.pw_gid):
            _fail("existing Downloads ZIP has unexpected ownership")
        data = target.read_bytes()
        original_sha = _sha256_bytes(data)
        original_mode = stat.S_IMODE(info.st_mode)
        backup_path = Path(ledger["run_root"]) / "undo" / f"downloads-original-{original_sha}.bin"
        require_contained(backup_path, Path(ledger["run_root"]) / "undo", label="Downloads undo backup")
        if backup_path.exists():
            if sha256_file(backup_path) != original_sha:
                _fail("existing private Downloads backup conflicts")
        else:
            _atomic_write(backup_path, data, mode=0o600, owner=(account.pw_uid, account.pw_gid), guard_root=Path(ledger["run_root"]))
    entry = {"kind": "downloads", "state": "pending", "path": str(target), "backup_path": None if backup_path is None else str(backup_path), "original_exists": original_exists, "original_sha256": original_sha, "original_mode": original_mode, "replacement_sha256": digest, "replacement_mode": 0o600, "intent_ns": time.monotonic_ns()}
    _append_undo(ledger_path, entry)
    _atomic_write(_downloads_target(account), source.read_bytes(), mode=0o600, owner=(account.pw_uid, account.pw_gid), expected_identity=observed_identity)
    return {"ok": True, "archive": choice, "path": str(target), "sha256": digest, "delivered": True}


_SHORTCUT_FIXTURE_JS = r"""
const fixtureApps = () => {
  const all = globalThis.appStore?.allApps;
  if (!Array.isArray(all) || !all.length) throw new Error("native library is not ready");
  if (!Array.isArray(globalThis.SteamUIStore?.RunningApps)) throw new Error("native running-app state is unavailable");
  return all.filter(a => Number(a.app_type) === 1073741824);
};
const fixtureDetails = async (id) => {
  let subscription, timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("native shortcut details timed out")), 5000);
      subscription = SteamClient.Apps.RegisterForAppDetails(id, data => {
        const app = fixtureApps().find(a => Number(a.appid) === id);
        if (!app) { resolve(null); return; }
        if (Number(data?.unAppID) !== id ||
            !["strShortcutExe", "strShortcutStartDir", "strShortcutLaunchOptions"].every(k => typeof data[k] === "string")) return;
        resolve({
          app_id: id, name: app.display_name, exe: data.strShortcutExe,
          start_dir: data.strShortcutStartDir, launch_options: data.strShortcutLaunchOptions,
          running: SteamUIStore.RunningApps.some(value => Number(value.appid) === id)
        });
      });
    });
  } finally {
    clearTimeout(timer);
    subscription?.unregister();
  }
};
"""


def _native_fixture_rows() -> list[dict[str, Any]]:
    value = _cdp_eval("(async()=>{" + _SHORTCUT_FIXTURE_JS + """
      const apps = fixtureApps();
      if (apps.length > 4096) throw new Error("too many native shortcuts");
      const result = [];
      for (const app of apps) {
        const row = await fixtureDetails(Number(app.appid));
        if (row) result.push(row);
      }
      return result;
    })()""", timeout=30)
    if not isinstance(value, list):
        _fail("native shortcut inventory is invalid")
    seen: set[int] = set()
    for row in value:
        if not isinstance(row, dict) or set(row) != {"app_id", "name", "exe", "start_dir", "launch_options", "running"}:
            _fail("native shortcut details are invalid")
        app_id = row["app_id"]
        if not is_plain_int(app_id) or not 0 < app_id <= 0xFFFFFFFF or app_id in seen or not isinstance(row["running"], bool):
            _fail("native shortcut identity is invalid")
        if any(not isinstance(row[key], str) for key in ("name", "exe", "start_dir", "launch_options")):
            _fail("native shortcut fields are invalid")
        seen.add(app_id)
    return value


def _fixture_removal_target(entry: Mapping[str, Any], rows: Sequence[Mapping[str, Any]]) -> tuple[str, Mapping[str, Any] | None]:
    app_id = entry["app_id"]
    new_rows = [row for row in rows if row["app_id"] not in entry["original_ids"]]
    if app_id is not None:
        candidates = [row for row in new_rows if row["app_id"] == app_id]
        if not candidates:
            return "pending", None
    else:
        candidates = [row for row in new_rows if row["name"] == entry["name"] or row["exe"].strip('"') == entry["exe"]]
        if not candidates:
            return ("conflict" if new_rows else "pending"), None
    if len(candidates) != 1:
        return "conflict", None
    row = candidates[0]
    if (
        row["name"] != entry["name"]
        or row["launch_options"] != ""
        or row["exe"].strip('"') != entry["exe"]
        or row["start_dir"].strip('"').rstrip("/") != str(Path(entry["exe"]).parent)
        or row["running"]
    ):
        return "conflict", None
    return "remove", row


def _backup_shortcut_files(ledger: Mapping[str, Any]) -> None:
    account = _account(ledger["user_name"])
    root = Path(account.pw_dir) / ".local/share/Steam/userdata"
    require_contained(root, Path(account.pw_dir), label="Steam userdata")
    destination = Path(ledger["run_root"]) / "undo" / "native-shortcuts"
    if destination.exists():
        _fail("native shortcut backup already exists; do not repeat provisioning")
    _validate_private_dir(destination, account.pw_uid)
    manifest = []
    for profile in sorted(root.iterdir()):
        if not profile.name.isdecimal() or not profile.is_dir():
            continue
        source = profile / "config" / "shortcuts.vdf"
        require_contained(source, root, label="Steam shortcut file")
        if not source.exists():
            manifest.append({"path": str(source), "exists": False})
            continue
        fd = os.open(source, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(fd, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_uid != account.pw_uid or before.st_size > MAX_SAMPLE_BYTES:
                _fail("native shortcut backup source is unsafe")
            data = stream.read(MAX_SAMPLE_BYTES + 1)
            after = os.fstat(stream.fileno())
        if len(data) > MAX_SAMPLE_BYTES or (before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            _fail("native shortcuts changed during backup")
        _atomic_write(destination / f"{profile.name}.vdf", data, owner=(account.pw_uid, account.pw_gid), guard_root=destination)
        manifest.append({"path": str(source), "exists": True, "sha256": _sha256_bytes(data), "mode": stat.S_IMODE(before.st_mode)})
    _atomic_write(destination / "manifest.json", json.dumps(manifest, sort_keys=True).encode(), owner=(account.pw_uid, account.pw_gid), guard_root=destination)


def _provision_shortcuts(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, set(), context="shortcuts payload")
    ledger = _load_ledger(ledger_path, ledger_path)
    if ledger["watchdog"]["state"] != "armed" or ledger["test_scope"] or not ledger["temp_service"]:
        _fail("temporary shortcuts require an armed real UI arm")
    if any(entry["kind"] == "shortcut_fixture" for entry in ledger["undo_entries"]):
        _fail("temporary shortcut provisioning already started; do not repeat")
    _backup_shortcut_files(ledger)
    account = _account(ledger["user_name"])
    directory = Path(ledger["run_root"]) / "native-fixtures"
    _validate_private_dir(directory, account.pw_uid)
    result = {}
    for role in ("listed", "delisted", "never"):
        name = f"Metadata-Rust-{role}-{ledger['unit_prefix'].rsplit('-', 1)[-1]}"
        executable = directory / name
        if executable.exists():
            _fail("temporary executable already exists")
        _atomic_write(executable, Path("/usr/bin/true").read_bytes(), mode=0o755, owner=(account.pw_uid, account.pw_gid), guard_root=directory)
        preview = _cdp_eval("SteamClient.Apps.GetShortcutDataForPath(" + json.dumps(str(executable)) + ")")
        if not isinstance(preview, dict) or any(not isinstance(preview.get(key), str) for key in ("strAppName", "strExePath", "strArguments", "strCmdline")):
            _fail("native shortcut preview is invalid")
        if preview["strAppName"] != name or preview["strExePath"].strip('"') != str(executable) or preview["strArguments"] or preview["strCmdline"].strip('"') != str(executable):
            _fail("native shortcut preview does not identify the task executable")
        rows = _native_fixture_rows()
        if any(row["exe"].strip('"') == str(executable) for row in rows):
            _fail("temporary shortcut executable already exists in the library")
        entry = {"kind": "shortcut_fixture", "state": "pending", "role": role, "name": name, "exe": str(executable), "app_id": None, "original_ids": [row["app_id"] for row in rows], "intent_ns": time.monotonic_ns()}
        _append_undo(ledger_path, entry)
        args = [preview[key] for key in ("strAppName", "strExePath", "strArguments", "strCmdline")]
        app_id = _cdp_eval("SteamClient.Apps.AddShortcut(..." + json.dumps(args) + ")")
        if not is_plain_int(app_id) or not 0 < app_id <= 0xFFFFFFFF or app_id in entry["original_ids"]:
            _fail("native shortcut creation returned an invalid identity")
        def record(state: dict[str, Any]) -> None:
            target = next(item for item in state["undo_entries"] if item["kind"] == "shortcut_fixture" and item["role"] == role)
            target["app_id"] = app_id
        _mutate_ledger(ledger_path, record)
        entry["app_id"] = app_id
        def published() -> bool:
            status, row = _fixture_removal_target(entry, _native_fixture_rows())
            if status == "remove" and row is not None:
                result[role] = dict(row)
                return True
            return False
        if not _wait_until(published, 10.0, 0.05):
            _fail("native shortcut creation did not publish its exact owned fixture")
    return {"ok": True, "fixtures": result, "backup": str(Path(ledger["run_root"]) / "undo/native-shortcuts/manifest.json")}


def _remove_shortcut_fixture(entry: Mapping[str, Any]) -> str:
    status, row = _fixture_removal_target(entry, _native_fixture_rows())
    if status == "pending":
        def published() -> bool:
            nonlocal status, row
            status, row = _fixture_removal_target(entry, _native_fixture_rows())
            return status != "pending"
        if not _wait_until(published, 10.0, 0.05):
            return "failed"
    if status != "remove":
        return status
    expression = "(async()=>{" + _SHORTCUT_FIXTURE_JS + "const expected=" + json.dumps(dict(row)) + """
      const current = await fixtureDetails(expected.app_id);
      const app = fixtureApps().find(a => Number(a.appid) === expected.app_id);
      if (!current || !app) return "failed";
      if (app.display_name !== expected.name || SteamUIStore.RunningApps.some(value => Number(value.appid) === expected.app_id) ||
          !Object.keys(expected).every(key => current[key] === expected[key])) return "conflict";
      SteamClient.Apps.RemoveShortcut(expected.app_id);
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        if (!fixtureApps().some(a => Number(a.appid) === expected.app_id)) return "restored";
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return "failed";
    })()"""
    result = _cdp_eval(expression)
    return result if result in {"restored", "conflict", "failed"} else "failed"


def _native_shortcut_probe(app_id: int) -> dict[str, Any]:
    expression = "(() => { const id=" + str(app_id) + "; const apps=Array.isArray(appStore?.allApps)?appStore.allApps:Object.values(appStore?.allApps||{}); const entry=apps.find(v=>Number(v?.appid)===id)||null; const native=Boolean(entry&&(Number(entry.app_type)===1073741824||entry.BIsShortcut?.()===true)); const current=typeof entry?.display_name===\"string\"?entry.display_name:\"\"; return {native,current,sortAs:typeof entry?.sort_as===\"string\"?entry.sort_as:(typeof entry?.sortAs===\"string\"?entry.sortAs:\"\")}; })()"
    value = _cdp_eval(expression)
    if not isinstance(value, dict) or not isinstance(value.get("native"), bool) or not isinstance(value.get("current"), str) or not isinstance(value.get("sortAs"), str):
        _fail("Steam native shortcut probe returned invalid evidence")
    return value


def _name_undo(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, {"app_id", "original_name", "original_sort", "applied_name"}, context="name-undo payload")
    app_id = payload["app_id"]
    if not is_plain_int(app_id) or not 0 < app_id <= 0xFFFFFFFF:
        _fail("shortcut app ID is invalid")
    for key in {"original_name", "original_sort", "applied_name"}:
        if not isinstance(payload[key], str) or "\x00" in payload[key] or len(payload[key]) > 1024:
            _fail("shortcut name undo values are invalid")
    if not payload["original_name"] or not payload["applied_name"] or payload["original_name"] == payload["applied_name"]:
        _fail("shortcut undo names are invalid")
    ledger = _load_ledger(ledger_path, ledger_path)
    if ledger["watchdog"]["state"] != "armed" or ledger["recovery"]["state"] == "recovered":
        _fail("shortcut undo requires an armed unrecovered run")
    current = _native_shortcut_probe(app_id)
    if not current["native"] or current["current"] != payload["original_name"] or current["sortAs"] != payload["original_sort"]:
        _fail("shortcut state changed before durable undo was recorded")
    entry = {"kind": "shortcut_name", "state": "pending", "app_id": app_id, "original_name": payload["original_name"], "original_sort": payload["original_sort"], "applied_name": payload["applied_name"], "intent_ns": time.monotonic_ns()}
    _append_undo(ledger_path, entry)
    return {"recorded": True, "app_id": app_id, "native": True}


def _restore_shortcut(entry: Mapping[str, Any]) -> str:
    app_id = int(entry["app_id"])
    original = str(entry["original_name"])
    original_sort = str(entry["original_sort"])
    applied = str(entry["applied_name"])
    current = _native_shortcut_probe(app_id)
    if not current["native"]:
        return "conflict"
    if current["current"] == original:
        return "restored" if current["sortAs"] == original_sort else "conflict"
    if current["current"] != applied:
        return "conflict"
    name_json = json.dumps(original, ensure_ascii=False)
    applied_json = json.dumps(applied, ensure_ascii=False)
    expression = "(async()=>{const id=" + str(app_id) + ";const target=" + name_json + ";const applied=" + applied_json + ";const all=Array.isArray(appStore?.allApps)?appStore.allApps:Object.values(appStore?.allApps||{});const entry=all.find(v=>Number(v?.appid)===id);if(!entry||!(Number(entry.app_type)===1073741824||entry.BIsShortcut?.()===true)||entry.display_name!==applied)return \"conflict\";const apps=SteamClient?.Apps;if(!apps||typeof apps.SetShortcutName!==\"function\")throw new Error(\"native setter unavailable\");apps.SetShortcutName.call(apps,id,target);const deadline=performance.now()+5000;while(performance.now()<deadline){if(entry.display_name===target)return true;await new Promise(r=>setTimeout(r,50))}return false})()"
    result = _cdp_eval(expression)
    if result == "conflict":
        return "conflict"
    if result is not True:
        return "failed"
    restored = _native_shortcut_probe(app_id)
    if restored["native"] and restored["current"] == original and restored["sortAs"] == original_sort:
        return "restored"
    return "conflict"


def _guarded_restore_file(entry: Mapping[str, Any], *, path_override: Path | None = None, backup_root: Path | None = None) -> str:
    if entry.get("kind") == "downloads":
        try:
            account = _account("deck")
            path = _downloads_target(account)
        except SafetyError:
            return "conflict"
        if path != Path(entry.get("path", "")) or (path_override is not None and path_override != path):
            return "conflict"
    else:
        try:
            path = _absolute_path(str(path_override or entry.get("path", "")), label="undo target")
            if path_override is not None and path_override != Path(entry.get("path", "")):
                return "conflict"
            if backup_root is None:
                return "failed"
            require_contained(path, backup_root, label="undo target")
        except SafetyError:
            return "conflict"
    observed_identity = _file_identity(path)
    try:
        info = path.lstat()
    except FileNotFoundError:
        info = None
    except OSError:
        return "failed"
    if info is not None and (stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode)):
        return "conflict"
    current_hash = None if info is None else sha256_file(path)
    current_mode = None if info is None else stat.S_IMODE(info.st_mode)
    if _file_identity(path) != observed_identity:
        return "conflict"
    original_hash = entry.get("original_sha256")
    replacement_hash = entry.get("replacement_sha256")
    original_exists = bool(entry.get("original_exists"))
    if original_exists and current_hash == original_hash and current_mode == entry.get("original_mode"):
        return "restored"
    if not original_exists and current_hash is None:
        return "restored"
    if current_hash != replacement_hash or current_mode != entry.get("replacement_mode"):
        return "conflict"
    if original_exists:
        backup = Path(entry["backup_path"])
        root = backup_root or backup.parent
        try:
            require_contained(backup, root, label="undo backup")
            backup_info = _safe_regular(backup)
            if backup_info.st_uid != root.stat().st_uid or stat.S_IMODE(backup_info.st_mode) != 0o600:
                return "failed"
            data = backup.read_bytes()
        except (OSError, SafetyError):
            return "failed"
        if _sha256_bytes(data) != original_hash:
            return "failed"
        try:
            owner = (info.st_uid, info.st_gid)
            _atomic_write(path, data, mode=int(entry["original_mode"]), owner=owner, guard_root=root if entry.get("kind") == "test_file" else None, expected_identity=observed_identity)
        except FileStateChanged:
            return "conflict"
        except (OSError, SafetyError):
            return "failed"
    else:
        try:
            if _file_identity(path) != observed_identity:
                return "conflict"
            path.unlink()
            dir_fd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0))
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:
            return "failed"
    return "restored"


def _undo_actions(ledger: dict[str, Any], ledger_path: Path, conflicts: list[str], *, only_kind: str | None = None) -> None:
    for index in reversed(range(len(ledger["undo_entries"]))):
        current = _load_ledger(ledger_path, ledger_path)
        if index >= len(current["undo_entries"]):
            continue
        entry = current["undo_entries"][index]
        if only_kind is not None and entry["kind"] != only_kind:
            continue
        if entry["state"] == "restored" or entry["kind"] == "normal_unit":
            continue
        result = "failed"
        error_text = ""
        try:
            if entry["kind"] == "downloads":
                result = _guarded_restore_file(entry, backup_root=Path(current["run_root"]) / "undo")
            elif entry["kind"] == "shortcut_name":
                result = _restore_shortcut(entry)
            elif entry["kind"] == "shortcut_fixture":
                result = _remove_shortcut_fixture(entry)
            elif entry["kind"] == "test_file":
                result = _guarded_restore_file(entry, path_override=Path(entry["path"]), backup_root=Path(current["run_root"]) / "watchdog-test")
            elif entry["kind"] == "temp_unit":
                _drain_unit(entry["scope"], entry["unit"], _account(current["user_name"]), group=entry.get("cgroup") or None, captured=entry.get("identities") or None, timeout=20)
                result = "restored"
        except SafetyError as error:
            error_text = str(error)

        def record(state: dict[str, Any]) -> None:
            target = state["undo_entries"][index]
            if target["state"] != "restored":
                target["state"] = result
            if result == "restored" and entry["kind"] == "temp_unit":
                temp = state["temp_service"]
                if isinstance(temp, dict) and temp["unit"] == entry["unit"]:
                    state["temp_service"] = None
                    if state["collector"]["state"] == "stopped":
                        state["collector"] = {"unit": None, "scope": "system", "label": None, "path": None, "state": "stopped", "start_ns": None, "service_group": None, "arm": None, "exit_status": None, "exit_error": None}
        _mutate_ledger(ledger_path, record)
        if result in {"conflict", "failed"}:
            kind = entry["kind"]
            identity = entry.get("app_id", entry.get("unit", entry.get("path", "entry")))
            detail = f":{error_text}" if error_text else ""
            conflicts.append(f"{kind}:{identity}:{result}{detail}")


def _restart_original_services(ledger: Mapping[str, Any], conflicts: list[str]) -> dict[str, Any]:
    account = _account(ledger["user_name"])
    original = ledger["snapshot"]["units"]
    result: dict[str, Any] = {}
    for scope in ("system", "user"):
        saved = original[scope]
        unit = saved["unit"]
        active_now = _systemd_unit_active(scope, unit, account)
        if saved["active"] and not active_now:
            owned_stop = any(entry["kind"] == "normal_unit" and entry["scope"] == scope and entry["unit"] == unit and entry["was_active"] and entry["state"] == "pending" for entry in ledger.get("undo_entries", []))
            if not owned_stop or not _unit_definition_matches(_known_unit_snapshot(scope, unit, account), saved):
                conflicts.append(f"normal_loader:{scope}:activation_or_selection_changed")
                result[scope] = False
                continue
            if _port_owners():
                conflicts.append(f"normal_loader:{scope}:port_1337_owned")
                result[scope] = False
                continue
            if scope == "system":
                _system_command(["start", unit], timeout=30, check=False)
            else:
                _user_command(account, ["start", unit], timeout=30, check=False)
            result[scope] = _wait_until(lambda: _systemd_unit_active(scope, unit, account), 30.0, 0.1)
            if not result[scope]:
                conflicts.append(f"normal_loader:{scope}:start_failed")
        elif saved["active"]:
            result[scope] = True
        else:
            result[scope] = not active_now
            if active_now:
                conflicts.append(f"normal_loader:{scope}:unexpectedly_active")
        if result.get(scope) and saved["active"]:
            def mark_restored(state: dict[str, Any]) -> None:
                for entry in state["undo_entries"]:
                    if entry["kind"] == "normal_unit" and entry["scope"] == scope and entry["unit"] == unit and entry["state"] == "pending":
                        entry["state"] = "restored"
            if any(entry["kind"] == "normal_unit" and entry["scope"] == scope and entry["unit"] == unit and entry["state"] == "pending" for entry in ledger.get("undo_entries", [])):
                _mutate_ledger(Path(ledger["ledger_path"]), mark_restored)
    cef_saved = ledger["snapshot"]["cef_forwarder"]
    socket_saved = ledger["snapshot"]["cef_forwarder_socket"]
    cef_now = _known_unit_snapshot("system", CEF_FORWARDER_UNIT, account)
    socket_now = _known_unit_snapshot("system", CEF_FORWARDER_SOCKET, account)
    socket_matches, cef_matches = _cef_recovery_matches(cef_saved, cef_now, socket_saved, socket_now)
    result["cef_forwarder_socket"] = socket_matches
    result["cef_forwarder"] = cef_matches
    result["cef_proxy_active"] = cef_now["active"]
    if not socket_matches:
        conflicts.append("cef_forwarder_socket:activation_or_selection_changed")
    if not cef_matches:
        conflicts.append("cef_forwarder:activation_or_selection_changed")
    return result


def _verify_restored_state(ledger: Mapping[str, Any], conflicts: list[str]) -> dict[str, Any]:
    account = _account(ledger["user_name"])
    checks: dict[str, Any] = {}
    normal = Path(ledger["normal_homebrew"])
    checks["normal_homebrew_hashes"] = _tree_matches(normal, ledger["snapshot"]["normal_tree"])
    if not checks["normal_homebrew_hashes"]:
        conflicts.append("normal_homebrew:hashes_changed")
    service_files = {}
    for unit, item in ledger["snapshot"]["normal_service_files"].items():
        path = _validate_unit_file_path(item["path"], item["scope"], item["unit"], account)
        matches = path.exists() and _unit_file_fingerprint(path) == item["sha256"]
        service_files[unit] = matches
        if not matches:
            conflicts.append(f"service_file:{unit}:changed")
    checks["normal_service_files"] = service_files
    for scope, saved in ledger["snapshot"]["units"].items():
        active = _systemd_unit_active(scope, saved["unit"], account)
        checks["original_loader_" + scope + "_activation"] = active == saved["active"]
        if active != saved["active"]:
            conflicts.append(f"normal_loader:{scope}:activation_mismatch")
        unchanged = _unit_definition_matches(_known_unit_snapshot(scope, saved["unit"], account), saved)
        checks["original_loader_" + scope + "_selection"] = unchanged
        if not unchanged:
            conflicts.append(f"normal_loader:{scope}:selection_changed")
    try:
        ui = _capture_ui()
        checks["ui_restored"] = ui.get("route") == ledger["snapshot"]["ui"].get("route") and ui.get("quickAccess") == ledger["snapshot"]["ui"].get("quickAccess")
        new_apps = sorted(set(ui.get("running_apps", [])) - set(ledger["snapshot"]["running_apps"]))
        checks["no_new_running_apps"] = not new_apps
        if not checks["ui_restored"]:
            conflicts.append("steam_ui:route_or_menu_mismatch")
        if new_apps:
            conflicts.append("steam_ui:new_running_apps")
    except SafetyError:
        checks["ui_restored"] = False
        checks["no_new_running_apps"] = False
        conflicts.append("steam_ui:verification_unavailable")
    checks["port_1337_free_or_original"] = not _port_owners() or any(saved["active"] for saved in ledger["snapshot"]["units"].values())
    return checks


def _cleanup_root_helper(ledger: Mapping[str, Any]) -> None:
    raw = ledger["watchdog"].get("helper_path")
    if not raw:
        return
    if not _RUN_ID_RE.fullmatch(str(ledger.get("run_id", ""))):
        _fail("root helper cleanup run identity is invalid")
    base = Path("/run/decky-metadata-benchmark")
    directory = base / ledger["run_id"]
    expected = directory / "benchmark_vm.py"
    if Path(raw) != expected:
        _fail("root helper cleanup path is invalid")
    if os.geteuid() == 0:
        try:
            base_info = base.lstat()
        except FileNotFoundError:
            return
        except OSError:
            _fail("root helper parent directory is unreadable")
        if stat.S_ISLNK(base_info.st_mode) or not stat.S_ISDIR(base_info.st_mode) or base_info.st_uid != 0 or stat.S_IMODE(base_info.st_mode) != 0o700:
            _fail("root helper parent directory is not trusted")
        try:
            parent = directory.lstat()
        except FileNotFoundError:
            return
        except OSError:
            _fail("root helper cleanup directory is unreadable")
        if stat.S_ISLNK(parent.st_mode) or not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or stat.S_IMODE(parent.st_mode) != 0o700:
            _fail("root helper cleanup directory is not trusted")
        try:
            info = expected.lstat()
        except FileNotFoundError:
            info = None
        except OSError:
            _fail("root helper cleanup target is unreadable")
        if info is not None and (
            stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o500
        ):
            _fail("root helper cleanup target is not the verified immutable copy")
        try:
            if info is not None:
                expected.unlink()
                fd = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0))
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
            directory.rmdir()
            fd = os.open(base, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0))
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        except OSError:
            _fail("root helper cleanup failed")
        return

    _command(["sudo", "-n", "true"], timeout=5)
    base_result = _command(["sudo", "-n", "stat", "-c", "%F:%u:%a", str(base)], timeout=5, check=False)
    if base_result.returncode:
        missing = _command(["sudo", "-n", "test", "!", "-e", str(base)], timeout=5, check=False)
        symlink = _command(["sudo", "-n", "test", "-L", str(base)], timeout=5, check=False)
        if missing.returncode == 0 and symlink.returncode != 0:
            return
        _fail("root helper parent directory cannot be verified")
    if _decode_output(base_result.stdout) != "directory:0:700":
        _fail("root helper parent directory is not trusted")
    directory_result = _command(["sudo", "-n", "stat", "-c", "%F:%u:%a", str(directory)], timeout=5, check=False)
    if directory_result.returncode:
        missing = _command(["sudo", "-n", "test", "!", "-e", str(directory)], timeout=5, check=False)
        symlink = _command(["sudo", "-n", "test", "-L", str(directory)], timeout=5, check=False)
        if missing.returncode == 0 and symlink.returncode != 0:
            return
        _fail("root helper cleanup directory cannot be verified")
    if _decode_output(directory_result.stdout) != "directory:0:700":
        _fail("root helper cleanup directory is not trusted")
    helper_result = _command(["sudo", "-n", "stat", "-c", "%F:%u:%a", str(expected)], timeout=5, check=False)
    if helper_result.returncode:
        missing = _command(["sudo", "-n", "test", "!", "-e", str(expected)], timeout=5, check=False)
        symlink = _command(["sudo", "-n", "test", "-L", str(expected)], timeout=5, check=False)
        if missing.returncode != 0 or symlink.returncode == 0:
            _fail("root helper cleanup target cannot be verified")
    elif _decode_output(helper_result.stdout) != "regular file:0:500":
        _fail("root helper cleanup target is not the verified immutable copy")
    else:
        _command(["sudo", "-n", "rm", "--", str(expected)], timeout=5)
    _command(["sudo", "-n", "rmdir", "--", str(directory)], timeout=5)


def _recover_ledger_serialized(ledger_path: Path, from_watchdog: bool = False) -> dict[str, Any]:
    conflicts: list[str] = []
    verification: dict[str, Any] = {}
    try:
        already_recovered = False
        with _ledger_lock(ledger_path):
            ledger = _load_ledger(ledger_path, ledger_path)
            already_recovered = ledger["recovery"]["state"] == "recovered"
            if not already_recovered:
                ledger["recovery"].update({"state": "running", "started_ns": time.monotonic_ns(), "conflicts": []})
                _write_ledger(ledger)
        if already_recovered:
            if not from_watchdog:
                _cleanup_root_helper(ledger)
            return {"ok": True, "conflicts": [], "verification": ledger["recovery"]["verification"], "already_recovered": True}

        account = _account(ledger["user_name"])
        collector = ledger["collector"]
        collector_drained = collector["unit"] is None
        if collector["unit"] is not None:
            _mutate_ledger(ledger_path, lambda state: state["collector"].update({"state": "stopping"}))
            try:
                _drain_unit("system", collector["unit"], account, timeout=10)
                _mutate_ledger(ledger_path, lambda state: state["collector"].update({"state": "stopped"}))
                collector_drained = True
            except SafetyError as error:
                conflicts.append("collector:drain_failed:" + str(error))

        ledger = _load_ledger(ledger_path, ledger_path)
        _undo_actions(ledger, ledger_path, conflicts, only_kind="temp_unit")
        ledger = _load_ledger(ledger_path, ledger_path)
        temp_entries = [entry for entry in ledger["undo_entries"] if entry["kind"] == "temp_unit"]
        temp_drained = ledger["temp_service"] is None and all(entry["state"] == "restored" for entry in temp_entries)
        if temp_drained:
            temp_drained = all(
                _service_drained(entry["scope"], entry["unit"], entry["cgroup"], entry["identities"], account)
                for entry in temp_entries
            )
        verification["collector_drained"] = collector_drained
        verification["temporary_services_drained"] = temp_drained
        if not collector_drained:
            conflicts.append("collector:drain_failed")
        if not temp_drained:
            conflicts.append("temporary_loader:cgroup_drain_failed")

        restore_ready = collector_drained and temp_drained
        pending_stop = any(entry["kind"] == "normal_unit" and entry["state"] == "pending" for entry in ledger["undo_entries"])
        if not ledger["test_scope"] and restore_ready and pending_stop:
            try:
                if any(_systemd_unit_active(scope, saved["unit"], account) for scope, saved in ledger["snapshot"]["units"].items()):
                    _fail("normal Loader activation changed before browser cleanup")
                _ensure_port_free()
                verification["steam_ui_context_reset"] = _reset_steam_ui_context(account)
            except SafetyError as error:
                restore_ready = False
                verification["steam_ui_context_reset"] = False
                conflicts.append("steam_ui:context_reset_failed:" + str(error))
        _undo_actions(ledger, ledger_path, conflicts)
        ledger = _load_ledger(ledger_path, ledger_path)
        verification["shortcut_fixtures_removed"] = all(entry["state"] == "restored" for entry in ledger["undo_entries"] if entry["kind"] == "shortcut_fixture")

        if not ledger["test_scope"]:
            if restore_ready:
                verification["original_activation"] = _restart_original_services(ledger, conflicts)
            else:
                verification["original_activation"] = {"restoration_skipped": True}
            if any(entry["kind"] in {"normal_unit", "temp_unit", "shortcut_name", "shortcut_fixture"} for entry in ledger["undo_entries"]):
                try:
                    _restore_ui(ledger["snapshot"]["ui"])
                    verification["ui_restore_requested"] = True
                except SafetyError:
                    verification["ui_restore_requested"] = False
                    conflicts.append("steam_ui:restore_failed")
            else:
                verification["ui_restore_not_needed"] = True
            ledger = _load_ledger(ledger_path, ledger_path)
            verification.update(_verify_restored_state(ledger, conflicts))
        else:
            verification["user_bus_verified"] = bool(_verified_user_bus(account))
            verification["test_units_drained"] = temp_drained
            verification["fixture_undo_guarded"] = all(
                entry["state"] == "restored"
                for entry in ledger["undo_entries"] if entry["kind"] == "test_file"
            )

        ok = not conflicts and all(value is not False for value in verification.values())
        if ok and not from_watchdog:
            if ledger["watchdog"]["unit"]:
                stopped = _system_command(["stop", ledger["watchdog"]["unit"]], timeout=10, check=False)
                if stopped.returncode and _systemd_unit_active("system", ledger["watchdog"]["unit"], account):
                    conflicts.append("watchdog:stop_failed")
                    ok = False
            if ok:
                _cleanup_root_helper(_load_ledger(ledger_path, ledger_path))

        with _ledger_lock(ledger_path):
            final = _load_ledger(ledger_path, ledger_path)
            conflicts = list(dict.fromkeys(final["recovery"]["conflicts"] + conflicts))
            ok = ok and not conflicts
            final["recovery"].update({
                "state": "recovered" if ok else "failed",
                "conflicts": conflicts,
                "verification": verification,
                "completed_ns": time.monotonic_ns(),
            })
            final["watchdog"]["state"] = "stopped" if ok else "failed"
            _write_ledger(final)
        return {"ok": ok, "conflicts": conflicts, "verification": verification, "already_recovered": False}
    except SafetyError as error:
        conflicts.append("recovery:" + str(error))
        with _ledger_lock(ledger_path):
            final = _load_ledger(ledger_path, ledger_path)
            if final["recovery"]["state"] != "recovered":
                conflicts = list(dict.fromkeys(final["recovery"]["conflicts"] + conflicts))
                final["recovery"].update({
                    "state": "failed",
                    "conflicts": conflicts,
                    "verification": verification,
                    "completed_ns": time.monotonic_ns(),
                })
                final["watchdog"]["state"] = "failed"
                _write_ledger(final)
        return {"ok": False, "conflicts": conflicts, "verification": verification, "already_recovered": False}


def _recover_ledger(ledger_path: Path, from_watchdog: bool = False) -> dict[str, Any]:
    with _recovery_lock(ledger_path):
        return _recover_ledger_serialized(ledger_path, from_watchdog)

def _status(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, set(), context="status payload")
    ledger = _load_ledger(ledger_path, ledger_path)
    temp = ledger["temp_service"]
    collector = ledger["collector"]
    identities = [] if temp is None else _safe_identities(temp.get("identities", []))
    return {
        "state": ledger["recovery"]["state"],
        "captured": True,
        "run_root": ledger["run_root"],
        "scratch_homebrew": ledger["scratch_homebrew"],
        "normal_homebrew": ledger["normal_homebrew"],
        "arm": ledger["arm"],
        "dataset": ledger["dataset"],
        "watchdog": {"unit": ledger["watchdog"]["unit"], "state": ledger["watchdog"]["state"], "timeout_seconds": ledger["watchdog"]["timeout_seconds"]},
        "temporary_service": None if temp is None else {"unit": temp["unit"], "scope": temp["scope"], "cgroup": temp["cgroup"], "identities": identities},
        "collector": {"unit": collector["unit"], "state": collector["state"], "label": collector["label"], "samples_path": collector["path"]},
        "conflicts": ledger["recovery"]["conflicts"],
    }


def _stop_watchdog_test_setup(prefix: str, account: pwd.struct_passwd) -> None:
    _system_command(["stop", prefix + "-watchdog-test-watchdog.service"], timeout=5, check=False)
    _user_command(account, ["stop", prefix + "-watchdog-test.service"], timeout=5, check=False)


def _watchdog_test(ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    exact_keys(payload, set(), context="watchdog-test payload")
    ledger = _load_ledger(ledger_path, ledger_path)
    if ledger["watchdog"]["state"] != "unarmed" or ledger["recovery"]["state"] != "pending":
        _fail("watchdog-test must run before real run arming")
    account = _account(ledger["user_name"])
    _require_root_authority()
    _verified_user_bus(account)
    run_root = Path(ledger["run_root"])
    test_root = run_root / "watchdog-test"
    _validate_private_dir(test_root, account.pw_uid)
    if any(test_root.iterdir()):
        _fail("watchdog-test fixture directory is not empty")
    test_ledger_path = run_root / "watchdog-test-ledger.json"
    if test_ledger_path.exists() or test_ledger_path.is_symlink():
        _fail("watchdog-test fixture ledger already exists")
    prefix = ledger["unit_prefix"]
    unit = prefix + "-watchdog-test.service"
    watch_unit = prefix + "-watchdog-test-watchdog.service"
    fixture_path = test_root / "probe.bin"
    backup_path = test_root / "original.bin"
    helper_path = Path("/run/decky-metadata-benchmark") / ledger["run_id"] / "benchmark_vm.py"
    original = b"original-watchdog-fixture\n"
    replacement = b"replacement-watchdog-fixture\n"
    try:
        with _recovery_lock(test_ledger_path):
            _atomic_write(fixture_path, original, mode=0o600, owner=(account.pw_uid, account.pw_gid), guard_root=run_root)
            test_ledger = dict(ledger)
            test_ledger.update({
                "ledger_path": str(test_ledger_path), "snapshot": {}, "captured_at_ns": time.monotonic_ns(), "arm": None, "dataset": None,
                "install_zip": False, "temp_service": None, "phase_events": [], "undo_entries": [], "test_scope": True,
                "watchdog": {"unit": watch_unit, "state": "installing", "timeout_seconds": 60, "last_heartbeat_ns": time.monotonic_ns(), "helper_path": str(helper_path)},
                "collector": {"unit": None, "scope": "system", "label": None, "path": None, "state": "stopped", "start_ns": None, "service_group": None, "arm": None, "exit_status": None, "exit_error": None},
                "recovery": {"state": "pending", "conflicts": [], "verification": {}, "started_ns": None, "completed_ns": None},
            })
            _write_ledger(test_ledger)
            if stat.S_IMODE(test_ledger_path.stat().st_mode) != 0o600 or test_ledger_path.stat().st_uid != account.pw_uid:
                _fail("disposable watchdog ledger is not user-owned mode 0600")
            _atomic_write(backup_path, original, mode=0o600, owner=(account.pw_uid, account.pw_gid), guard_root=run_root)
            entry = {"kind": "test_file", "state": "pending", "path": str(fixture_path), "original_exists": True, "original_sha256": _sha256_bytes(original), "original_mode": 0o600, "backup_path": str(backup_path), "replacement_sha256": _sha256_bytes(replacement), "replacement_mode": 0o600, "intent_ns": time.monotonic_ns()}
            _append_undo(test_ledger_path, entry)
            temp_entry = {"kind": "temp_unit", "state": "pending", "unit": unit, "scope": "user", "arm": "test", "cgroup": "", "identities": [], "intent_ns": time.monotonic_ns()}
            _append_undo(test_ledger_path, temp_entry)
            _systemd_run("user", account, ["--unit=" + unit, "--collect", "--property=Type=simple", "--property=Restart=no", "--property=KillMode=control-group", "--", "/usr/bin/sleep", "300"], timeout=10)
            group = _systemd_control_group("user", unit, account)
            identities = _identities_for_group(group)
            if not group or not identities or not _systemd_unit_active("user", unit, account):
                _fail("disposable user service fixture did not start with a verifiable cgroup")

            def record_unit(state: dict[str, Any]) -> None:
                for item in state["undo_entries"]:
                    if item["kind"] == "temp_unit" and item["unit"] == unit:
                        item.update({"cgroup": group, "identities": identities})
                        return
                _fail("watchdog fixture has no durable service undo intent")

            _mutate_ledger(test_ledger_path, record_unit)
            source_bytes = Path(ledger["helper_source"]).read_bytes()
            if _sha256_bytes(source_bytes) != ledger["helper_sha256"]:
                _fail("staged benchmark helper changed after capture")
            _install_root_helper(helper_path.parent, helper_path, source_bytes)
            props = ["--unit=" + watch_unit, "--collect", "--property=Type=simple", "--property=Restart=no", "--property=KillMode=control-group", "--property=TimeoutStopSec=5s", "--setenv=BENCHMARK_VM_HELPER_DIR=" + str(Path(ledger["helper_source"]).parent)]
            props.append("--setenv=TMPDIR=" + str(_temp_base()))
            _systemd_run("system", account, props + ["--", sys.executable, str(helper_path), "--internal-watchdog", "--ledger", str(test_ledger_path)], timeout=10)
            if not _wait_until(lambda: _systemd_unit_active("system", watch_unit, account), 5.0, 0.05):
                _fail("disposable root watchdog service did not become active")
            def arm_fixture(state: dict[str, Any]) -> None:
                _mark_watchdog_armed(state)
                state["watchdog"]["timeout_seconds"] = 2
            _mutate_ledger(test_ledger_path, arm_fixture)
            _atomic_write(fixture_path, replacement, mode=0o600, owner=(account.pw_uid, account.pw_gid), guard_root=run_root)
        if not _wait_until(lambda: _load_ledger(test_ledger_path, test_ledger_path)["recovery"]["state"] == "recovered", 20.0, 0.1):
            _fail("real disposable root watchdog did not recover before timeout")
        result = _load_ledger(test_ledger_path, test_ledger_path)
        file_restored = fixture_path.is_file() and stat.S_IMODE(fixture_path.stat().st_mode) == 0o600 and sha256_file(fixture_path) == _sha256_bytes(original)
        unit_drained = not _systemd_unit_active("user", unit, account) and not _pids_in_cgroup(group)
        _system_command(["stop", watch_unit], timeout=5, check=False)
        if _systemd_unit_active("system", watch_unit, account):
            _fail("disposable watchdog did not stop before recovery verification")
        idempotent = _recover_ledger(test_ledger_path, False).get("ok") is True
        ledger_info = test_ledger_path.stat()
        ledger_mode = stat.S_IMODE(ledger_info.st_mode)
        _cleanup_root_helper(result)
        evidence = {"ledger_mode": oct(ledger_mode), "ledger_owner_uid": ledger_info.st_uid, "user_bus_verified": True, "cgroup_drained": unit_drained, "guarded_undo": file_restored, "idempotent_recovery": idempotent, "watchdog_expired": result["recovery"]["state"] == "recovered"}
        if ledger_mode != 0o600 or ledger_info.st_uid != account.pw_uid or not file_restored or not unit_drained or not idempotent or not evidence["watchdog_expired"] or result["recovery"]["conflicts"]:
            _fail("disposable watchdog fixture did not pass all local safety checks")
        return {"ok": True, "evidence": evidence, "ledger": str(test_ledger_path)}
    except Exception as original_error:
        _stop_watchdog_test_setup(prefix, account)
        if test_ledger_path.exists() and not test_ledger_path.is_symlink():
            try:
                recovery = _recover_ledger(test_ledger_path, False)
                if recovery.get("ok"):
                    _cleanup_root_helper(_load_ledger(test_ledger_path, test_ledger_path))
                else:
                    raise SafetyError("watchdog fixture recovery did not verify")
            except Exception as cleanup_error:
                raise SafetyError("watchdog-test failed and disposable recovery remains unresolved") from cleanup_error
        raise original_error


def _dispatch(command: str, ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    if command in {"capture", "recover", "heartbeat", "status", "verify-plugin"}:
        return _dispatch_command(command, ledger_path, payload)
    with _recovery_lock(ledger_path):
        ledger = _load_ledger(ledger_path, ledger_path)
        if ledger["recovery"]["state"] != "pending":
            _fail("recovering or recovered run cannot mutate VM state")
        return _dispatch_command(command, ledger_path, payload)


def _dispatch_command(command: str, ledger_path: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    if command == "capture":
        ledger = _new_ledger(ledger_path, payload)
        return {"ledger": ledger["ledger_path"], "run_root": ledger["run_root"], "scratch_homebrew": ledger["scratch_homebrew"], "captured": True}
    if command == "watchdog-test":
        return _watchdog_test(ledger_path, payload)
    if command == "arm":
        return _arm(ledger_path, payload)
    if command == "heartbeat":
        return _heartbeat(ledger_path, payload)
    if command == "prepare":
        return _prepare(ledger_path, payload)
    if command == "start":
        return _start(ledger_path, payload)
    if command == "verify-plugin":
        exact_keys(payload, set(), context="verify-plugin payload")
        return _verify_plugin(_load_ledger(ledger_path, ledger_path))
    if command == "reload":
        return _reload(ledger_path, payload)
    if command == "collect-start":
        return _collect_start(ledger_path, payload)
    if command == "collect-stop":
        return _collect_stop(ledger_path, payload)
    if command == "phase":
        return _phase(ledger_path, payload)
    if command == "stop":
        return _stop(ledger_path, payload)
    if command == "downloads":
        return _downloads(ledger_path, payload)
    if command == "name-undo":
        return _name_undo(ledger_path, payload)
    if command == "shortcuts":
        return _provision_shortcuts(ledger_path, payload)
    if command == "recover":
        exact_keys(payload, set(), context="recover payload")
        return _recover_ledger(ledger_path, False)
    if command == "status":
        return _status(ledger_path, payload)
    _fail("unknown benchmark VM command")


PUBLIC_COMMANDS = (
    "capture", "watchdog-test", "arm", "heartbeat", "prepare", "start", "verify-plugin", "reload",
    "collect-start", "collect-stop", "phase", "stop", "downloads", "name-undo", "shortcuts", "recover", "status",
)


def main(argv: Sequence[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    if argv and argv[0] == "--internal-watchdog":
        parser = argparse.ArgumentParser(add_help=False)
        parser.add_argument("--internal-watchdog", action="store_true")
        parser.add_argument("--ledger", required=True)
        args = parser.parse_args(list(argv))
        path = _absolute_path(args.ledger, label="ledger")
        try:
            return _watchdog_main(path)
        except SafetyError:
            return 1
    if argv and argv[0] == "--internal-collector":
        parser = argparse.ArgumentParser(add_help=False)
        parser.add_argument("--internal-collector", action="store_true")
        parser.add_argument("--ledger", required=True)
        args = parser.parse_args(list(argv))
        try:
            return _collector_loop(_absolute_path(args.ledger, label="ledger"))
        except SafetyError:
            return 1
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=PUBLIC_COMMANDS)
    parser.add_argument("--ledger", required=True)
    args = parser.parse_args(list(argv))
    ledger_path = _absolute_path(args.ledger, label="ledger")
    try:
        payload = parse_json_object(sys.stdin.buffer.read())
        result = _dispatch(args.command, ledger_path, payload)
        sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
        sys.stdout.flush()
        return 0 if result.get("ok", True) else 1
    except SafetyError as error:
        print(f"benchmark_vm: {error}", file=sys.stderr)
        return 2
    except (OSError, ValueError, TypeError, KeyError, zipfile.BadZipFile):
        print("benchmark_vm: safe VM operation failed", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
