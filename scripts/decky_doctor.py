#!/usr/bin/env python3
"""Stable, read-only project and optional Deck health report."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import zipfile
from pathlib import Path

SCHEMA_VERSION = 1


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


def archive_metadata(path: Path) -> dict[str, object]:
    result: dict[str, object] = {"path": str(path), "exists": path.is_file()}
    if not path.is_file():
        return result
    result["sha256"] = sha256(path)
    try:
        with zipfile.ZipFile(path) as archive:
            plugin = json.loads(archive.read("Decky-Metadata/plugin.json"))
            result["version"] = plugin.get("version")
    except (OSError, KeyError, json.JSONDecodeError, zipfile.BadZipFile) as error:
        result["error"] = str(error)
    return result


def effective_base(root: Path) -> str:
    base = "main"
    for name in ("orchestration.conf", "orchestration.conf.local"):
        path = root / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            if line.startswith("ORCH_BASE_BRANCH="):
                base = line.split("=", 1)[1].strip().strip("\"'")
    return base


def local_checks(root: Path) -> list[dict[str, object]]:
    checks: list[dict[str, object]] = []
    branch = run("git", "branch", "--show-current", cwd=root).stdout.strip()
    status = run("git", "status", "--porcelain", "--untracked-files=all", cwd=root).stdout.splitlines()
    checks.append(check("repository", "PASS", "Git repository located", root=str(root), branch=branch, base=effective_base(root)))
    checks.append(check("working-tree", "WARN" if status else "PASS", "Working tree has changes" if status else "Working tree is clean", entries=status))
    required = ["git", "node", "npm", "python3", "uv"]
    missing = [name for name in required if shutil.which(name) is None]
    checks.append(check("tools", "FAIL" if missing else "PASS", "Required tools checked", missing=missing))
    dep_files = ["package.json", "package-lock.json", "plugin.json"]
    absent = [name for name in dep_files if not (root / name).is_file()]
    checks.append(check("dependency-files", "FAIL" if absent else "PASS", "Dependency manifests checked", missing=absent))
    try:
        package_version = json.loads((root / "package.json").read_text())["version"]
        plugin_version = json.loads((root / "plugin.json").read_text())["version"]
        same = package_version == plugin_version
        checks.append(check("version-agreement", "PASS" if same else "FAIL", "Manifest versions agree" if same else "Manifest versions differ", package=package_version, plugin=plugin_version))
    except (OSError, KeyError, json.JSONDecodeError) as error:
        checks.append(check("version-agreement", "FAIL", "Could not read manifest versions", error=str(error)))
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
        nonblank = [line for line in body.splitlines() if line.strip()]
        expected_lines = {
            f'exec "$(git rev-parse --show-toplevel)/{delegate}" "$@"',
            f'exec "$repo_root/{delegate}"',
        }
        if not nonblank or nonblank[-1] not in expected_lines or not os.access(hook, os.X_OK):
            drift[name] = "missing, non-executable, or wrong delegate"
    checks.append(check("git-hooks", "FAIL" if drift else "PASS", "Git hooks checked", drift=drift, delegates=expected))
    protocol = (root / ".protocol").read_text(errors="replace") if (root / ".protocol").exists() else ""
    wrapper = (root / "run.sh").read_text(errors="replace") if (root / "run.sh").exists() else ""
    cache_ok = "CACHE_ROOT=/tmp/Decky-Metadata" in protocol and "PYTHONPYCACHEPREFIX" in wrapper
    pycache = sorted(str(path.relative_to(root)) for path in root.rglob("__pycache__") if ".git" not in path.parts)
    checks.append(check("cache-policy", "WARN" if pycache else "PASS" if cache_ok else "FAIL", "Cache policy checked", configured=cache_ok, repository_pycache=pycache))
    checks.append(check("node-modules-location", "WARN" if (root / "node_modules").exists() else "PASS", "Repository-local node_modules is intentionally retained"))
    archive = archive_metadata(root / "Decky-Metadata.zip")
    head = run("git", "rev-parse", "--short", "HEAD", cwd=root).stdout.strip()
    current = bool(archive.get("version", "").endswith(f"+{head}"))
    checks.append(check("local-package", "PASS" if current else "WARN", "Local package represents HEAD" if current else "Local package is absent or stale", head=head, **archive))
    executables = ["scripts/deck/cdp.py", "scripts/deck/tunnel.sh", "scripts/deck/deploy.sh", "scripts/orchestration-hooks/quality-gates", "scripts/orchestration-hooks/finalize-release"]
    bad = [name for name in executables if not (root / name).is_file() or not os.access(root / name, os.X_OK)]
    checks.append(check("project-tools", "FAIL" if bad else "PASS", "Tracked project tools checked", invalid=bad))
    return checks


def deck_checks(root: Path) -> list[dict[str, object]]:
    host = os.environ.get("DECKY_DECK_HOST", "steamdeck")
    probe = run("ssh", "-q", "-o", "BatchMode=yes", "-o", "ConnectTimeout=2", host, "exit")
    if probe.returncode:
        return [check("deck-reachability", "WARN", "Optional Deck is offline", host=host)]
    script = """python3 - <<'PY'\nimport hashlib,json,os\npaths={'manifest':'/home/deck/homebrew/plugins/Decky-Metadata/plugin.json','bundle':'/home/deck/homebrew/plugins/Decky-Metadata/dist/index.js','download':'/home/deck/Downloads/Decky-Metadata.zip'}\nout={}\nfor key,path in paths.items():\n out[key]={'exists':os.path.isfile(path)}\n if os.path.isfile(path):\n  out[key]['sha256']=hashlib.sha256(open(path,'rb').read()).hexdigest()\n  out[key]['size']=os.path.getsize(path)\n if key=='manifest' and os.path.isfile(path): out[key]['version']=json.load(open(path)).get('version')\nout['logs']=os.path.isdir('/home/deck/homebrew/logs/Decky-Metadata')\nout['debugger']=os.path.isfile('/home/deck/.steam/steam/.cef-enable-remote-debugging')\nprint(json.dumps(out,sort_keys=True))\nPY"""
    remote = run("ssh", host, script)
    try:
        details = json.loads(remote.stdout)
        return [check("deck-reachability", "PASS", "Deck is reachable", host=host), check("deck-state", "PASS", "Read-only Deck state collected", **details)]
    except json.JSONDecodeError:
        return [check("deck-state", "WARN", "Deck state probe returned malformed output", stderr=remote.stderr.strip())]


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
