from __future__ import annotations

from typing import Any

import main


def make_plugin(**attrs: Any) -> main.Plugin:
    # Pure helper-method tests should bypass Decky's async lifecycle and set only
    # the attributes exercised by the helper under test.
    plugin = main.Plugin.__new__(main.Plugin)
    for name, value in attrs.items():
        setattr(plugin, name, value)
    return plugin
