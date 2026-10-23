#!/usr/bin/env python3
"""Run the private original-versus-Rust metadata backend benchmark on a Deck."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shlex
import signal
import statistics
import stat
import subprocess
import sys
import threading
import time
import zipfile
from typing import Any, Mapping, Sequence

try:
    from . import benchmark_vm, cdp
    from .temp_paths import output_path
except ImportError:
    import benchmark_vm  # type: ignore[no-redef]
    import cdp  # type: ignore[no-redef]
    from temp_paths import output_path  # type: ignore[no-redef]


SCRIPT_DIR = Path(__file__).resolve().parent
JS_PATH = SCRIPT_DIR / "js" / "benchmark_backend.js"
REMOTE_HELPER_PATH = SCRIPT_DIR / "benchmark_vm.py"
CDP_PATH = SCRIPT_DIR / "cdp.py"
TEMP_PATHS_PATH = SCRIPT_DIR / "temp_paths.py"
PLUGIN_ROOT = "Decky-Metadata"
PLUGIN_NAME = "Decky Metadata"
NORMAL_HOMEBREW = "/home/deck/homebrew"
USER_NAME = "deck"
PINNED_ORIGINAL_ZIP_SHA256 = "49897d1db6ee0d4a320e570ce561cc8924585bf4bb24c6802696dd46fae54a27"
PINNED_UI_SHA256 = "6388c846e4d112bb369ea0d27874adbd7db5570bcf20cfa091aa330ab86b79ac"
PINNED_UPSTREAM_RUNTIME_SHA256 = "c2cf316a53e1c1d318c6dda8821c827e5db275922987f9097956d7a1576e8258"
PINNED_FORK_BASE_COMMIT = "fa0b26aeb2fd85e92688b8c72396b10176e2cde0"
PINNED_FORK_RUNTIME_EXECUTABLE_SHA256 = "548f4d4c4ed66ca83b8fcd6a660c29b62ce97b996729ad75bd4668de115e231a"
PINNED_FORK_SOURCE_BASELINE = {
    "tag": "v3.3.0",
    "commit": "67196adfa9b299f20dfb0cc932e88a169417b7d5",
    "backend_tree": "6de1145f79df698a456915212a16d0b8c201aeb6",
    "frontend_tree": "e05a98c68e9446f187df3c69cf8fcf2dc865e3c8",
}
SSH_PORT = 22
MEASURED_CALLS_PER_TRIAL = 6450
TRIALS_PER_DATASET_ARM = 5
READ_METHODS = (
    ("get_metadata_hit_serial", 1000),
    ("get_metadata_miss_serial", 1000),
    ("get_missing_metadata_count_serial", 1000),
    ("get_all_metadata_serial", 200),
    ("get_metadata_hit_concurrency_8", 1000),
    ("get_metadata_miss_concurrency_8", 1000),
    ("get_missing_metadata_count_concurrency_8", 1000),
    ("get_all_metadata_concurrency_8", 200),
    ("save_metadata_serial", 50),
)
HOST_RE = re.compile(r"(?:(?:[A-Za-z0-9_.-]+)@)?(?:[A-Za-z0-9_.-]+|\[[0-9A-Fa-f:]+\])\Z")
REMOTE_PATH_CHARS = re.compile(r"/[A-Za-z0-9_./+-]+\Z")
BUNDLE_COMPONENT = re.compile(r"[A-Za-z0-9_.+-]+\Z")


class BenchmarkError(RuntimeError):
    """A benchmark boundary or external operation failed."""


class RemoteCommandError(BenchmarkError):
    def __init__(self, command: str, returncode: int, stderr: str, stdout: str = "") -> None:
        details = f"stderr: {stderr.strip()}" if stderr.strip() else ""
        if stdout.strip():
            details = f"{details}; stdout: {stdout.strip()}" if details else f"stdout: {stdout.strip()}"
        super().__init__(f"remote {command} failed (status {returncode}): {details}")
        self.command = command
        self.returncode = returncode
        self.stderr = stderr
        self.stdout = stdout


class Evidence:
    def __init__(self, root: Path) -> None:
        self.root = root
        self._lock = threading.Lock()
        self.events_path = root / "events.jsonl"

    def write_json(self, name: str, value: Any) -> Path:
        path = self.root / name
        encoded = (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(path, flags, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(path, 0o600)
        return path

    def append(self, event: Mapping[str, Any]) -> None:
        encoded = (json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
        with self._lock:
            fd = os.open(self.events_path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            with os.fdopen(fd, "wb") as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(self.events_path, 0o600)


class RemoteClient:
    def __init__(self, host: str, cdp_port: int, evidence: Evidence) -> None:
        self.host = validate_host(host)
        self.cdp_port = cdp_port
        self.evidence = evidence
        self.run_root: str | None = None
        self.helper: str | None = None
        self.ledger: str | None = None
        self.scratch: str | None = None
        self.inputs: dict[str, str] = {}
        self._command_index = 0
        self._index_lock = threading.Lock()

    def _run(self, argv: Sequence[str], *, input_text: str | None = None, timeout: int = 180) -> subprocess.CompletedProcess[str]:
        try:
            result = subprocess.run(
                list(argv),
                input=input_text,
                text=True,
                capture_output=True,
                timeout=timeout,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise BenchmarkError(f"command failed to run: {argv[0]} ({exc})") from exc
        return result

    def ssh(self, remote_argv: Sequence[str], *, timeout: int = 180) -> str:
        command = ssh_argv(self.host, SSH_PORT, remote_argv)
        result = self._run(command, timeout=timeout)
        if result.returncode:
            raise RemoteCommandError("ssh", result.returncode, result.stderr, result.stdout)
        return result.stdout.strip()

    def allocate_run_root(self) -> str:
        script = "\n".join((
            "import os, re, tempfile",
            "candidate = os.environ.get('TMPDIR', '')",
            "safe = bool(candidate and os.path.isabs(candidate) and '..' not in candidate.split('/') and re.fullmatch(r'/[A-Za-z0-9_./-]+', candidate))",
            "base = candidate if safe and os.path.isdir(candidate) and os.access(candidate, os.W_OK | os.X_OK) else '/var/tmp/omp-1000'",
            "if not os.path.isdir(base) or not os.access(base, os.W_OK | os.X_OK): raise SystemExit('no writable remote temporary root')",
            "path = tempfile.mkdtemp(prefix='metadata-benchmark-', dir=base)",
            "os.chmod(path, 0o700)",
            "print(path)",
        ))
        root = self.ssh(("python3", "-c", script), timeout=30)
        validate_remote_path(root)
        self.run_root = root.rstrip("/")
        self.helper = f"{self.run_root}/tools/benchmark_vm.py"
        self.ledger = f"{self.run_root}/ledger.json"
        return self.run_root

    def initialize_stage_dirs(self) -> None:
        if not self.run_root:
            raise BenchmarkError("remote run root is not allocated")
        self.ssh((
            "python3", "-c",
            "import os,sys; [os.mkdir(p, 0o700) for p in sys.argv[1:]]",
            f"{self.run_root}/inputs", f"{self.run_root}/tools",
        ), timeout=30)

    def scp_to(self, source: Path, remote_path: str, *, recursive: bool = False) -> None:
        validate_remote_path(remote_path)
        if not self.run_root or not remote_path_is_within(remote_path, self.run_root):
            raise BenchmarkError(f"refusing to stage path outside private run root: {remote_path}")
        argv = scp_to_argv(self.host, SSH_PORT, source, remote_path, recursive=recursive)
        result = self._run(argv, timeout=300)
        if result.returncode:
            raise RemoteCommandError("scp-to", result.returncode, result.stderr, result.stdout)

    def scp_from(self, remote_path: str, destination: Path, *, recursive: bool = False) -> None:
        if not self.run_root or not remote_path_is_within(remote_path, self.run_root):
            raise BenchmarkError(f"refusing to retrieve path outside private run root: {remote_path}")
        argv = scp_from_argv(self.host, SSH_PORT, remote_path, destination, recursive=recursive)
        result = self._run(argv, timeout=300)
        if result.returncode:
            raise RemoteCommandError("scp-from", result.returncode, result.stderr, result.stdout)
        os.chmod(destination, 0o600)

    def call(self, command: str, payload: Mapping[str, Any] | None = None, *, timeout: int = 180) -> dict[str, Any]:
        if not self.run_root or not self.helper or not self.ledger:
            raise BenchmarkError("remote helper is not staged")
        request = json.dumps(payload or {}, ensure_ascii=False, separators=(",", ":"))
        remote_args = ("sudo", "-n", "env", f"TMPDIR={PurePosixPath(self.run_root).parent}", "PYTHONDONTWRITEBYTECODE=1", "python3", self.helper, command, "--ledger", self.ledger)
        argv = ssh_argv(self.host, SSH_PORT, remote_args)
        result = self._run(argv, input_text=request + "\n", timeout=timeout)
        with self._index_lock:
            self._command_index += 1
            command_index = self._command_index
        self.evidence.append({
            "kind": "remote-command",
            "index": command_index,
            "command": command,
            "payload": payload or {},
            "returncode": result.returncode,
            "stderr": result.stderr,
            "stdout": result.stdout,
        })
        if result.returncode:
            raise RemoteCommandError(command, result.returncode, result.stderr, result.stdout)
        try:
            value = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise BenchmarkError(f"remote {command} did not return exactly one JSON result") from exc
        if not isinstance(value, dict):
            raise BenchmarkError(f"remote {command} result must be a JSON object")
        self.evidence.append({"kind": "remote-result", "command": command, "result": value})
        return value

    def retrieve_ledger(self, filename: str) -> None:
        if self.ledger:
            self.scp_from(self.ledger, self.evidence.root / filename)


class Lease:
    def __init__(self, remote: RemoteClient, evidence: Evidence) -> None:
        self.remote = remote
        self.evidence = evidence
        self._stop = threading.Event()
        self._failure: BaseException | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is not None:
            raise BenchmarkError("heartbeat lease already started")
        self._thread = threading.Thread(target=self._run, name="metadata-benchmark-heartbeat", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        while not self._stop.wait(5):
            try:
                result = self.remote.call("heartbeat", {}, timeout=10)
                if result.get("lease_active") is not True:
                    raise BenchmarkError("remote heartbeat did not confirm the watchdog lease")
            except BaseException as exc:
                self._failure = exc
                self.evidence.append({"kind": "heartbeat-error", "error": str(exc)})
                self._stop.set()
                return

    def check(self) -> None:
        if self._failure is not None:
            raise BenchmarkError(f"remote watchdog heartbeat failed: {self._failure}") from self._failure

    def close(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join()
        self.check()


def validate_host(host: str) -> str:
    if not HOST_RE.fullmatch(host) or host.startswith("-"):
        raise ValueError("--host must be a plain SSH host/alias, optionally user@host")
    if host.count("@") > 1 or host.endswith("@"):
        raise ValueError("--host has an invalid SSH user/host form")
    return host


def validate_port(port: int) -> int:
    if not 1 <= port <= 65535:
        raise ValueError("--cdp-port must be between 1 and 65535")
    return port


def _validate_ssh_port(port: int) -> int:
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        raise ValueError("invalid SSH port")
    return port


def ssh_argv(host: str, port: int, remote_argv: Sequence[str]) -> list[str]:
    destination = validate_host(host)
    if not remote_argv:
        raise ValueError("empty remote command")
    return ["ssh", "-T", "-p", str(_validate_ssh_port(port)), "--", destination, shlex.join([str(value) for value in remote_argv])]


def scp_to_argv(host: str, port: int, source: Path, remote_path: str, *, recursive: bool = False) -> list[str]:
    destination = validate_host(host)
    validate_remote_path(remote_path)
    port = _validate_ssh_port(port)
    argv = ["scp", "-p"]
    if recursive:
        argv.append("-r")
    argv.extend(("-P", str(port), "--", str(source), f"{destination}:{remote_path}"))
    return argv


def scp_from_argv(host: str, port: int, remote_path: str, destination: Path, *, recursive: bool = False) -> list[str]:
    host_value = validate_host(host)
    validate_remote_path(remote_path)
    port = _validate_ssh_port(port)
    argv = ["scp", "-p"]
    if recursive:
        argv.append("-r")
    argv.extend(("-P", str(port), "--", f"{host_value}:{remote_path}", str(destination)))
    return argv


def validate_remote_path(value: str) -> str:
    if not REMOTE_PATH_CHARS.fullmatch(value) or ".." in PurePosixPath(value).parts:
        raise ValueError(f"unsafe remote staging path: {value!r}")
    return value


def remote_path_is_within(value: str, root: str) -> bool:
    try:
        path = PurePosixPath(validate_remote_path(value))
        parent = PurePosixPath(validate_remote_path(root))
    except ValueError:
        return False
    return path != parent and parent in path.parents


def safe_relative_scratch(value: str) -> str:
    path = PurePosixPath(value)
    if path.is_absolute() or not path.parts or any(part in ("", ".", "..") for part in path.parts):
        raise ValueError("--scratch-homebrew must be a relative path inside the per-run remote root")
    if any(not BUNDLE_COMPONENT.fullmatch(part) for part in path.parts):
        raise ValueError("--scratch-homebrew contains an unsafe path component")
    if path.parts[0] in ("inputs", "tools"):
        raise ValueError("--scratch-homebrew must be separate from staged benchmark inputs")
    return str(path)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _checked_local_file(value: str | Path, label: str) -> Path:
    path = Path(value).expanduser()
    try:
        info = path.lstat()
        resolved = path.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"{label} is unavailable: {path}") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or resolved != path.absolute():
        raise ValueError(f"{label} must be a regular non-symlink file: {path}")
    return resolved


def _safe_zip_name(name: str) -> bool:
    if not name or name.startswith("/") or "\\" in name or "\x00" in name:
        return False
    parts = name.split("/")
    if parts[-1] == "":
        parts.pop()
    return bool(parts) and all(part not in {"", ".", ".."} for part in parts)


def _elf_x86_64(data: bytes) -> bool:
    return (
        len(data) >= 20
        and data[:4] == b"\x7fELF"
        and data[4] == 2
        and data[5] == 1
        and int.from_bytes(data[18:20], "little") == 62
    )


def validate_shim_parity(packaged: bytes, pinned: bytes) -> None:
    if not packaged or packaged != pinned:
        raise ValueError("Rust ZIP does not contain the pinned upstream native-backend shim")


def _zip_entry_mode(info: zipfile.ZipInfo) -> int:
    return (info.external_attr >> 16) & 0o777


def _plugin_archive(path: Path, label: str) -> dict[str, Any]:
    try:
        archive = zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile) as exc:
        raise ValueError(f"{label} is not a readable ZIP archive") from exc
    with archive:
        names = [item.filename for item in archive.infolist()]
        if len(names) != len(set(names)) or any(not _safe_zip_name(name) for name in names):
            raise ValueError(f"{label} contains duplicate or unsafe archive paths")
        for info in archive.infolist():
            mode = (info.external_attr >> 16) & 0o170000
            is_directory = info.is_dir() or info.filename.endswith("/")
            if (mode not in {0, stat.S_IFREG, stat.S_IFDIR} or
                    (is_directory and mode not in {0, stat.S_IFDIR}) or
                    (not is_directory and mode not in {0, stat.S_IFREG})):
                raise ValueError(f"{label} contains a symbolic link or special file")
        try:
            bad = archive.testzip()
        except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
            raise ValueError(f"{label} failed its ZIP integrity check") from exc
        if bad is not None:
            raise ValueError(f"{label} has a corrupt member: {bad}")
        manifests = [name for name in names if PurePosixPath(name).name == "plugin.json"]
        if len(manifests) != 1:
            raise ValueError(f"{label} must contain exactly one plugin.json")
        plugin_path = PurePosixPath(manifests[0])
        if plugin_path.parent.as_posix() != PLUGIN_ROOT:
            raise ValueError(f"{label} plugin root must be {PLUGIN_ROOT}")
        root = str(plugin_path.parent)
        package_path = f"{root}/package.json"
        ui_path = f"{root}/dist/index.js"
        shim_path = f"{root}/main.py"
        if any(member not in names for member in (package_path, ui_path, shim_path)):
            raise ValueError(f"{label} is missing its package manifest, shim or dist/index.js")
        try:
            plugin_manifest = json.loads(archive.read(manifests[0]))
            package_manifest = json.loads(archive.read(package_path))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError(f"{label} has an invalid JSON manifest") from exc
        if not isinstance(plugin_manifest, dict) or not isinstance(package_manifest, dict):
            raise ValueError(f"{label} manifests must be JSON objects")
        if plugin_manifest.get("name") != PLUGIN_NAME or plugin_manifest.get("api_version") != 1:
            raise ValueError(f"{label} plugin identity does not match Decky Metadata")
        version = plugin_manifest.get("version")
        if not isinstance(version, str) or not version or package_manifest.get("version") != version:
            raise ValueError(f"{label} plugin/package versions do not match")
        ui = archive.read(ui_path)
        shim = archive.read(shim_path)
        if not ui or not shim:
            raise ValueError(f"{label} frontend or backend shim is empty")
        result: dict[str, Any] = {
            "zip_sha256": sha256_file(path),
            "ui_sha256": sha256_bytes(ui),
            "ui_bytes": ui,
            "shim_sha256": sha256_bytes(shim),
            "shim_bytes": shim,
            "version": version,
            "plugin_root": root,
            "plugin_manifest": plugin_manifest,
            "members": names,
        }
        backend = plugin_manifest.get("backend")
        if backend is not None:
            if backend != "bin/backend":
                raise ValueError(f"{label} backend path must be bin/backend")
            member = f"{root}/bin/backend"
            if member not in names:
                raise ValueError(f"{label} backend member is missing")
            backend_info = archive.getinfo(member)
            backend_data = archive.read(member)
            mode_bits = _zip_entry_mode(backend_info)
            if mode_bits != 0o755 or not _elf_x86_64(backend_data):
                raise ValueError(f"{label} backend must be an executable x86-64 ELF binary")
            result["backend_path"] = member
            result["backend_sha256"] = sha256_bytes(backend_data)
            result["backend_mode"] = mode_bits
        return result

def validate_ui_parity(original: Mapping[str, Any], candidate: Mapping[str, Any]) -> None:
    if original.get("ui_bytes") != candidate.get("ui_bytes") or \
            original.get("ui_sha256") != candidate.get("ui_sha256"):
        raise ValueError("original and Rust ZIP dist/index.js bytes differ")


def _safe_bundle_tree(root: Path) -> tuple[dict[str, Any], str, str]:
    try:
        root_info = root.lstat()
        resolved = root.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"fork runtime bundle is unavailable: {root}") from exc
    if stat.S_ISLNK(root_info.st_mode) or not stat.S_ISDIR(root_info.st_mode) or resolved != root.absolute():
        raise ValueError("--fork-runtime must name a regular non-symlink bundle directory")
    manifest_path = root / "bundle.json"
    try:
        manifest_info = manifest_path.lstat()
        if stat.S_ISLNK(manifest_info.st_mode) or not stat.S_ISREG(manifest_info.st_mode):
            raise ValueError("fork runtime bundle manifest must be a regular non-symlink file")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("fork runtime bundle.json is missing or invalid") from exc
    source = manifest.get("source_baseline") if isinstance(manifest, dict) else None
    build = manifest.get("build") if isinstance(manifest, dict) else None
    executable_name = manifest.get("rust_executable") if isinstance(manifest, dict) else None
    if (not isinstance(manifest, dict) or manifest.get("kind") != "decky-loader-runtime" or
            manifest.get("release_version") != "dev" or manifest.get("worker_packaging") != "onedir" or
            executable_name != "decky-loader-runtime" or source != PINNED_FORK_SOURCE_BASELINE or
            not isinstance(build, Mapping) or build.get("base_commit") != PINNED_FORK_BASE_COMMIT):
        raise ValueError("fork runtime bundle has the wrong pinned source provenance")
    executable_rel = PurePosixPath(executable_name)
    entries: list[tuple[str, Path | None, int, bool]] = [
        ("", None, stat.S_IMODE(root.lstat().st_mode), True),
    ]
    actual_files: set[str] = set()
    for directory, dirnames, filenames in os.walk(root, followlinks=False):
        directory_path = Path(directory)
        for name in sorted(dirnames + filenames):
            entry = directory_path / name
            relative = entry.relative_to(root).as_posix()
            info = entry.lstat()
            if not BUNDLE_COMPONENT.fullmatch(name) or stat.S_ISLNK(info.st_mode):
                raise ValueError(f"fork runtime bundle contains an unsafe or linked entry: {relative}")
            if stat.S_ISDIR(info.st_mode):
                entries.append((relative, None, stat.S_IMODE(info.st_mode), True))
                continue
            if not stat.S_ISREG(info.st_mode):
                raise ValueError(f"fork runtime bundle contains a non-regular file: {relative}")
            entries.append((relative, entry, stat.S_IMODE(info.st_mode), False))
            if relative != "bundle.json":
                actual_files.add(relative)
    declared = manifest.get("sha256")
    if not isinstance(declared, Mapping) or not declared:
        raise ValueError("fork runtime bundle has no verified payload inventory")
    declared_files: set[str] = set()
    for relative, expected_hash in declared.items():
        if not isinstance(relative, str) or "\\" in relative or "\x00" in relative:
            raise ValueError("fork runtime manifest contains an unsafe payload path")
        path = PurePosixPath(relative)
        if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
            raise ValueError("fork runtime manifest contains a payload path traversal")
        if any(not BUNDLE_COMPONENT.fullmatch(part) for part in path.parts):
            raise ValueError("fork runtime manifest contains an unsafe payload component")
        target = root.joinpath(*path.parts)
        try:
            info = target.lstat()
        except OSError as exc:
            raise ValueError("fork runtime bundle is missing a declared payload") from exc
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
            raise ValueError("fork runtime payload is not a regular file")
        if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
            raise ValueError("fork runtime payload digest is invalid")
        if sha256_file(target) != expected_hash:
            raise ValueError("fork runtime payload digest does not match its manifest")
        declared_files.add(relative)
    if declared_files != actual_files:
        raise ValueError("fork runtime payload inventory is incomplete or contains unlisted files")
    digest = hashlib.sha256()
    for relative, entry, mode, is_dir in sorted(entries):
        digest.update(relative.encode("utf-8") + b"\0")
        digest.update(b"d" if is_dir else b"f")
        digest.update(f"{mode:04o}".encode("ascii") + b"\0")
        if entry is not None:
            digest.update(bytes.fromhex(sha256_file(entry)))
    runtime = root.joinpath(*executable_rel.parts)
    try:
        runtime_info = runtime.lstat()
    except OSError as exc:
        raise ValueError("fork runtime executable is missing") from exc
    if (not stat.S_ISREG(runtime_info.st_mode) or not runtime_info.st_mode & 0o111 or
            sha256_file(runtime) != PINNED_FORK_RUNTIME_EXECUTABLE_SHA256):
        raise ValueError("fork runtime executable does not match the pinned Loader build")
    for required in ("DeckyPluginWorker", "assets", "locales"):
        item = root / required
        if not item.exists() or item.is_symlink() or (required == "DeckyPluginWorker" and not item.is_file()) or \
                (required != "DeckyPluginWorker" and not item.is_dir()):
            raise ValueError("fork runtime bundle is missing its full worker/assets/locales payload")
    if not (root / "DeckyPluginWorker").stat().st_mode & 0o111:
        raise ValueError("fork runtime worker is not executable")
    return manifest, digest.hexdigest(), sha256_file(runtime)


def _check_runtime_file(value: str | Path) -> tuple[Path, str]:
    path = _checked_local_file(value, "upstream runtime")
    if not path.stat().st_mode & 0o111:
        raise ValueError("--upstream-runtime must be executable")
    return path, sha256_file(path)


def load_local_artifacts(args: argparse.Namespace) -> dict[str, Any]:
    python_zip = _checked_local_file(args.python_zip, "original ZIP")
    rust_zip = _checked_local_file(args.rust_zip, "Rust ZIP")
    upstream_path, upstream_hash = _check_runtime_file(args.upstream_runtime)
    if upstream_hash != PINNED_UPSTREAM_RUNTIME_SHA256:
        raise ValueError("upstream runtime is not the pinned PluginLoader executable")
    fork_path = Path(args.fork_runtime).expanduser()
    fork_manifest, fork_hash, fork_loader_hash = _safe_bundle_tree(fork_path)
    python_package = _plugin_archive(python_zip, "original ZIP")
    rust_package = _plugin_archive(rust_zip, "Rust ZIP")
    if python_package["zip_sha256"] != PINNED_ORIGINAL_ZIP_SHA256:
        raise ValueError("original ZIP is not the pinned GUI-verified artifact")
    if python_package["ui_sha256"] != PINNED_UI_SHA256:
        raise ValueError("original ZIP UI bundle is not the pinned baseline")
    if "backend_path" in python_package:
        raise ValueError("original Python ZIP unexpectedly contains a native backend")
    validate_ui_parity(python_package, rust_package)
    backend_path = rust_package.get("backend_path")
    if backend_path != f"{PLUGIN_ROOT}/bin/backend" or rust_package.get("backend_mode") != 0o755:
        raise ValueError("Rust ZIP must package the x86-64 executable as bin/backend mode 0755")
    try:
        pinned_shim = (SCRIPT_DIR.parents[1] / "main.py").read_bytes()
    except OSError as exc:
        raise ValueError("pinned upstream native-backend shim source is unavailable") from exc
    validate_shim_parity(rust_package["shim_bytes"], pinned_shim)
    missing = [str(path) for path in (REMOTE_HELPER_PATH, CDP_PATH, TEMP_PATHS_PATH, JS_PATH) if not path.is_file()]
    if missing:
        raise ValueError("benchmark sources are unavailable: " + ", ".join(missing))
    return {
        "python_zip": python_zip,
        "rust_zip": rust_zip,
        "upstream_runtime": upstream_path,
        "fork_runtime": fork_path.resolve(strict=True),
        "python_package": python_package,
        "rust_package": rust_package,
        "fork_manifest": fork_manifest,
        "hashes": {
            "python_zip_sha256": python_package["zip_sha256"],
            "rust_zip_sha256": rust_package["zip_sha256"],
            "ui_sha256": python_package["ui_sha256"],
            "rust_binary_sha256": rust_package["backend_sha256"],
            "upstream_runtime_sha256": upstream_hash,
            "fork_runtime_sha256": fork_hash,
            "fork_runtime_executable_sha256": fork_loader_hash,
            "fork_binary_sha256": rust_package["backend_sha256"],
        },
    }


def build_fixture_record(index: int) -> dict[str, Any]:
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
        "steam_store_state": "unknown",
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


def fixture_settings() -> dict[str, Any]:
    return {
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
    }


def validate_fixture_data(fixture: Mapping[str, Any], size: int) -> None:
    if not isinstance(fixture, Mapping) or size not in (100, 1000) or \
            fixture.get("release_date_format") != "date-only-v1":
        raise ValueError("fixture has an unsupported size or release-date contract")
    if set(fixture) != {
        "release_date_format", "metadata", "shortcut_names", "settings",
        "update_settings", "update_check_cache",
    }:
        raise ValueError("fixture contains unrelated Metadata state")
    expected_keys = [str(2147483648 + index) for index in range(size)]
    metadata = fixture.get("metadata")
    if not isinstance(metadata, Mapping) or list(metadata) != expected_keys:
        raise ValueError("fixture metadata keys are not the deterministic unsigned ID sequence")
    missing = 0
    for index, key in enumerate(expected_keys):
        record = metadata[key]
        expected = build_fixture_record(index)
        if not isinstance(record, Mapping) or record != expected:
            raise ValueError(f"fixture metadata record {key} was altered or lost sanitizer-preserved rows")
        missing += not bool(expected["description"])
    if missing != size // 4:
        raise ValueError(f"fixture missing-description count is {missing}, expected {size // 4}")
    if fixture.get("settings") != fixture_settings():
        raise ValueError("fixture disables or changes unexpected Metadata settings")
    if fixture.get("update_settings") != {"automatic_update_checks": False}:
        raise ValueError("fixture must disable only Metadata automatic update checks")
    if fixture.get("shortcut_names") != {} or fixture.get("update_check_cache") != {}:
        raise ValueError("fixture contains unrelated Metadata state")


def build_fixture(size: int) -> dict[str, Any]:
    if size not in (100, 1000):
        raise ValueError("fixture size must be 100 or 1000")
    fixture = {
        "release_date_format": "date-only-v1",
        "metadata": {str(2147483648 + index): build_fixture_record(index) for index in range(size)},
        "shortcut_names": {},
        "settings": fixture_settings(),
        "update_settings": {"automatic_update_checks": False},
        "update_check_cache": {},
    }
    validate_fixture_data(fixture, size)
    return fixture


def fixture_bytes(size: int) -> bytes:
    return (json.dumps(build_fixture(size), ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def trial_order() -> list[tuple[str, int, int]]:
    return [
        (arm, size, trial)
        for size in (100, 1000)
        for trial in range(1, TRIALS_PER_DATASET_ARM + 1)
        for arm in ("A", "B", "C")
    ]


def reload_order() -> list[tuple[str, int]]:
    return [(arm, number) for number in range(1, 11) for arm in ("A", "B", "C")]


def _validate_trial_run_ids(trials: Sequence[Mapping[str, Any]], *, required: bool = False) -> str | None:
    run_ids = [trial.get("run_id") for trial in trials]
    if required and any(not isinstance(run_id, str) or not run_id for run_id in run_ids):
        raise ValueError("trial is missing its benchmark run-directory identity")
    present = {run_id for run_id in run_ids if run_id is not None}
    if len(present) > 1 or present and len(present) != len(run_ids):
        raise ValueError("summary cannot mix trial files from different run directories")
    return next(iter(present), None)


def _arm_verification(arm: str, hashes: Mapping[str, str]) -> dict[str, Any]:
    return {
        "verified": True,
        "zip_sha256": hashes["python_zip_sha256"] if arm == "A" else hashes["rust_zip_sha256"],
        "ui_sha256": hashes["ui_sha256"],
        "loader_runtime_sha256": hashes["upstream_runtime_sha256"] if arm in ("A", "B") else hashes["fork_runtime_executable_sha256"],
        "rust_binary_sha256": None if arm == "A" else hashes["rust_binary_sha256"],
        "fork_binary_sha256": None if arm == "A" else hashes["fork_binary_sha256"],
        "fork_runtime_sha256": None if arm != "C" else hashes["fork_runtime_sha256"],
    }


def validate_verification_record(path: str | Path, hashes: Mapping[str, str]) -> dict[str, Any]:
    record_path = _checked_local_file(path, "GUI verification record")
    try:
        record = json.loads(record_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("GUI verification record is not valid JSON") from exc
    if not isinstance(record, dict) or record.get("schema") != 1 or record.get("verified_arms") != ["A", "B", "C"]:
        raise ValueError("GUI verification record must verify arms A, B and C in order")
    recorded_hashes = record.get("hashes")
    expected_hashes = dict(hashes)
    if not isinstance(recorded_hashes, dict) or set(recorded_hashes) != set(expected_hashes) or \
            any(recorded_hashes.get(key) != value for key, value in expected_hashes.items()):
        raise ValueError("GUI verification record hashes do not match the exact ZIP, UI and runtime inputs")
    arms = record.get("arms")
    if not isinstance(arms, dict) or set(arms) != {"A", "B", "C"}:
        raise ValueError("GUI verification record must contain per-arm verification evidence")
    for arm in ("A", "B", "C"):
        entry = arms[arm]
        expected_arm = _arm_verification(arm, hashes)
        if not isinstance(entry, dict) or any(entry.get(key) != value for key, value in expected_arm.items()):
            raise ValueError(f"GUI verification record for arm {arm} does not match its ZIP/runtime/binary")
    return record


def expected_workload_counts() -> dict[str, int]:
    return dict(READ_METHODS)


def validate_workload_result(result: Mapping[str, Any], size: int) -> dict[str, Any]:
    if not isinstance(result, Mapping):
        raise ValueError("browser workload result is not an object")
    if result.get("ok") is not True or result.get("schema") != 1 or result.get("datasetSize") != size:
        raise ValueError("browser workload failed its schema, dataset or success assertion")
    if result.get("missing") != size // 4 or result.get("warmupCalls") != 400 or \
            result.get("expectedMeasuredCalls") != MEASURED_CALLS_PER_TRIAL:
        raise ValueError("browser workload reported the wrong fixture or warmup counts")
    if not isinstance(result.get("errors"), list) or result["errors"]:
        raise ValueError("browser workload contains RPC, validation or observer errors")
    measurements = result.get("measurements")
    if not isinstance(measurements, Mapping) or set(measurements) != set(expected_workload_counts()):
        raise ValueError("browser workload omitted or added measured methods")
    expected_counts = expected_workload_counts()
    all_samples: list[float] = []
    per_method: dict[str, Any] = {}
    wall_total = 0.0
    for name, count in expected_counts.items():
        entry = measurements[name]
        if not isinstance(entry, Mapping) or entry.get("count") != count or entry.get("completedCalls") != count:
            raise ValueError(f"{name} did not complete exactly {count} measured calls")
        start_ms, end_ms = entry.get("startMs"), entry.get("endMs")
        if any(not isinstance(value, (int, float)) or isinstance(value, bool) or
               not math.isfinite(value) for value in (start_ms, end_ms)) or start_ms < 0 or end_ms <= start_ms:
            raise ValueError(f"{name} has no valid browser-clock workload window")
        description = entry.get("description")
        if name.endswith("_concurrency_8") and description != "batches of 8, barrier per batch":
            raise ValueError(f"{name} does not identify its batch-of-8 barrier mode")
        samples = entry.get("samplesMs")
        wall_ms = entry.get("wallMs")
        if not isinstance(samples, list) or len(samples) != count:
            raise ValueError(f"{name} did not retain all {count} latency samples")
        if not isinstance(wall_ms, (int, float)) or isinstance(wall_ms, bool) or \
                not math.isfinite(wall_ms) or wall_ms <= 0:
            raise ValueError(f"{name} has no valid wall-time interval")
        if any(not isinstance(value, (int, float)) or isinstance(value, bool) or
               not math.isfinite(value) or value < 0 for value in samples):
            raise ValueError(f"{name} has an invalid latency sample")
        values = [float(value) for value in samples]
        throughput = entry.get("throughputCallsPerSecond")
        expected_throughput = count * 1000.0 / float(wall_ms)
        if not isinstance(throughput, (int, float)) or isinstance(throughput, bool) or \
                not math.isfinite(throughput) or not math.isclose(float(throughput), expected_throughput, rel_tol=1e-9):
            raise ValueError(f"{name} throughput does not use its validation-inclusive wall time")
        all_samples.extend(values)
        wall_total += float(wall_ms)
        per_method[name] = {
            "sample_count": count,
            "median_ms": statistics.median(values),
            "p95_ms": percentile(values, 0.95),
            "p99_ms": percentile(values, 0.99),
            "wall_ms_including_validation": float(wall_ms),
            "start_ms": float(start_ms),
            "end_ms": float(end_ms),
            "description": description,
            "throughput_calls_per_second_including_validation": float(throughput),
        }
    if result.get("sampleCalls") != MEASURED_CALLS_PER_TRIAL or result.get("completedCalls") != MEASURED_CALLS_PER_TRIAL:
        raise ValueError("browser workload did not retain and complete all 6,450 measured calls")
    if len(all_samples) != MEASURED_CALLS_PER_TRIAL:
        raise ValueError("browser workload sample total is not 6,450")
    return {
        "sample_count": len(all_samples),
        "median_ms": statistics.median(all_samples),
        "p95_ms": percentile(all_samples, 0.95),
        "p99_ms": percentile(all_samples, 0.99),
        "completed_calls": MEASURED_CALLS_PER_TRIAL,
        "workload_wall_ms_including_validation": wall_total,
        "throughput_calls_per_second_including_validation": MEASURED_CALLS_PER_TRIAL * 1000.0 / wall_total,
        "methods": per_method,
        "throughput_definition": "completed calls divided by workload wall time including result validation",
    }


def percentile(values: Sequence[float], quantile: float) -> float:
    if not values or not 0 < quantile <= 1:
        raise ValueError("percentile requires samples and a quantile in (0, 1]")
    ordered = sorted(values)
    return ordered[math.ceil(quantile * len(ordered)) - 1]


def aggregate_trials(trials: Sequence[Mapping[str, Any]], arm: str, size: int) -> dict[str, Any]:
    selected = [trial for trial in trials if trial.get("arm") == arm and trial.get("dataset_size") == size]
    if len(selected) != TRIALS_PER_DATASET_ARM:
        raise ValueError(f"{arm}-{size} requires exactly five complete trials")
    run_id = _validate_trial_run_ids(selected)
    per_trial = [validate_workload_result(trial["workload"], size) for trial in selected]
    method_names = set(per_trial[0]["methods"])
    methods: dict[str, Any] = {}
    for name in method_names:
        samples = [
            float(sample)
            for trial in selected
            for sample in trial["workload"]["measurements"][name]["samplesMs"]
        ]
        wall_ms = sum(float(trial["workload"]["measurements"][name]["wallMs"]) for trial in selected)
        count = sum(int(trial["workload"]["measurements"][name]["completedCalls"]) for trial in selected)
        methods[name] = {
            "sample_count": len(samples),
            "completed_calls": count,
            "median_ms": statistics.median(samples),
            "p95_ms": percentile(samples, 0.95),
            "p99_ms": percentile(samples, 0.99),
            "wall_ms_including_validation": wall_ms,
            "throughput_calls_per_second_including_validation": count * 1000.0 / wall_ms,
            "description": per_trial[0]["methods"][name]["description"],
        }
    startups = [float(trial["startup"]["elapsed_ms"]) for trial in selected]
    first_plugin_rpcs = [float(trial["first_plugin_rpc"]["elapsedMs"]) for trial in selected]
    readiness = _statistics_for(startups)
    first_rpc = _statistics_for(first_plugin_rpcs)
    return {
        "arm": arm,
        "dataset_size": size,
        "run_id": run_id,
        "trials": len(selected),
        "measured_calls": sum(item["completed_calls"] for item in per_trial),
        "methods": methods,
        "authenticated_backend_readiness_ms": {
            **readiness,
            "poll_resolution_ms": 10,
            "method": "VM-local authenticated Decky Loader WebSocket get_plugin_version reply",
        },
        "first_plugin_scoped_ui_rpc_ms": first_rpc,
    }


def validate_remote_verification(result: Mapping[str, Any], arm: str, hashes: Mapping[str, str]) -> None:
    if result.get("arm") != arm:
        raise BenchmarkError(f"remote verify-plugin selected {result.get('arm')!r}, expected arm {arm}")
    actual = result.get("hashes")
    expected = {
        "python_zip_sha256": hashes["python_zip_sha256"],
        "rust_zip_sha256": hashes["rust_zip_sha256"],
        "ui_sha256": hashes["ui_sha256"],
        "rust_binary_sha256": hashes["rust_binary_sha256"],
        "loader_runtime_sha256": hashes["upstream_runtime_sha256"] if arm in ("A", "B") else hashes["fork_runtime_executable_sha256"],
        "fork_binary_sha256": None if arm == "A" else hashes["fork_binary_sha256"],
    }
    if not isinstance(actual, Mapping) or set(actual) != set(expected) or \
            any(actual.get(key) != value for key, value in expected.items()):
        raise BenchmarkError(f"remote verify-plugin hashes do not match arm {arm} inputs")


def _hashes_for_capture(artifacts: Mapping[str, Any]) -> dict[str, str]:
    return dict(artifacts["hashes"])


def check_observer_stable(before: Mapping[str, Any], after: Mapping[str, Any]) -> None:
    _check_observer_state(before)
    _check_observer_state(after)
    keys = ("updateStarted", "updateCompleted", "catalogStarted", "catalogCompleted")
    if any(before.get(key) != after.get(key) for key in keys):
        raise BenchmarkError("Loader update/catalog activity overlapped a benchmark preparation phase")
    if before.get("updateErrors") or after.get("updateErrors") or \
            before.get("catalogErrors") or after.get("catalogErrors"):
        raise BenchmarkError("Loader update/catalog observer recorded an error")


def combine_cleanup_failure(primary: BaseException | None, cleanup: BaseException | None) -> BaseException | None:
    if primary is None:
        return cleanup
    if cleanup is None:
        return primary
    return BenchmarkError(f"benchmark failed: {primary}; verified recovery failed: {cleanup}")


def _write_fixture_files(output: Path, fixture_payloads: Mapping[int, bytes]) -> tuple[dict[int, str], dict[int, Path]]:
    fixture_hashes: dict[int, str] = {}
    fixture_paths: dict[int, Path] = {}
    for size in (100, 1000):
        payload = fixture_payloads[size]
        digest = sha256_bytes(payload)
        path = output / f"fixture-{size}.json"
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        fixture_hashes[size] = digest
        fixture_paths[size] = path
    return fixture_hashes, fixture_paths


def _stage_fixture_files(remote: RemoteClient, fixture_paths: Mapping[int, Path]) -> None:
    for size, path in fixture_paths.items():
        remote.scp_to(path, f"{remote.run_root}/inputs/fixture-{size}.json")


def _stage(remote: RemoteClient, artifacts: Mapping[str, Any], scratch_relative: str) -> None:
    run_root = remote.allocate_run_root()
    remote.initialize_stage_dirs()
    for name, source in (
        ("benchmark_vm.py", REMOTE_HELPER_PATH),
        ("cdp.py", CDP_PATH),
        ("temp_paths.py", TEMP_PATHS_PATH),
    ):
        remote.scp_to(source, f"{run_root}/tools/{name}")
    for name, source in (
        ("python.zip", artifacts["python_zip"]),
        ("rust.zip", artifacts["rust_zip"]),
        ("upstream-runtime", artifacts["upstream_runtime"]),
    ):
        remote.scp_to(source, f"{run_root}/inputs/{name}")
    remote.scp_to(artifacts["fork_runtime"], f"{run_root}/inputs/fork_runtime", recursive=True)
    remote.inputs = {
        "python_zip": f"{run_root}/inputs/python.zip",
        "rust_zip": f"{run_root}/inputs/rust.zip",
        "upstream_runtime": f"{run_root}/inputs/upstream-runtime",
        "fork_runtime": f"{run_root}/inputs/fork_runtime",
    }
    remote.scratch = f"{run_root}/{scratch_relative}"


def _capture(remote: RemoteClient, artifacts: Mapping[str, Any]) -> dict[str, Any]:
    package_python = artifacts["python_package"]
    package_rust = artifacts["rust_package"]
    result = remote.call("capture", {
        "run_root": remote.run_root,
        "scratch_homebrew": remote.scratch,
        "normal_homebrew": NORMAL_HOMEBREW,
        "user_name": USER_NAME,
        "unit_prefix": f"decky-metadata-benchmark-{os.urandom(8).hex()}",
        "inputs": remote.inputs,
        "expected": {
            "python_zip_sha256": package_python["zip_sha256"],
            "rust_zip_sha256": package_rust["zip_sha256"],
            "ui_sha256": package_python["ui_sha256"],
            "rust_binary_sha256": package_rust["backend_sha256"],
            "python_version": package_python["version"],
            "rust_version": package_rust["version"],
        },
    })
    if result.get("captured") is not True or result.get("run_root") != remote.run_root or \
            result.get("ledger") != remote.ledger or result.get("scratch_homebrew") != remote.scratch:
        raise BenchmarkError("remote capture did not bind the expected private root, scratch and ledger")
    return result


def _ensure_tool_success(command: str, result: Mapping[str, Any]) -> None:
    if result.get("ok") is not True:
        raise BenchmarkError(f"remote {command} did not confirm success")


def _js_source() -> str:
    try:
        return JS_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        raise BenchmarkError(f"benchmark JavaScript is unavailable: {JS_PATH}") from exc


def cdp_command(command: str, params: Mapping[str, Any] | None = None) -> Any:
    source = _js_source()
    if source.count("__BENCHMARK_COMMAND__") != 1 or source.count("__BENCHMARK_PARAMS__") != 1:
        raise BenchmarkError("benchmark JavaScript command placeholders are not unique")
    expression = source.replace("__BENCHMARK_COMMAND__", json.dumps(command))
    expression = expression.replace("__BENCHMARK_PARAMS__", json.dumps(params or {}, ensure_ascii=False, separators=(",", ":")))
    timeout = 1800 if command in {"run_workload", "warmup"} else 200 if command == "wait_startup_quiescence" else 45
    try:
        response = cdp.evaluate("SharedJSContext", expression, timeout=timeout)
    except (Exception, SystemExit) as exc:
        raise BenchmarkError(f"CDP command {command} failed: {exc}") from exc
    if isinstance(response, Mapping) and response.get("type") == "string":
        response = response.get("value")
    if not isinstance(response, str):
        raise BenchmarkError(f"CDP command {command} returned no JSON string: {repr(response)[:2000]}")
    try:
        return json.loads(response)
    except json.JSONDecodeError as exc:
        raise BenchmarkError(f"CDP command {command} returned malformed JSON") from exc


def browser_clock() -> dict[str, Any]:
    sock = cdp.target_socket("SharedJSContext")
    try:
        cdp.rpc(sock, 1, "Performance.enable", {})
        metrics = cdp.rpc(sock, 2, "Performance.getMetrics", {})
        epoch = cdp.rpc(sock, 3, "Runtime.evaluate", {"expression": "performance.timeOrigin", "returnByValue": True})
        cdp.rpc(sock, 4, "Performance.disable", {})
        values = {item["name"]: item["value"] for item in metrics["result"]["metrics"]}
        origin = epoch["result"]["result"]["value"]
        return {"navigation_start_ns": round(values["NavigationStart"] * 1_000_000_000), "time_origin_ms": origin}
    finally:
        sock.close()


def prime_observers(lease: Lease, run_id: str) -> tuple[Any, str, dict[str, Any]]:
    source = _js_source().replace("__BENCHMARK_COMMAND__", json.dumps("preload"))
    source = source.replace("__BENCHMARK_PARAMS__", json.dumps({"runId": run_id}))
    sock = cdp.target_socket("SharedJSContext")
    identifier = None
    try:
        enabled = cdp.rpc(sock, 0, "Page.enable", {})
        if "error" in enabled:
            raise BenchmarkError(f"observer Page domain enable failed: {enabled}")
        registered = cdp.rpc(sock, 1, "Page.addScriptToEvaluateOnNewDocument", {"source": source})
        identifier = registered["result"]["identifier"]
        reloaded = cdp.rpc(sock, 2, "Page.reload", {})
        if "error" in reloaded:
            raise BenchmarkError(f"observer priming reload failed: {reloaded}")
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            lease.check()
            try:
                marker = cdp_command("preload_state")
            except BenchmarkError:
                time.sleep(0.1)
                continue
            if marker.get("runId") != run_id or marker.get("error") is not None or marker.get("attached") is not False:
                raise BenchmarkError(f"observer preload did not precede Loader startup: {marker}")
            return sock, identifier, marker
        raise BenchmarkError("early Loader observer preload did not appear in the new document")
    except BaseException as error:
        try:
            if identifier is not None:
                try:
                    cdp_command("detach", {"runId": run_id})
                except BaseException as cleanup_error:
                    error.add_note(f"owned observer detach failed: {cleanup_error}")
                try:
                    removed = cdp.rpc(sock, 3, "Page.removeScriptToEvaluateOnNewDocument", {"identifier": identifier})
                    if "error" in removed:
                        raise BenchmarkError(f"observer preload cleanup failed: {removed}")
                except BaseException as cleanup_error:
                    error.add_note(f"observer registration removal failed: {cleanup_error}")
        finally:
            sock.close()
        raise


def record_browser_window(remote: RemoteClient, name: str, result: Mapping[str, Any], clock: Mapping[str, Any]) -> dict[str, Any]:
    if result.get("timeOrigin") != clock["time_origin_ms"]:
        raise BenchmarkError("Steam context changed during a measurement window")
    start, end = result.get("startMs"), result.get("endMs")
    _check_host_elapsed(start, "browser window start")
    _check_host_elapsed(end, "browser window end")
    return remote.call("phase", {
        "name": name,
        "start_ns": clock["navigation_start_ns"] + round(start * 1_000_000),
        "end_ns": clock["navigation_start_ns"] + round(end * 1_000_000),
    })


def record_browser_workload_windows(
    result: Mapping[str, Any], clock: Mapping[str, Any],
) -> dict[str, dict[str, int]]:
    if result.get("timeOrigin") != clock["time_origin_ms"]:
        raise BenchmarkError("Steam context changed during a workload window")
    measurements = result.get("measurements")
    if not isinstance(measurements, Mapping):
        raise BenchmarkError("browser workload omitted measured windows")
    windows: dict[str, dict[str, int]] = {}
    for name, entry in measurements.items():
        if not isinstance(name, str) or not isinstance(entry, Mapping):
            raise BenchmarkError("browser workload returned an invalid measurement window")
        start, end = entry.get("startMs"), entry.get("endMs")
        _check_host_elapsed(start, f"{name} window start")
        _check_host_elapsed(end, f"{name} window end")
        if end <= start:
            raise BenchmarkError(f"{name} workload window is empty or reversed")
        windows[name] = {
            "start_ns": clock["navigation_start_ns"] + round(start * 1_000_000),
            "end_ns": clock["navigation_start_ns"] + round(end * 1_000_000),
        }
    return windows


def _check_host_elapsed(value: Any, description: str) -> None:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 0:
        raise BenchmarkError(f"{description} did not return a valid elapsed interval")


def _check_observer_state(state: Any) -> None:
    if not isinstance(state, dict) or isinstance(state.get("attachedAt"), bool) or \
            not isinstance(state.get("attachedAt"), (int, float)) or \
            not math.isfinite(state["attachedAt"]) or \
            any(type(state.get(key)) is not int or state[key] < 0 for key in (
                "updateStarted", "updateCompleted", "updateActive",
                "catalogStarted", "catalogCompleted", "catalogActive",
            )) or \
            state["updateActive"] != 0 or state["catalogActive"] != 0 or \
            not isinstance(state.get("updateErrors"), list) or state["updateErrors"] or \
            not isinstance(state.get("catalogErrors"), list) or state["catalogErrors"]:
        raise BenchmarkError(f"Loader update/catalog observers are not quiescent: {state}")


def configure_cdp(port: int) -> None:
    cdp.HOST = "127.0.0.1"
    cdp.PORT = validate_port(port)


def prepare_run_root(artifacts: Mapping[str, Any], scratch_relative: str, args: argparse.Namespace,
                     evidence: Evidence) -> RemoteClient:
    configure_cdp(args.cdp_port)
    remote = RemoteClient(args.host, args.cdp_port, evidence)
    _stage(remote, artifacts, scratch_relative)
    return remote


def _check_capture_and_watchdog(remote: RemoteClient, artifacts: Mapping[str, Any], evidence: Evidence) -> None:
    evidence.write_json("capture.json", _capture(remote, artifacts))
    watchdog = remote.call("watchdog-test", {})
    evidence.write_json("watchdog-test.json", watchdog)
    _ensure_tool_success("watchdog-test", watchdog)
    evidence.write_json("status-after-capture.json", remote.call("status", {}))


def wait_for_ui_finish(lease: Lease, signal_event: threading.Event) -> None:
    finish_event = threading.Event()
    input_error: list[str] = []

    def read_control() -> None:
        while True:
            line = sys.stdin.readline()
            if not line:
                input_error.append("stdin closed before finish")
                finish_event.set()
                return
            if line.strip() == "finish":
                finish_event.set()
                return

    reader = threading.Thread(target=read_control, name="metadata-benchmark-ui-control", daemon=True)
    reader.start()
    while not finish_event.wait(1):
        lease.check()
        if signal_event.is_set():
            break
    if input_error:
        raise BenchmarkError(input_error[0])
    if signal_event.is_set():
        raise KeyboardInterrupt("UI arm interrupted")


def run_ui_arm(remote: RemoteClient, artifacts: Mapping[str, Any], arm: str, lease: Lease,
               evidence: Evidence, signal_event: threading.Event) -> None:
    lease.check()
    prepared = remote.call("prepare", {"arm": arm, "dataset": None, "install_zip": False})
    _ensure_tool_success("prepare", prepared)
    if prepared.get("arm") != arm or prepared.get("dataset") is not None or prepared.get("install_zip") is not False:
        raise BenchmarkError("UI arm did not preserve the selected arm and empty-zip-install contract")
    started = remote.call("start", {"measure_backend": False})
    if started.get("service_ready") is not True:
        raise BenchmarkError("UI arm Loader did not reach authenticated service readiness")
    archive = "python" if arm == "A" else "rust"
    delivery = remote.call("downloads", {"archive": archive})
    _ensure_tool_success("downloads", delivery)
    expected_zip_hash = artifacts["hashes"]["python_zip_sha256" if arm == "A" else "rust_zip_sha256"]
    if delivery.get("archive") != archive or delivery.get("delivered") is not True or \
            delivery.get("sha256") != expected_zip_hash or \
            delivery.get("path") != "/home/deck/Downloads/Decky-Metadata.zip":
        raise BenchmarkError(f"UI archive delivery did not match arm {arm} artifact: {delivery}")
    evidence.write_json("ui-arm.json", {
        "arm": arm,
        "prepare": prepared,
        "start": {key: started[key] for key in ("service_ready", "pids") if key in started},
        "downloads": delivery,
        "run_root": remote.run_root,
        "scratch_homebrew": remote.scratch,
        "ledger": remote.ledger,
        "hashes": artifacts["hashes"],
    })
    print("BENCHMARK_UI_READY", flush=True)
    print(json.dumps({
        "arm": arm,
        "run_root": remote.run_root,
        "scratch_homebrew": remote.scratch,
        "ledger": remote.ledger,
        "remote_helper": remote.helper,
        "downloads_zip": "/home/deck/Downloads/Decky-Metadata.zip",
        "hashes": artifacts["hashes"],
    }, ensure_ascii=False, sort_keys=True), flush=True)
    wait_for_ui_finish(lease, signal_event)


def workload_params(size: int, version: str) -> dict[str, Any]:
    fixture = build_fixture(size)
    records = list(fixture["metadata"].values())
    return {
        "size": size,
        "missing": size // 4,
        "records": records,
        "writeDescriptionA": "A" * 512,
        "writeDescriptionB": "B" * 512,
        "version": version,
    }


def _save_trial(evidence: Evidence, label: str, trial: Mapping[str, Any]) -> None:
    evidence.write_json(f"trial-{label}.json", trial)


def _copy_collector_samples(remote: RemoteClient, result: Mapping[str, Any], label: str) -> str | None:
    path = result.get("samples_path")
    if path is None:
        return None
    if not isinstance(path, str) or not remote.run_root or not remote_path_is_within(path, remote.run_root):
        raise BenchmarkError("collector returned a samples path outside the private VM run root")
    name = f"collector-{label}.samples"
    remote.scp_from(path, remote.evidence.root / name)
    return name

def _finite_nonnegative(value: Any, label: str, *, positive: bool = False) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or \
            not math.isfinite(value) or value < 0 or (positive and value == 0):
        raise BenchmarkError(f"collector {label} is not a valid {'positive ' if positive else ''}number")
    return float(value)


def validate_collector_result(result: Mapping[str, Any], label: str, arm: str) -> dict[str, Any]:
    if not isinstance(result, Mapping) or result.get("label") != label:
        raise BenchmarkError("collector returned an invalid trial identity")
    exit_status = result.get("collector_exit")
    if not isinstance(exit_status, Mapping) or exit_status.get("ok") is not True or \
            exit_status.get("result") != "success" or exit_status.get("status") != 0 or \
            not isinstance(exit_status.get("errors"), list) or exit_status["errors"]:
        raise BenchmarkError(f"collector service did not exit cleanly: {exit_status}")
    if not isinstance(result.get("samples_path"), str) or \
            not isinstance(result.get("phase_boundaries"), (list, Mapping)) or not result["phase_boundaries"]:
        raise BenchmarkError("collector omitted its private sample path or phase boundaries")
    samples = result.get("samples")
    summary = result.get("summary")
    if not isinstance(samples, list) or not isinstance(summary, Mapping) or \
            not isinstance(summary.get("errors"), list) or summary["errors"]:
        raise BenchmarkError(f"collector samples/summary contain missing data or errors: {summary}")
    sample_count = summary.get("sample_count")
    if not isinstance(sample_count, int) or isinstance(sample_count, bool) or \
            sample_count < 1 or sample_count != len(samples):
        raise BenchmarkError("collector sample count does not match its raw samples")
    collector_start_ticks = summary.get("collector_starttime_ticks")
    if not isinstance(collector_start_ticks, int) or isinstance(collector_start_ticks, bool) or collector_start_ticks < 0 or \
            not isinstance(samples[0], Mapping) or samples[0].get("collector_starttime_ticks") != collector_start_ticks or \
            any("collector_starttime_ticks" in sample for sample in samples[1:] if isinstance(sample, Mapping)):
        raise BenchmarkError("collector omitted its single process-start clock boundary")
    wall_seconds = _finite_nonnegative(summary.get("wall_seconds"), "wall_seconds", positive=True)
    service_cpu = _finite_nonnegative(summary.get("service_cpu_seconds"), "service_cpu_seconds")
    idle_percent = _finite_nonnegative(summary.get("idle_one_core_percent"), "idle_one_core_percent")
    expected_roles = {
        "A": {"metadata_python"},
        "B": {"metadata_shim", "metadata_rust"},
        "C": {"metadata_native"},
    }[arm]
    metadata = summary.get("metadata")
    host_service = summary.get("host_service")
    if not isinstance(metadata, Mapping) or not isinstance(host_service, Mapping):
        raise BenchmarkError("collector omitted Metadata or host Loader resource attribution")
    roles = metadata.get("roles")
    if isinstance(roles, Mapping):
        role_names = set(roles)
    elif isinstance(roles, list) and all(isinstance(role, str) for role in roles):
        role_names = set(roles)
    else:
        role_names = set()
    if role_names != expected_roles:
        raise BenchmarkError(f"collector attributed Metadata roles {sorted(role_names)}, expected {sorted(expected_roles)}")
    resources: dict[str, Any] = {}
    for name, attribution in (("metadata", metadata), ("host_service", host_service)):
        cpu_seconds = _finite_nonnegative(attribution.get("cpu_seconds"), f"{name}.cpu_seconds")
        memory = attribution.get("memory")
        if not isinstance(memory, Mapping) or memory.get("readable") is not True:
            raise BenchmarkError(f"collector {name} memory attribution is unreadable")
        current = memory.get("current")
        peak = memory.get("sampled_peak")
        if not isinstance(current, Mapping) or not isinstance(peak, Mapping):
            raise BenchmarkError(f"collector {name} omitted current or sampled-peak memory")
        for key in ("pss_kib", "rss_kib", "private_dirty_kib"):
            _finite_nonnegative(current.get(key), f"{name}.memory.current.{key}")
            _finite_nonnegative(peak.get(key), f"{name}.memory.sampled_peak.{key}")
        resources[name] = {
            "cpu_seconds": cpu_seconds,
            "memory": {"current": dict(current), "sampled_peak": dict(peak)},
        }
    unattributed = summary.get("unattributed")
    if not isinstance(unattributed, Mapping):
        raise BenchmarkError("collector omitted unattributed Loader-service CPU")
    resources["unattributed"] = {
        "cpu_seconds": _finite_nonnegative(unattributed.get("cpu_seconds"), "unattributed.cpu_seconds"),
    }
    phase_totals = summary.get("phase_totals")
    if not isinstance(phase_totals, Mapping):
        raise BenchmarkError("collector omitted workload phase totals")
    checked_phases: dict[str, Any] = {}
    for phase in ("idle", "warmup", "workload", "reload"):
        interval = phase_totals.get(phase)
        if not isinstance(interval, Mapping):
            raise BenchmarkError(f"collector omitted {phase} phase resources")
        values: dict[str, float | None] = {}
        for key in ("wall_seconds", "service_cpu_seconds", "idle_one_core_percent"):
            value = interval.get(key)
            values[key] = None if value is None else _finite_nonnegative(value, f"{phase}.{key}")
        if phase != "reload" and (values["wall_seconds"] is None or values["service_cpu_seconds"] is None):
            raise BenchmarkError(f"collector has no complete {phase} phase interval")
        checked_phases[phase] = values
    return {
        "sample_count": sample_count,
        "collector_starttime_ticks": collector_start_ticks,
        "wall_seconds": wall_seconds,
        "service_cpu_seconds": service_cpu,
        "idle_one_core_percent": idle_percent,
        "phase_totals": checked_phases,
        "resources": resources,
        "metadata_roles": sorted(expected_roles),
    }


def summarize_workload_resource_windows(
    windows: Mapping[str, Mapping[str, int]], workload: Mapping[str, Any],
    samples: Sequence[Mapping[str, Any]], arm: str,
) -> dict[str, dict[str, Any]]:
    roles = benchmark_vm._ARM_METADATA_ROLES.get(arm)
    measurements = workload.get("measurements")
    if roles is None or not isinstance(measurements, Mapping) or set(windows) != set(measurements):
        raise BenchmarkError("workload resource windows do not match the measured methods")
    memory_totals, _observed = benchmark_vm._memory_totals(samples, roles)
    if len(memory_totals) != len(samples):
        raise BenchmarkError("collector Metadata PSS samples are invalid")
    sample_times = [sample.get("monotonic_ns") for sample in samples]
    if not all(isinstance(value, int) and not isinstance(value, bool) for value in sample_times):
        raise BenchmarkError("collector omitted monotonic sample times")
    result: dict[str, dict[str, Any]] = {}
    for name, window in windows.items():
        start_ns, end_ns = window.get("start_ns"), window.get("end_ns")
        if not isinstance(start_ns, int) or isinstance(start_ns, bool) or not isinstance(end_ns, int) or \
                isinstance(end_ns, bool) or not 0 < start_ns < end_ns:
            raise BenchmarkError(f"{name} has an invalid VM-monotonic workload window")
        interval = benchmark_vm.interpolate_service_cpu_window(samples, start_ns, end_ns)
        cpu_usec = interval["service_cpu_usec"]
        if interval["covered_wall_ns"] != end_ns - start_ns or not isinstance(cpu_usec, (int, float)) or isinstance(cpu_usec, bool):
            raise BenchmarkError(f"{name} workload window is not fully bracketed by collector CPU samples")
        measurement = measurements[name]
        calls = measurement.get("completedCalls") if isinstance(measurement, Mapping) else None
        if not isinstance(calls, int) or isinstance(calls, bool) or calls <= 0:
            raise BenchmarkError(f"{name} workload has no valid completed-call count")
        pss_samples = [
            memory_totals[index]["pss_kib"]
            for index, sample in enumerate(samples)
            if start_ns <= sample_times[index] <= end_ns and any(
                isinstance(process, Mapping) and process.get("role") in roles
                for process in sample.get("processes", [])
            )
        ]
        if not pss_samples:
            raise BenchmarkError(f"{name} workload window contains no sampled Metadata PSS")
        cpu_seconds = float(cpu_usec) / 1_000_000
        result[name] = {
            "start_ns": start_ns,
            "end_ns": end_ns,
            "completed_calls": calls,
            "service_cpu_seconds": cpu_seconds,
            "service_cpu_ms_per_call": cpu_seconds * 1000 / calls,
            "metadata_pss_sampled_peak_kib": max(pss_samples),
            "metadata_pss_sample_count": len(pss_samples),
        }
    return result


def _verify_started(started: Mapping[str, Any], arm: str, size: int) -> None:
    if started.get("service_ready") is not True or started.get("backend_ready") is not True or \
            started.get("readiness_kind") != "authenticated_backend_version_rpc":
        raise BenchmarkError(f"arm {arm} Loader did not confirm authenticated backend readiness")
    if started.get("version") is None:
        raise BenchmarkError("authenticated backend readiness omitted the Metadata version")
    _check_host_elapsed(started.get("elapsed_ms"), "remote authenticated backend readiness timer")
    if not isinstance(started.get("pids"), list) or not started["pids"]:
        raise BenchmarkError("remote authenticated backend readiness did not identify the Metadata process")


def wait_for_observer_attach(run_id: str, timeout: float = 120.0) -> dict[str, Any]:
    started = time.monotonic()
    last_error: BaseException | None = None
    while time.monotonic() - started <= timeout:
        try:
            marker = cdp_command("preload_state")
        except BenchmarkError as error:  # the Steam document can be mid-injection
            last_error = error
            time.sleep(0.1)
            continue
        if marker.get("runId") != run_id or marker.get("error") is not None:
            raise BenchmarkError(f"Loader observer preload changed before attach: {marker}")
        if marker.get("attached") is True:
            return {**marker, "waitedMs": (time.monotonic() - started) * 1000}
        time.sleep(0.1)
    raise BenchmarkError(f"Loader frontend did not attach its observers within {timeout:.0f} seconds: {last_error}")


def run_trial(remote: RemoteClient, artifacts: Mapping[str, Any], hashes: Mapping[str, str],
              evidence: Evidence, arm: str, size: int, number: int, fixture_hash: str,
              lease: Lease) -> dict[str, Any]:
    label = f"{arm}-{size}-{number}"
    version = artifacts["python_package"]["version"] if arm == "A" else artifacts["rust_package"]["version"]
    trial: dict[str, Any] = {
        "arm": arm,
        "dataset_size": size,
        "trial": number,
        "label": label,
        "run_id": Path(remote.run_root).name,
        "fixture_sha256": fixture_hash,
        "reloads": [],
        "phases": [],
    }
    prepared = False
    service_started = False
    collector_started = False
    observers_attached = False
    preload_socket = None
    preload_identifier = None
    failures: list[BaseException] = []
    try:
        lease.check()
        prepared = True
        trial["prepare"] = remote.call("prepare", {"arm": arm, "dataset": size, "install_zip": True})
        _ensure_tool_success("prepare", trial["prepare"])
        context_reset = trial["prepare"].get("steam_ui_context_reset")
        if not isinstance(context_reset, Mapping) or context_reset.get("old_processes_gone") is not True or context_reset.get("shared_js_context_ready") is not True:
            raise BenchmarkError("timed preparation did not confirm a fresh native context")

        run_id = f"{Path(remote.run_root).name}:{label}"
        preload_socket, preload_identifier, trial["observer_preload"] = prime_observers(lease, run_id)

        lease.check()
        service_started = True
        trial["startup"] = remote.call("start", {"measure_backend": True})
        _verify_started(trial["startup"], arm, size)
        # Backend readiness is measured on the VM socket; the Loader frontend injects later.
        trial["observer_attach"] = wait_for_observer_attach(run_id)
        trial["observer_after_start"] = cdp_command("observer_state")
        if trial["observer_after_start"].get("preloadRunId") != run_id:
            raise BenchmarkError("Loader startup escaped its early observer")
        observers_attached = True
        trial["browser_clock"] = browser_clock()
        trial["observer_service_ready"] = cdp_command("mark_service_ready")
        service_ready_at = trial["observer_service_ready"].get("serviceReadyAt") \
            if isinstance(trial["observer_service_ready"], Mapping) else None
        _check_host_elapsed(service_ready_at, "browser service-ready mark")
        verification = remote.call("verify-plugin", {})
        validate_remote_verification(verification, arm, hashes)
        trial["verification"] = verification
        lease.check()
        collector_started = True
        trial["collector_start"] = remote.call("collect-start", {"label": label})
        if trial["collector_start"].get("label") != label or \
                trial["collector_start"].get("outside_service_cgroup") is not True or \
                trial["collector_start"].get("interval_hz") != 5:
            raise BenchmarkError(f"collector did not confirm isolated 5 Hz sampling: {trial['collector_start']}")
        trial["first_plugin_rpc"] = cdp_command("probe_version", {"version": version})
        if not isinstance(trial["first_plugin_rpc"], dict):
            raise BenchmarkError("first plugin-scoped RPC did not return an observation")
        if trial["first_plugin_rpc"].get("version") != version:
            raise BenchmarkError("first plugin-scoped RPC returned the wrong Metadata version")
        _check_host_elapsed(trial["first_plugin_rpc"].get("elapsedMs"), "first plugin-scoped RPC")
        trial["initial_ui"] = cdp_command("capture_ui")
        cdp_command("home")
        quiescence = cdp_command("wait_startup_quiescence", {"timeoutMs": 180000})
        trial["quiescence"] = quiescence
        if not isinstance(quiescence, dict) or quiescence.get("ok") is not True:
            raise BenchmarkError(f"startup update/catalog quiescence failed: {quiescence}")
        quiet_ms = quiescence.get("quietMs")
        _check_host_elapsed(quiet_ms, "startup quiet period")
        if quiet_ms < 5000:
            raise BenchmarkError("startup quiescence did not establish five quiet Home-route seconds")
        ready_observer = quiescence.get("observer")
        _check_observer_state(ready_observer)
        if ready_observer["updateStarted"] < 1 or \
                ready_observer["updateStarted"] != ready_observer["updateCompleted"] or \
                ready_observer["catalogStarted"] < 1 or \
                ready_observer["catalogStarted"] != ready_observer["catalogCompleted"]:
            raise BenchmarkError("startup quiescence omitted completed update/catalog events")
        _check_host_elapsed(ready_observer.get("updateLastCompletedAt"), "startup update completion timestamp")
        _check_host_elapsed(ready_observer.get("catalogLastCompletedAt"), "startup catalog completion timestamp")
        if ready_observer.get("serviceReadyAt") != service_ready_at:
            raise BenchmarkError("startup observer did not retain the authenticated service-ready mark")

        lease.check()
        idle = cdp_command("measure_idle")
        trial["idle"] = idle
        trial["phases"].append(record_browser_window(remote, "idle", idle, trial["browser_clock"]))
        if not isinstance(idle, dict) or idle.get("ok") is not True or \
                not isinstance(idle.get("idleMs"), (int, float)) or isinstance(idle["idleMs"], bool) or \
                idle["idleMs"] < 30000:
            raise BenchmarkError(f"30-second Home-route idle window failed: {idle}")
        _check_observer_state(idle.get("observer"))

        params = workload_params(size, version)
        observer_before = cdp_command("observer_state")
        trial["warmup"] = cdp_command("warmup", params)
        if trial["warmup"].get("ok") is not True or trial["warmup"].get("calls") != 400:
            raise BenchmarkError(f"400-call browser warmup did not complete: {trial['warmup']}")
        observer_after = cdp_command("observer_state")
        check_observer_stable(observer_before, observer_after)
        trial["phases"].append(record_browser_window(remote, "warmup", trial["warmup"], trial["browser_clock"]))
        trial["observer_after_warmup"] = observer_after

        lease.check()
        workload = cdp_command("run_workload", params)
        trial["workload"] = workload
        trial["workload_summary"] = validate_workload_result(workload, size)
        trial["workload_windows"] = record_browser_workload_windows(workload, trial["browser_clock"])
        trial["phases"].append(record_browser_window(remote, "workload", workload, trial["browser_clock"]))
        observer_after_workload = cdp_command("observer_state")
        check_observer_stable(workload["activityStart"], observer_after_workload)
        trial["observer_after_workload"] = observer_after_workload

        trial["ok"] = True
    except BaseException as exc:
        failures.append(exc)
        trial["ok"] = False
        trial["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        if collector_started:
            try:
                collector = remote.call("collect-stop", {})
                trial["collector_stop"] = collector
                trial["collector_samples_file"] = _copy_collector_samples(remote, collector, label)
                trial["collector_summary"] = validate_collector_result(collector, label, arm)
            except BaseException as exc:
                failures.append(exc)
                trial.setdefault("cleanup_errors", []).append(f"collect-stop: {type(exc).__name__}: {exc}")
        if preload_socket is not None:
            try:
                trial["observer_detach"] = cdp_command("detach", {"runId": run_id})
                if observers_attached:
                    _check_observer_state(trial["observer_detach"])
            except BaseException as exc:
                failures.append(exc)
                trial.setdefault("cleanup_errors", []).append(f"observer detach: {type(exc).__name__}: {exc}")
        if preload_socket is not None:
            try:
                removed = cdp.rpc(preload_socket, 4, "Page.removeScriptToEvaluateOnNewDocument", {"identifier": preload_identifier})
                if "error" in removed:
                    raise BenchmarkError(f"observer preload cleanup failed: {removed}")
            except BaseException as exc:
                failures.append(exc)
                trial.setdefault("cleanup_errors", []).append(f"preload removal: {type(exc).__name__}: {exc}")
            finally:
                preload_socket.close()
        if prepared or service_started:
            try:
                trial["stop"] = remote.call("stop", {})
                _ensure_tool_success("stop", trial["stop"])
            except BaseException as exc:
                failures.append(exc)
                trial.setdefault("cleanup_errors", []).append(f"stop: {type(exc).__name__}: {exc}")
        try:
            trial["remote_status"] = remote.call("status", {})
            remote.retrieve_ledger(f"ledger-{label}.json")
        except BaseException as exc:
            failures.append(exc)
            trial.setdefault("cleanup_errors", []).append(f"evidence retrieval: {type(exc).__name__}: {exc}")
        if failures:
            trial["ok"] = False
            trial.setdefault("error", f"{type(failures[0]).__name__}: {failures[0]}")
        _save_trial(evidence, label, trial)
    if failures:
        raise BenchmarkError(f"trial {label} failed: " + " | ".join(str(error) for error in failures)) from failures[0]
    return trial


def _statistics_for(values: Sequence[float]) -> dict[str, float]:
    return {
        "median": statistics.median(values),
        "p95": percentile(values, 0.95),
        "p99": percentile(values, 0.99),
    }


def summarize_reload_results(trials: Sequence[Mapping[str, Any]], arm: str) -> dict[str, Any]:
    results = [reload_result for trial in trials if trial.get("arm") == arm for reload_result in trial.get("reloads", [])]
    if len(results) != 10:
        raise ValueError(f"arm {arm} must include exactly ten 1,000-record reloads")
    return {
        "count": len(results),
        "reload_to_authenticated_backend_ready_ms": _statistics_for([float(result["elapsed_ms"]) for result in results]),
        "poll_resolution_ms": 10,
        "results": results,
    }

def aggregate_collector_trials(trials: Sequence[Mapping[str, Any]], arm: str, size: int) -> dict[str, Any]:
    selected = [trial for trial in trials if trial.get("arm") == arm and trial.get("dataset_size") == size]
    if len(selected) != TRIALS_PER_DATASET_ARM:
        raise ValueError(f"{arm}-{size} requires exactly five collector intervals")
    run_id = _validate_trial_run_ids(selected)
    calls = sum(int(trial["workload"]["completedCalls"]) for trial in selected)
    if calls != MEASURED_CALLS_PER_TRIAL * TRIALS_PER_DATASET_ARM:
        raise ValueError(f"{arm}-{size} resource denominator is not all successful measured RPCs")
    summaries = [trial["collector_summary"] for trial in selected]
    workload_resources = [
        summarize_workload_resource_windows(
            trial["workload_windows"], trial["workload"], trial["collector_stop"]["samples"], arm,
        )
        for trial in selected
    ]
    phase_totals: dict[str, Any] = {}
    for phase in ("idle", "warmup", "workload", "reload"):
        intervals = [summary["phase_totals"][phase] for summary in summaries]
        wall_values = [item["wall_seconds"] for item in intervals if item["wall_seconds"] is not None]
        cpu_values = [item["service_cpu_seconds"] for item in intervals if item["service_cpu_seconds"] is not None]
        idle_values = [
            (item["idle_one_core_percent"], item["wall_seconds"])
            for item in intervals
            if item["idle_one_core_percent"] is not None and item["wall_seconds"] is not None
        ]
        phase_totals[phase] = {
            "available_intervals": len(wall_values),
            "wall_seconds": sum(wall_values) if wall_values else None,
            "service_cpu_seconds": sum(cpu_values) if cpu_values else None,
            "idle_one_core_percent_wall_weighted": (
                sum(value * wall for value, wall in idle_values) / sum(wall for _, wall in idle_values)
                if idle_values else None
            ),
        }
    resource_totals: dict[str, Any] = {}
    for name in ("metadata", "host_service"):
        cpu_values = [summary["resources"][name]["cpu_seconds"] for summary in summaries]
        current_values = [summary["resources"][name]["memory"]["current"] for summary in summaries]
        peak_values = [summary["resources"][name]["memory"]["sampled_peak"] for summary in summaries]
        memory_fields: dict[str, Any] = {}
        for field in ("pss_kib", "rss_kib", "private_dirty_kib"):
            current = [float(value[field]) for value in current_values]
            peaks = [float(value[field]) for value in peak_values]
            memory_fields[field] = {
                "current_median_kib": statistics.median(current),
                "sampled_peak_max_kib": max(peaks),
                "per_trial_current_kib": current,
                "per_trial_sampled_peak_kib": peaks,
            }
        resource_totals[name] = {"cpu_seconds": sum(cpu_values), "memory_kib": memory_fields}
    resource_totals["unattributed"] = {
        "cpu_seconds": sum(summary["resources"]["unattributed"]["cpu_seconds"] for summary in summaries),
    }
    per_workload: dict[str, Any] = {}
    for name, expected_calls in expected_workload_counts().items():
        method_trials = [resources[name] for resources in workload_resources]
        method_calls = sum(item["completed_calls"] for item in method_trials)
        if method_calls != expected_calls * TRIALS_PER_DATASET_ARM:
            raise BenchmarkError(f"{name} workload CPU denominator does not match completed calls")
        peaks = [item["metadata_pss_sampled_peak_kib"] for item in method_trials]
        per_workload[name] = {
            "completed_calls": method_calls,
            "service_cpu_ms_per_call": sum(item["service_cpu_seconds"] for item in method_trials) * 1000 / method_calls,
            "per_trial_service_cpu_ms_per_call": [item["service_cpu_ms_per_call"] for item in method_trials],
            "metadata_pss_sampled_peak_kib_median": statistics.median(peaks),
            "metadata_pss_sampled_peak_kib_max": max(peaks),
            "per_trial_metadata_pss_sampled_peak_kib": peaks,
            "per_trial": method_trials,
        }
    service_cpu = sum(summary["service_cpu_seconds"] for summary in summaries)
    return {
        "arm": arm,
        "dataset_size": size,
        "run_id": run_id,
        "collector_intervals": len(summaries),
        "raw_samples": sum(summary["sample_count"] for summary in summaries),
        "collector_wall_seconds": sum(summary["wall_seconds"] for summary in summaries),
        "service_cpu_seconds": service_cpu,
        "idle_one_core_percent_median": statistics.median(
            float(summary["phase_totals"]["idle"]["idle_one_core_percent"]) for summary in summaries
        ),
        "phase_totals": phase_totals,
        "attribution": resource_totals,
        "per_workload": per_workload,
        "metadata_roles": summaries[0]["metadata_roles"],
        "per_trial": [
            {
                "label": trial["label"],
                "collector": summary,
                "summary": trial["collector_stop"]["summary"],
                "workload_resources": workload,
            }
            for trial, summary, workload in zip(selected, summaries, workload_resources)
        ],
    }


def run_reload_measurement(
    remote: RemoteClient, artifacts: Mapping[str, Any], evidence: Evidence,
    arm: str, number: int, lease: Lease,
) -> dict[str, Any]:
    label = f"reload-{arm}-1000-{number}"
    run_id = Path(remote.run_root).name
    expected_version = artifacts["python_package"]["version"] if arm == "A" else artifacts["rust_package"]["version"]
    result: dict[str, Any] = {
        "arm": arm,
        "dataset_size": 1000,
        "reload_index": number,
        "run_id": run_id,
        "reloads": [],
    }
    prepared = False
    start_attempted = False
    failures: list[BaseException] = []
    try:
        lease.check()
        prepared = True
        preparation = remote.call("prepare", {"arm": arm, "dataset": 1000, "install_zip": True})
        _ensure_tool_success("prepare", preparation)
        context_reset = preparation.get("steam_ui_context_reset")
        if not isinstance(context_reset, Mapping) or context_reset.get("old_processes_gone") is not True or \
                context_reset.get("shared_js_context_ready") is not True:
            raise BenchmarkError("reload preparation did not confirm a fresh native context")
        result["prepare"] = preparation
        lease.check()
        start_attempted = True
        startup = remote.call("start", {"measure_backend": True})
        _verify_started(startup, arm, 1000)
        result["startup"] = startup
        lease.check()
        reload_result = remote.call("reload", {})
        _check_host_elapsed(reload_result.get("elapsed_ms"), "remote authenticated reload readiness timer")
        if not isinstance(reload_result.get("newpids"), list) or not reload_result["newpids"] or \
                reload_result.get("old_pids_gone") is not True or reload_result.get("version") != expected_version or \
                reload_result.get("readiness_kind") != "authenticated_backend_version_rpc" or reload_result.get("poll_ms") != 10:
            raise BenchmarkError("authenticated reload did not confirm the new Metadata process and version")
        result["reloads"] = [reload_result]
        result["ok"] = True
    except BaseException as exc:
        failures.append(exc)
        result["ok"] = False
        result["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        if prepared or start_attempted:
            try:
                stopped = remote.call("stop", {})
                _ensure_tool_success("stop", stopped)
                result["stop"] = stopped
            except BaseException as exc:
                failures.append(exc)
                result.setdefault("cleanup_errors", []).append(f"stop: {type(exc).__name__}: {exc}")
        try:
            result["remote_status"] = remote.call("status", {})
            remote.retrieve_ledger(f"ledger-{label}.json")
        except BaseException as exc:
            failures.append(exc)
            result.setdefault("cleanup_errors", []).append(f"evidence retrieval: {type(exc).__name__}: {exc}")
        if failures:
            result["ok"] = False
            result.setdefault("error", f"{type(failures[0]).__name__}: {failures[0]}")
        evidence.write_json(f"{label}.json", result)
    if failures:
        raise BenchmarkError(f"{label} failed: " + " | ".join(str(error) for error in failures)) from failures[0]
    return result


def run_timed_suite(remote: RemoteClient, artifacts: Mapping[str, Any], hashes: Mapping[str, str],
                    evidence: Evidence, fixture_hashes: Mapping[int, str], lease: Lease) -> dict[str, Any]:
    trials: list[dict[str, Any]] = []
    for arm, size, number in trial_order():
        lease.check()
        trial = run_trial(remote, artifacts, hashes, evidence, arm, size, number, fixture_hashes[size], lease)
        trials.append(trial)
    expected_order = trial_order()
    actual_order = [(trial["arm"], trial["dataset_size"], trial["trial"]) for trial in trials]
    if actual_order != expected_order:
        raise BenchmarkError("completed trials do not match the prescribed round-robin A/B/C dataset order")
    if len(trials) != 30:
        raise BenchmarkError("benchmark did not complete all 30 prescribed trials")
    run_id = _validate_trial_run_ids(trials, required=True)
    if run_id != Path(remote.run_root).name:
        raise BenchmarkError("trial evidence does not belong to this benchmark run directory")
    reload_trials = [
        run_reload_measurement(remote, artifacts, evidence, arm, number, lease)
        for arm, number in reload_order()
    ]
    expected_reload_order = reload_order()
    actual_reload_order = [(trial["arm"], trial["reload_index"]) for trial in reload_trials]
    if actual_reload_order != expected_reload_order:
        raise BenchmarkError("reload measurements do not follow the prescribed A/B/C round-robin order")
    if _validate_trial_run_ids(reload_trials, required=True) != run_id:
        raise BenchmarkError("summary cannot mix reload measurements from different run directories")
    comparisons = [aggregate_trials(trials, arm, size) for arm in ("A", "B", "C") for size in (100, 1000)]
    resource_comparisons = [
        aggregate_collector_trials(trials, arm, size)
        for arm in ("A", "B", "C") for size in (100, 1000)
    ]
    reloads = {arm: summarize_reload_results(reload_trials, arm) for arm in ("A", "B", "C")}
    result = {
        "schema": 1,
        "run_id": run_id,
        "trial_order": [f"{arm}-{size}-{number}" for arm, size, number in expected_order],
        "reload_order": [f"{arm}-{number}" for arm, number in expected_reload_order],
        "expected_trial_count": 30,
        "expected_measured_calls_per_trial": MEASURED_CALLS_PER_TRIAL,
        "expected_total_measured_calls": MEASURED_CALLS_PER_TRIAL * 30,
        "measured_calls": sum(trial["workload"]["completedCalls"] for trial in trials),
        "hashes": dict(hashes),
        "comparisons": comparisons,
        "resource_comparisons": resource_comparisons,
        "reloads": reloads,
        "collector_summaries": [
            {"trial": trial["label"], "summary": trial["collector_stop"]["summary"]}
            for trial in trials
        ],
        "verification_record_schema": (
            "verified_arms + hashes + per-arm zip_sha256/ui_sha256/loader_runtime_sha256/"
            "rust_binary_sha256/fork_binary_sha256/fork_runtime_sha256"
        ),
    }
    if result["measured_calls"] != MEASURED_CALLS_PER_TRIAL * 30:
        raise BenchmarkError("completed measured call total is not 193,500")
    evidence.write_json("summary.json", result)
    return result


def _host_environment() -> dict[str, Any]:
    try:
        load = os.getloadavg()
    except (AttributeError, OSError):
        load = None
    return {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cpu_count": os.cpu_count(),
        "load_average": list(load) if load is not None else None,
    }


def _create_output_dir(raw: str) -> Path:
    requested = Path(raw).expanduser()
    if requested.exists() or requested.is_symlink():
        raise ValueError(f"output directory already exists: {requested}")
    resolved = output_path(requested)
    if resolved.exists() or resolved.is_symlink():
        raise ValueError(f"output directory already exists after path resolution: {resolved}")
    parent = resolved.parent
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    parent = parent.resolve(strict=True)
    root = parent / resolved.name
    if root.exists() or root.is_symlink():
        raise ValueError(f"output directory already exists: {root}")
    root.mkdir(mode=0o700)
    if root.resolve(strict=True) != root or stat.S_IMODE(root.stat().st_mode) & 0o077:
        raise ValueError("output directory must be a private real directory")
    return root


def _install_signal_handlers(signal_event: threading.Event) -> dict[int, Any]:
    previous: dict[int, Any] = {}
    def handle(signum: int, _frame: Any) -> None:
        signal_event.set()
        raise KeyboardInterrupt(f"received signal {signum}; restoring the captured VM state")
    for signum in (signal.SIGINT, signal.SIGTERM):
        previous[signum] = signal.signal(signum, handle)
    return previous


def _restore_signal_handlers(previous: Mapping[int, Any]) -> None:
    for signum, handler in previous.items():
        signal.signal(signum, handler)


def run(args: argparse.Namespace) -> dict[str, Any]:
    validate_host(args.host)
    validate_port(args.cdp_port)
    scratch_relative = safe_relative_scratch(args.scratch_homebrew)
    artifacts = load_local_artifacts(args)
    verification: dict[str, Any] | None = None
    if not args.dry_run and args.ui_arm is None:
        if not args.verification_record:
            raise ValueError("timed mode requires --verification-record from verified GUI arms A, B and C")
        verification = validate_verification_record(args.verification_record, artifacts["hashes"])
    elif args.verification_record:
        verification = validate_verification_record(args.verification_record, artifacts["hashes"])
    fixture_payloads = {size: fixture_bytes(size) for size in (100, 1000)}
    output = _create_output_dir(args.output_dir)
    evidence = Evidence(output)
    evidence.write_json("host-environment.json", _host_environment())
    evidence.write_json("inputs-preflight.json", {
        "hashes": artifacts["hashes"],
        "versions": {"python": artifacts["python_package"]["version"], "rust": artifacts["rust_package"]["version"]},
        "verified_arms": verification.get("verified_arms") if verification else None,
        "dry_run": args.dry_run,
        "ui_arm": args.ui_arm,
    })

    signal_event = threading.Event()
    old_handlers = _install_signal_handlers(signal_event)
    remote: RemoteClient | None = None
    lease: Lease | None = None
    capture_attempted = False
    primary: BaseException | None = None
    result: dict[str, Any] | None = None
    try:
        fixture_hashes, fixture_paths = _write_fixture_files(output, fixture_payloads)
        evidence.write_json("fixture-hashes.json", {str(key): value for key, value in fixture_hashes.items()})
        evidence.write_json("inputs.json", {
            "hashes": artifacts["hashes"],
            "fixture_sha256": {str(key): value for key, value in fixture_hashes.items()},
            "python_version": artifacts["python_package"]["version"],
            "rust_version": artifacts["rust_package"]["version"],
            "fork_source_baseline": artifacts["fork_manifest"].get("source_baseline", {}),
        })
        remote = prepare_run_root(artifacts, scratch_relative, args, evidence)
        _stage_fixture_files(remote, fixture_paths)
        capture_attempted = True
        _check_capture_and_watchdog(remote, artifacts, evidence)
        if args.dry_run:
            result = {"dry_run": True, "capture": "ok", "watchdog_test": "ok", "timed_trials": 0}
        else:
            armed = remote.call("arm", {"heartbeat_timeout_seconds": 30})
            if not isinstance(armed.get("watchdog_unit"), str) or not armed["watchdog_unit"]:
                raise BenchmarkError("remote watchdog did not return its owned unit identity")
            evidence.write_json("armed.json", armed)
            lease = Lease(remote, evidence)
            lease.start()
            if args.ui_arm is not None:
                run_ui_arm(remote, artifacts, args.ui_arm, lease, evidence, signal_event)
                result = {"ui_arm": args.ui_arm, "ready": True, "timed_trials": 0}
            else:
                if verification is None:
                    raise BenchmarkError("timed mode lost its GUI verification record")
                result = run_timed_suite(remote, artifacts, _hashes_for_capture(artifacts), evidence, fixture_hashes, lease)
    except BaseException as exc:
        primary = exc
        evidence.append({"kind": "run-error", "error": f"{type(exc).__name__}: {exc}"})
    finally:
        if lease is not None:
            try:
                lease.close()
            except BaseException as exc:
                primary = combine_cleanup_failure(primary, exc)
                evidence.append({"kind": "lease-close-error", "error": str(exc)})
        if capture_attempted and remote is not None:
            try:
                recovery = remote.call("recover", {}, timeout=300)
                evidence.write_json("recovery.json", recovery)
                if recovery.get("ok") is not True or recovery.get("conflicts"):
                    raise BenchmarkError(f"verified recovery reported failure/conflicts: {recovery}")
                remote.retrieve_ledger("ledger-after-recovery.json")
            except BaseException as exc:
                primary = combine_cleanup_failure(primary, exc)
                evidence.append({"kind": "recovery-error", "error": str(exc)})
        _restore_signal_handlers(old_handlers)
    if primary is not None:
        raise primary
    assert result is not None
    evidence.write_json("result.json", result)
    return {"output_dir": str(output), **result}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="SSH host alias or user@host")
    parser.add_argument("--cdp-port", required=True, type=int, help="already-owned local Steam CDP forwarding port")
    parser.add_argument("--scratch-homebrew", required=True, help="relative Homebrew path inside this run's private VM root")
    parser.add_argument("--python-zip", required=True, help="host path to the GUI-verified original ZIP")
    parser.add_argument("--rust-zip", required=True, help="host path to the GUI-verified Rust ZIP")
    parser.add_argument("--upstream-runtime", required=True, help="host path to pinned upstream PluginLoader executable")
    parser.add_argument("--fork-runtime", required=True, help="host path to the complete pinned fork runtime bundle")
    parser.add_argument("--output-dir", required=True, help="new private evidence directory beneath the configured temp root")
    parser.add_argument("--verification-record", help="exact GUI-verification record for arms A, B and C (required for timed mode)")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--dry-run", action="store_true", help="capture, run watchdog fixture/assertions and recover without timed trials")
    group.add_argument("--ui-arm", choices=("A", "B", "C"), help="stage a real QAM GUI correctness arm and hold the recovery lease")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = run(args)
    except (BenchmarkError, OSError, ValueError, RemoteCommandError) as exc:
        print(f"benchmark_backend: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt as exc:
        print(f"benchmark_backend: {exc or 'interrupted; recovery was attempted'}", file=sys.stderr)
        return 130
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
