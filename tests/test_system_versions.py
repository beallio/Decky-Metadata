from __future__ import annotations

import asyncio

import main
from tests._plugin import make_plugin


OS_RELEASE_SAMPLE = (
    'NAME="SteamOS"\n'
    'PRETTY_NAME="SteamOS"\n'
    "# a comment line\n"
    "VARIANT_ID=steamdeck\n"
    "VERSION_ID=3.8.14\n"
    "BUILD_ID=20260703.1\n"
)


def test_parse_os_release_field_unquoted() -> None:
    assert main._parse_os_release_field(OS_RELEASE_SAMPLE, "VERSION_ID") == "3.8.14"


def test_parse_os_release_field_strips_quotes() -> None:
    assert main._parse_os_release_field(OS_RELEASE_SAMPLE, "NAME") == "SteamOS"


def test_parse_os_release_field_missing_key_returns_empty() -> None:
    assert main._parse_os_release_field(OS_RELEASE_SAMPLE, "NOT_PRESENT") == ""


def test_parse_os_release_field_ignores_comments_and_blanks() -> None:
    text = "\n# VERSION_ID=9.9.9\n   \nVERSION_ID=1.2.3\n"
    assert main._parse_os_release_field(text, "VERSION_ID") == "1.2.3"


def test_read_steamos_version_reads_file(tmp_path) -> None:
    path = tmp_path / "os-release"
    path.write_text(OS_RELEASE_SAMPLE, encoding="utf-8")
    assert main._read_steamos_version(path) == "3.8.14"


def test_read_steamos_version_missing_file_returns_empty(tmp_path) -> None:
    assert main._read_steamos_version(tmp_path / "missing") == ""


def test_resolve_decky_version_ignores_non_string_attr(monkeypatch) -> None:
    # The test harness stubs `decky` so any attribute is a Mock; a non-string
    # attribute must not leak into the reported version.
    monkeypatch.delenv("DECKY_VERSION", raising=False)
    assert main._resolve_decky_version() == ""


def test_resolve_decky_version_uses_env_fallback(monkeypatch) -> None:
    monkeypatch.setattr(main.decky, "DECKY_VERSION", None, raising=False)
    monkeypatch.setenv("DECKY_VERSION", "3.1.5")
    assert main._resolve_decky_version() == "3.1.5"


def test_get_system_versions_reports_both(monkeypatch) -> None:
    monkeypatch.setattr(main, "_resolve_decky_version", lambda: "3.1.5")
    monkeypatch.setattr(main, "_read_steamos_version", lambda: "3.8.14")
    plugin = make_plugin()
    result = asyncio.run(plugin.get_system_versions())
    assert result == {"decky": "3.1.5", "steamos": "3.8.14"}


def test_get_system_versions_falls_back_to_unknown(monkeypatch) -> None:
    monkeypatch.setattr(main, "_resolve_decky_version", lambda: "")
    monkeypatch.setattr(main, "_read_steamos_version", lambda: "")
    plugin = make_plugin()
    result = asyncio.run(plugin.get_system_versions())
    assert result == {"decky": "Unknown", "steamos": "Unknown"}
