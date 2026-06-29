import os
from unittest.mock import patch
import pytest

import main

def test_resolve_xbox_from_shortcut_sync_short_circuits_on_non_windows():
    plugin = main.Plugin.__new__(main.Plugin)
    
    with patch("os.name", "posix"):
        result = plugin._resolve_xbox_from_shortcut_sync(12345, "Test Game", "/path/to/game")
        
    assert result == {
        "ok": False,
        "reason": "uwphook_auto_unsupported_on_platform",
        "manual_supported": True
    }

def test_resolve_xbox_from_shortcut_sync_proceeds_on_windows():
    plugin = main.Plugin.__new__(main.Plugin)
    
    with patch("os.name", "nt"), \
         patch.object(plugin, "_load_data"), \
         patch.object(plugin, "_is_uwphook_shortcut", return_value=False):
         
        result = plugin._resolve_xbox_from_shortcut_sync(12345, "Test Game", "/path/to/game")
        
        # If it returns None here, it means it passed the os.name guard and hit the _is_uwphook_shortcut check.
        assert result is None
