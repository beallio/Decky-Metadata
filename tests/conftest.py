from __future__ import annotations

import logging
import sys
import types
from pathlib import Path
from unittest.mock import Mock


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


class FakeDecky(types.ModuleType):
    logger = logging.getLogger("tests.decky")
    DECKY_PLUGIN_DIR = str(REPO_ROOT)
    DECKY_PLUGIN_SETTINGS_DIR = "/tmp/Decky-Metadata/test-settings"

    def __getattr__(self, name: str) -> Mock:
        value = Mock(name=f"decky.{name}")
        setattr(self, name, value)
        return value


sys.modules.setdefault("decky", FakeDecky("decky"))
