#!/usr/bin/env python3
"""Resolve private host-side evidence paths beneath the configured temp root."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys


_REPOSITORY = Path(__file__).resolve().parents[2]
_FALLBACK_TMP = Path("/var/tmp/omp-1000")


def _has_parent_component(path: Path) -> bool:
    return ".." in path.parts


def _temporary_base() -> Path:
    raw = os.environ.get("TMPDIR")
    path = Path(raw) if raw else _FALLBACK_TMP
    if not raw:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if _has_parent_component(path):
        raise ValueError("TMPDIR must not contain '..'")
    try:
        resolved = path.expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"temporary base is unavailable: {path}") from exc
    if not resolved.is_dir() or resolved == Path(resolved.anchor):
        raise ValueError("temporary base must be an existing non-root directory")
    return resolved


def root_path() -> Path:
    """Return the canonical scratch root without creating it."""
    base = _temporary_base()
    raw = os.environ.get("DECKY_TMP_ROOT")
    configured = Path(raw) if raw else base / "Decky-Metadata"
    if _has_parent_component(configured):
        raise ValueError("DECKY_TMP_ROOT must not contain '..'")
    if raw and not configured.is_absolute():
        raise ValueError("DECKY_TMP_ROOT must be absolute")
    try:
        root = configured.expanduser().resolve(strict=False)
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"cannot resolve DECKY_TMP_ROOT: {configured}") from exc
    if root == base or base not in root.parents:
        raise ValueError("DECKY_TMP_ROOT must resolve strictly below the temporary base")
    if root == Path(root.anchor) or root == _REPOSITORY or root.is_relative_to(_REPOSITORY):
        raise ValueError("DECKY_TMP_ROOT must not be the repository or filesystem root")
    return root


def output_path(path: str | os.PathLike[str]) -> Path:
    """Resolve a file/directory output strictly below the canonical scratch root."""
    raw = Path(path)
    if not raw.parts or _has_parent_component(raw):
        raise ValueError("output path must not be empty or contain '..'")
    root = root_path()
    candidate = raw if raw.is_absolute() else root / raw
    try:
        resolved = candidate.expanduser().resolve(strict=False)
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"cannot resolve output path: {candidate}") from exc
    if resolved == root or root not in resolved.parents:
        raise ValueError(f"output path must resolve strictly below {root}")
    if resolved == Path(resolved.anchor) or resolved == _REPOSITORY or resolved.is_relative_to(_REPOSITORY) or _REPOSITORY.is_relative_to(resolved):
        raise ValueError("output path must not be the repository or filesystem root")
    return resolved


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("root")
    validate = subparsers.add_parser("validate")
    validate.add_argument("path")
    args = parser.parse_args(argv)
    try:
        if args.command == "root":
            print(root_path())
        else:
            print(output_path(args.path))
    except (OSError, ValueError) as exc:
        print(f"temp_paths: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
