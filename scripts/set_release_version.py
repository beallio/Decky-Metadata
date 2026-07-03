#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


def _read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict[str, object]) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _metadata_paths(project_root: Path) -> tuple[Path, Path]:
    return project_root / "plugin.json", project_root / "package.json"


def set_release_version(version: str, project_root: Path) -> None:
    if not SEMVER_RE.fullmatch(version):
        raise ValueError(f"Version '{version}' is not a stable semantic version. Must match X.Y.Z.")

    plugin_path, package_path = _metadata_paths(project_root)
    if not plugin_path.is_file():
        raise FileNotFoundError(f"plugin.json not found at: {plugin_path}")
    if not package_path.is_file():
        raise FileNotFoundError(f"package.json not found at: {package_path}")

    plugin_data = _read_json(plugin_path)
    package_data = _read_json(package_path)

    plugin_data["version"] = version
    package_data["version"] = version

    _write_json(plugin_path, plugin_data)
    _write_json(package_path, package_data)


def main() -> int:
    parser = argparse.ArgumentParser(description="Set the release version in metadata files.")
    parser.add_argument("version", help="Stable semver version, for example 0.2.1.")
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path.cwd(),
        help="Project root containing package.json and plugin.json.",
    )
    args = parser.parse_args()

    try:
        set_release_version(args.version, args.project_root.resolve())
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Updated plugin.json and package.json version to {args.version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
