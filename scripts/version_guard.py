#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections.abc import Iterable


def parse_semver(text: str) -> tuple[int, int, int]:
    version = text.lstrip("v")
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", version)
    if not match:
        raise ValueError(f"Invalid stable semver: {text}")

    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def next_patch_version(version: str) -> str:
    major, minor, patch = parse_semver(version)
    return f"{major}.{minor}.{patch + 1}"


def highest_stable_version(tags: Iterable[str]) -> tuple[int, int, int] | None:
    highest: tuple[int, int, int] | None = None
    for tag in tags:
        try:
            version = parse_semver(tag)
        except ValueError:
            continue

        if highest is None or version > highest:
            highest = version

    return highest


def is_base_ahead_of_stable(base: str, tags: Iterable[str]) -> bool:
    base_version = parse_semver(base)
    highest = highest_stable_version(tags)
    if highest is None:
        return True

    return base_version > highest


def is_version_behind_stable(version: str, tags: Iterable[str]) -> bool:
    current_version = parse_semver(version)
    highest = highest_stable_version(tags)
    if highest is None:
        return False

    return current_version < highest


def _format_version(version: tuple[int, int, int]) -> str:
    return f"{version[0]}.{version[1]}.{version[2]}"


def _read_git_tags() -> list[str]:
    try:
        result = subprocess.run(
            ["git", "tag", "-l"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return []

    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def _check_drift(version: str, tags: list[str]) -> int:
    try:
        if not is_version_behind_stable(version, tags):
            return 0
    except ValueError as exc:
        print(f"Error parsing version: {exc}", file=sys.stderr)
        return 1

    highest = highest_stable_version(tags)
    highest_text = _format_version(highest) if highest else "unknown"
    print(
        f"base version {version} is behind released stable tag v{highest_text}; "
        "bump package.json/plugin.json with scripts/set_release_version.py",
        file=sys.stderr,
    )
    return 1


def _check_base(version: str, tags: list[str]) -> int:
    try:
        if is_base_ahead_of_stable(version, tags):
            return 0
    except ValueError as exc:
        print(f"Error parsing version: {exc}", file=sys.stderr)
        return 1

    highest = highest_stable_version(tags)
    highest_text = _format_version(highest) if highest else "unknown"
    print(
        f"base version {version} is not ahead of released stable tag v{highest_text}; "
        "bump package.json/plugin.json with scripts/set_release_version.py",
        file=sys.stderr,
    )
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Check and compute Decky Metadata release versions.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    check_drift = subparsers.add_parser("check-drift", help="Fail when VERSION is behind tags.")
    check_drift.add_argument("version")

    check_base = subparsers.add_parser("check-base", help="Fail unless VERSION is ahead of tags.")
    check_base.add_argument("version")

    next_patch = subparsers.add_parser("next-patch", help="Print the next patch version.")
    next_patch.add_argument("version")

    subparsers.add_parser("highest", help="Print the highest stable tag, if any.")

    args = parser.parse_args()

    if args.command == "next-patch":
        try:
            print(next_patch_version(args.version))
        except ValueError as exc:
            print(f"Error parsing version: {exc}", file=sys.stderr)
            return 1
        return 0

    tags = _read_git_tags()

    if args.command == "highest":
        highest = highest_stable_version(tags)
        if highest is not None:
            print(f"v{_format_version(highest)}")
        return 0

    if args.command == "check-drift":
        return _check_drift(args.version, tags)

    if args.command == "check-base":
        return _check_base(args.version, tags)

    parser.print_usage(sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
