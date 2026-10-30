#!/usr/bin/env python3
"""Stable, read-only project and optional Deck health report."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import struct
import subprocess
import sys
import zipfile
from pathlib import Path

SCHEMA_VERSION = 1

LEGACY_HOOK_BODIES = {
    "pre-commit": (
        "#!/usr/bin/env bash\n"
        "# Playhub Metadata pre-commit gate (installed from AGENTS.md contract).\n"
        "set -euo pipefail\n"
        'repo_root="$(git rev-parse --show-toplevel)"\n'
        'exec "$repo_root/scripts/check_tdd.sh"'
    ),
    "post-commit": (
        "#!/usr/bin/env bash\n"
        "# Decky-Metadata post-commit hook (installed from AGENTS.md contract).\n"
        "# Delegates to the tracked scripts/post_commit.sh: build + package + push to Deck.\n"
        'repo_root="$(git rev-parse --show-toplevel)"\n'
        'exec "$repo_root/scripts/post_commit.sh"'
    ),
    "post-merge": (
        "#!/usr/bin/env bash\n"
        "# Decky-Metadata post-merge hook.\n"
        "# git merge (and git pull) fire post-merge, NOT post-commit, so the orchestration\n"
        "# flow that lands work on dev via `git merge --no-ff` needs this to trigger the\n"
        "# same build + package + push-to-Deck step as post-commit.\n"
        'repo_root="$(git rev-parse --show-toplevel)"\n'
        'exec "$repo_root/scripts/post_commit.sh"'
    ),
}


def hook_body_supported(name: str, delegate: str, body: str) -> bool:
    canonical = f'#!/usr/bin/env bash\nexec "$(git rev-parse --show-toplevel)/{delegate}" "$@"'
    return body.rstrip("\n") in {canonical, LEGACY_HOOK_BODIES[name]}


def run(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=cwd, text=True, capture_output=True, check=False)


def check(check_id: str, status: str, summary: str, **details: object) -> dict[str, object]:
    return {"id": check_id, "status": status, "summary": summary, "details": details}


def aggregate(checks: list[dict[str, object]]) -> str:
    statuses = {item["status"] for item in checks}
    return "FAIL" if "FAIL" in statuses else "WARN" if "WARN" in statuses else "PASS"


def git_root() -> Path:
    result = run("git", "rev-parse", "--show-toplevel")
    if result.returncode:
        raise RuntimeError("not in a Git repository")
    return Path(result.stdout.strip()).resolve()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def static_x64_elf_error(data: bytes) -> str | None:
    if (
        len(data) < 64
        or data[:7] != b"\x7fELF\x02\x01\x01"
        or struct.unpack_from("<H", data, 16)[0] not in (2, 3)
        or struct.unpack_from("<H", data, 18)[0] != 62
        or struct.unpack_from("<Q", data, 24)[0] == 0
    ):
        return "expected little-endian x86_64 ELF"
    program_offset = struct.unpack_from("<Q", data, 32)[0]
    entry_size = struct.unpack_from("<H", data, 54)[0]
    count = struct.unpack_from("<H", data, 56)[0]
    if (count and entry_size < 56) or program_offset + entry_size * count > len(data):
        return "malformed ELF program headers"
    for index in range(count):
        header = program_offset + index * entry_size
        kind = struct.unpack_from("<I", data, header)[0]
        if kind == 3:
            return "dynamic interpreter is forbidden"
        if kind == 2:
            offset = struct.unpack_from("<Q", data, header + 8)[0]
            size = struct.unpack_from("<Q", data, header + 32)[0]
            if offset + size > len(data) or size % 16:
                return "malformed ELF dynamic table"
            for entry in range(offset, offset + size, 16):
                if struct.unpack_from("<q", data, entry)[0] == 1:
                    return "dynamic library dependency is forbidden"
    return None


def archive_metadata(path: Path) -> dict[str, object]:
    result: dict[str, object] = {"path": str(path), "exists": path.is_file()}
    if not path.is_file():
        return result
    result["sha256"] = sha256(path)
    try:
        with zipfile.ZipFile(path) as archive:
            plugin = json.loads(archive.read("Decky-Metadata/plugin.json"))
            if not isinstance(plugin, dict):
                raise ValueError("plugin manifest is not a JSON object")
            bundle = archive.read("Decky-Metadata/dist/index.js")
            native_name = "Decky-Metadata/bin/backend"
            native_info = archive.getinfo(native_name)
            native = archive.read(native_name)
            mode = native_info.external_attr >> 16
            elf_error = static_x64_elf_error(native)
            error = (
                "manifest backend must be bin/backend"
                if plugin.get("backend") != "bin/backend"
                else "backend must be a Unix regular executable with mode 0100755"
                if native_info.create_system != 3 or mode != (stat.S_IFREG | 0o755)
                else elf_error
            )
            result["version"] = plugin.get("version")
            result["bundle_sha256"] = hashlib.sha256(bundle).hexdigest()
            result["native_backend"] = {
                "path": plugin.get("backend"),
                "archive_path": native_name,
                "exists": True,
                "sha256": hashlib.sha256(native).hexdigest(),
                "mode": f"{mode:06o}",
                "valid": error is None,
                "error": error,
            }
    except (
        OSError,
        KeyError,
        TypeError,
        AttributeError,
        ValueError,
        struct.error,
        zipfile.BadZipFile,
    ) as error:
        result["error"] = str(error)
    return result


def local_checks(root: Path) -> list[dict[str, object]]:
    checks: list[dict[str, object]] = []
    branch = run("git", "branch", "--show-current", cwd=root).stdout.strip()
    status = run("git", "status", "--porcelain", "--untracked-files=all", cwd=root).stdout.splitlines()
    checks.append(check("repository", "PASS", "Git repository located", root=str(root), branch=branch, base="dev"))
    checks.append(check("working-tree", "WARN" if status else "PASS", "Working tree has changes" if status else "Working tree is clean", entries=status))
    required = ["git", "node", "npm", "python3", "uv", "cargo", "rustc"]
    missing = [name for name in required if shutil.which(name) is None]
    checks.append(check("tools", "FAIL" if missing else "PASS", "Required tooling checked", missing=missing))
    dep_files = [
        "package.json",
        "package-lock.json",
        "plugin.json",
        "rust-toolchain.toml",
        "backend-rust/Cargo.toml",
        "backend-rust/Cargo.lock",
    ]
    absent = [name for name in dep_files if not (root / name).is_file()]
    checks.append(check("dependency-files", "FAIL" if absent else "PASS", "Dependency manifests checked", missing=absent))
    try:
        package_version = json.loads((root / "package.json").read_text())["version"]
        plugin_version = json.loads((root / "plugin.json").read_text())["version"]
        same = package_version == plugin_version
        checks.append(check("version-agreement", "PASS" if same else "FAIL", "Manifest versions agree" if same else "Manifest versions differ", package=package_version, plugin=plugin_version))
    except (OSError, KeyError, json.JSONDecodeError) as error:
        checks.append(check("version-agreement", "FAIL", "Could not read manifest versions", error=str(error)))

    try:
        manifest = json.loads((root / "plugin.json").read_text())
        if not isinstance(manifest, dict):
            raise ValueError("plugin manifest is not a JSON object")
        shim = root / "main.py"
        runtime_ok = (
            manifest.get("backend") == "bin/backend"
            and shim.is_file()
            and shim.read_text(encoding="utf-8").splitlines()[:1]
            == ["# SPDX-License-Identifier: 0BSD"]
            and (root / "backend-rust" / "Cargo.toml").is_file()
        )
        checks.append(
            check(
                "native-runtime",
                "PASS" if runtime_ok else "FAIL",
                "Rust backend and pinned upstream shim configured"
                if runtime_ok
                else "Native backend manifest or upstream shim is missing",
                backend=manifest.get("backend"),
                cargo_manifest=(root / "backend-rust" / "Cargo.toml").is_file(),
                shim=shim.is_file(),
            )
        )
    except (OSError, ValueError) as error:
        checks.append(check("native-runtime", "FAIL", "Could not read native runtime manifest", error=str(error)))
    expected = {
        "pre-commit": "scripts/check_tdd.sh",
        "post-commit": "scripts/post_commit.sh",
        "post-merge": "scripts/post_commit.sh",
    }
    git_dir_result = run("git", "rev-parse", "--git-dir", cwd=root)
    git_dir = Path(git_dir_result.stdout.strip())
    if not git_dir.is_absolute():
        git_dir = root / git_dir
    drift: dict[str, str] = {}
    for name, delegate in expected.items():
        hook = git_dir / "hooks" / name
        body = hook.read_text(errors="replace") if hook.is_file() else ""
        if not hook_body_supported(name, delegate, body) or not os.access(hook, os.X_OK):
            drift[name] = "missing, non-executable, or wrong delegate"
    checks.append(check("git-hooks", "FAIL" if drift else "PASS", "Git hooks checked", drift=drift, delegates=expected))
    wrapper = (root / "run.sh").read_text(errors="replace") if (root / "run.sh").exists() else ""
    cache_ok = all(
        name in wrapper
        for name in ("TMPDIR", "CARGO_HOME", "CARGO_TARGET_DIR", "PYTHONPYCACHEPREFIX")
    )
    pycache = sorted(str(path.relative_to(root)) for path in root.rglob("__pycache__") if ".git" not in path.parts)
    checks.append(check("cache-policy", "WARN" if pycache else "PASS" if cache_ok else "FAIL", "Cache policy checked", configured=cache_ok, repository_pycache=pycache))
    checks.append(check("node-modules-location", "WARN" if (root / "node_modules").exists() else "PASS", "Repository-local node_modules is intentionally retained"))
    archive = archive_metadata(root / "Decky-Metadata.zip")
    head = run("git", "rev-parse", "--short", "HEAD", cwd=root).stdout.strip()
    native = archive.get("native_backend", {})
    broken = bool(archive.get("error")) or (
        archive.get("exists") and native.get("valid") is not True
    )
    current = (
        isinstance(archive.get("version"), str)
        and archive["version"].endswith(f"+{head}")
        and native.get("valid") is True
    )
    package_status = "FAIL" if broken else "PASS" if current else "WARN"
    package_summary = (
        "Local package has an invalid native backend"
        if broken
        else "Local package represents HEAD"
        if current
        else "Local package is absent or stale"
    )
    checks.append(check("local-package", package_status, package_summary, head=head, **archive))
    executables = ["scripts/deck/cdp.py", "scripts/deck/tunnel.sh", "scripts/deck/deploy.sh", "scripts/quality-gates"]
    bad = [name for name in executables if not (root / name).is_file() or not os.access(root / name, os.X_OK)]
    checks.append(check("project-tools", "FAIL" if bad else "PASS", "Tracked project tools checked", invalid=bad))
    return checks


def deck_checks(root: Path) -> list[dict[str, object]]:
    host = os.environ.get("DECKY_DECK_HOST", "steamdeck")
    probe = run("ssh", "-q", "-o", "BatchMode=yes", "-o", "ConnectTimeout=2", host, "exit")
    if probe.returncode:
        return [
            check(
                "deck-reachability",
                "WARN",
                "Optional normal Deck is offline",
                host=host,
                scope="normal",
            )
        ]
    script = """python3 - <<'PY'
import hashlib
import json
import os
import stat
import struct

def elf_error(data):
    if len(data) < 64 or data[:7] != bytes((127, 69, 76, 70, 2, 1, 1)):
        return "not a little-endian ELF64 file"
    if (
        struct.unpack_from("<H", data, 16)[0] not in (2, 3)
        or struct.unpack_from("<H", data, 18)[0] != 62
        or struct.unpack_from("<Q", data, 24)[0] == 0
    ):
        return "not an x86_64 executable"
    offset = struct.unpack_from("<Q", data, 32)[0]
    size = struct.unpack_from("<H", data, 54)[0]
    count = struct.unpack_from("<H", data, 56)[0]
    if (count and size < 56) or offset + size * count > len(data):
        return "malformed ELF program headers"
    for index in range(count):
        header = offset + index * size
        kind = struct.unpack_from("<I", data, header)[0]
        if kind == 3:
            return "dynamic interpreter is present"
        if kind == 2:
            dynamic_offset = struct.unpack_from("<Q", data, header + 8)[0]
            dynamic_size = struct.unpack_from("<Q", data, header + 32)[0]
            if dynamic_offset + dynamic_size > len(data) or dynamic_size % 16:
                return "malformed ELF dynamic table"
            for entry in range(dynamic_offset, dynamic_offset + dynamic_size, 16):
                if struct.unpack_from("<q", data, entry)[0] == 1:
                    return "dynamic library dependency is present"

plugin_root = "/home/deck/homebrew/plugins/Decky-Metadata"
paths = {
    "manifest": plugin_root + "/plugin.json",
    "bundle": plugin_root + "/dist/index.js",
    "download": "/home/deck/Downloads/Decky-Metadata.zip",
}
out = {}
for key, path in paths.items():
    out[key] = {"exists": os.path.isfile(path)}
    if os.path.isfile(path):
        with open(path, "rb") as file:
            data = file.read()
        out[key]["sha256"] = hashlib.sha256(data).hexdigest()
        out[key]["size"] = len(data)
    if key == "manifest" and os.path.isfile(path):
        with open(path, encoding="utf-8") as file:
            out[key]["version"] = json.load(file).get("version")

native_path = plugin_root + "/bin/backend"
backend = {
    "path": "bin/backend",
    "exists": os.path.isfile(native_path) and not os.path.islink(native_path),
    "manifest_path": None,
    "valid": False,
}
if os.path.isfile(paths["manifest"]):
    with open(paths["manifest"], encoding="utf-8") as file:
        backend["manifest_path"] = json.load(file).get("backend")
if backend["exists"]:
    with open(native_path, "rb") as file:
        data = file.read()
    mode = os.lstat(native_path).st_mode
    error = elf_error(data)
    backend.update(
        sha256=hashlib.sha256(data).hexdigest(),
        mode=format(stat.S_IMODE(mode), "06o"),
        valid=(
            backend["manifest_path"] == "bin/backend"
            and stat.S_ISREG(mode)
            and stat.S_IMODE(mode) == 0o755
            and error is None
        ),
        error=error,
    )
out["backend"] = backend
out["logs"] = os.path.isdir("/home/deck/homebrew/logs/Decky-Metadata")
out["debugger"] = os.path.isfile("/home/deck/.steam/steam/.cef-enable-remote-debugging")
print(json.dumps(out, sort_keys=True))
PY"""
    remote = run("ssh", host, script)
    try:
        details = json.loads(remote.stdout)
        backend_ok = details.get("backend", {}).get("valid") is True
        return [
            check("deck-reachability", "PASS", "Normal Deck is reachable", host=host, scope="normal"),
            check(
                "deck-state",
                "PASS" if backend_ok else "FAIL",
                "Normal Deck native package state collected"
                if backend_ok
                else "Normal Deck native backend is missing or invalid",
                scope="normal",
                **details,
            ),
        ]
    except json.JSONDecodeError:
        return [
            check(
                "deck-state",
                "WARN",
                "Normal Deck state probe returned malformed output",
                scope="normal",
                stderr=remote.stderr.strip(),
            )
        ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deck", action="store_true", help="add read-only Deck checks")
    parser.add_argument("--json", action="store_true", help="emit stable JSON")
    parser.add_argument("--quiet", action="store_true", help="suppress human output")
    args = parser.parse_args()
    try:
        root = git_root()
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1
    checks = local_checks(root)
    if args.deck:
        checks.extend(deck_checks(root))
    report = {"schema_version": SCHEMA_VERSION, "overall": aggregate(checks), "checks": checks}
    if args.json:
        print(json.dumps(report, sort_keys=True, separators=(",", ":")))
    elif not args.quiet:
        for item in checks:
            print(f"{item['status']:4} {item['id']}: {item['summary']}")
        print(f"OVERALL {report['overall']}")
    return 1 if report["overall"] == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())
