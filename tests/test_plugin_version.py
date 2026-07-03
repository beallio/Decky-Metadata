from __future__ import annotations

import asyncio
import json
from pathlib import Path

import main
from tests._plugin import make_plugin


def _write_json(path: Path, data: dict[str, object]) -> None:
    path.write_text(json.dumps(data), encoding="utf-8")


def test_resolve_plugin_version_prefers_plugin_json(
    tmp_path: Path, monkeypatch
) -> None:
    root = tmp_path / "Decky Metadata"
    nested = root / "py"
    nested.mkdir(parents=True)
    _write_json(root / "plugin.json", {"version": "0.1.0+abc1234"})
    _write_json(root / "package.json", {"version": "0.1.0"})
    monkeypatch.setattr(main, "__file__", str(nested / "main.py"))

    assert main._resolve_plugin_version() == "0.1.0+abc1234"


def test_resolve_plugin_version_falls_back_to_package_json(
    tmp_path: Path, monkeypatch
) -> None:
    root = tmp_path / "Decky Metadata"
    root.mkdir()
    _write_json(root / "plugin.json", {"version": ""})
    _write_json(root / "package.json", {"version": "0.1.0+fallback"})
    monkeypatch.setattr(main, "__file__", str(root / "main.py"))

    assert main._resolve_plugin_version() == "0.1.0+fallback"


def test_resolve_plugin_version_returns_base_literal_without_json(
    tmp_path: Path, monkeypatch
) -> None:
    root = tmp_path / "Decky Metadata"
    root.mkdir()
    monkeypatch.setattr(main, "__file__", str(root / "main.py"))

    assert main._resolve_plugin_version() == main.PLUGIN_BASE_VERSION


def test_get_plugin_version_returns_runtime_version(tmp_path: Path, monkeypatch) -> None:
    root = tmp_path / "Decky Metadata"
    root.mkdir()
    _write_json(root / "plugin.json", {"version": "0.1.0+runtime"})
    monkeypatch.setattr(main, "__file__", str(root / "main.py"))

    plugin = make_plugin()

    assert asyncio.run(plugin.get_plugin_version()) == "0.1.0+runtime"
