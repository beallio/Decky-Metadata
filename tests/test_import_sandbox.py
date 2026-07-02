from __future__ import annotations

import logging
from pathlib import Path
import sys
import types


def test_main_execs_when_module_name_is_absent_from_sys_modules() -> None:
    module_name = "Decky Metadata.main"
    original_decky = sys.modules.get("decky")
    had_decky = "decky" in sys.modules
    source_path = Path(__file__).resolve().parents[1] / "main.py"

    decky = types.ModuleType("decky")
    decky.logger = logging.getLogger("tests.decky.sandbox")
    decky.DECKY_PLUGIN_LOG_DIR = "/tmp/Decky-Metadata/test-logs"
    decky.DECKY_PLUGIN_RUNTIME_DIR = "/tmp/Decky-Metadata/test-runtime"
    decky.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/Decky-Metadata/test-settings"
    decky.DECKY_PLUGIN_DIR = str(source_path.parent)

    assert module_name not in sys.modules

    try:
        sys.modules["decky"] = decky
        namespace = {"__name__": module_name, "__file__": str(source_path)}
        source = source_path.read_text(encoding="utf-8")

        exec(compile(source, str(source_path), "exec"), namespace)

        steam_install = namespace["SteamInstall"](
            root=Path("/x"),
            userdata_dirs=[],
            shortcut_files=[],
            libraryfolders_files=[],
            appmanifest_dirs=[],
        )
        assert steam_install.root == Path("/x")
        assert steam_install.userdata_dirs == []
        assert steam_install.shortcut_files == []
        assert steam_install.libraryfolders_files == []
        assert steam_install.appmanifest_dirs == []
    finally:
        sys.modules.pop(module_name, None)
        if had_decky:
            sys.modules["decky"] = original_decky
        else:
            sys.modules.pop("decky", None)
