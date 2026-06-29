import os
import io
import pytest
from pathlib import Path

# Provide a mock Image module if Pillow is absent in the environment
class MockImage:
    pass

import main

def test_xbox_cropper_name(monkeypatch):
    plugin = main.Plugin.__new__(main.Plugin)

    # Test Linux without Pillow
    monkeypatch.setattr(main, "Image", None)
    monkeypatch.setattr(os, "name", "posix")
    assert plugin._xbox_cropper_name() == "none"

    # Test Linux with Pillow
    monkeypatch.setattr(main, "Image", MockImage)
    assert plugin._xbox_cropper_name() == "pillow"
    
    # Test Windows without Pillow (should return windows if powershell exists, else none)
    monkeypatch.setattr(os, "name", "nt")
    monkeypatch.setattr(main, "Image", None)
    monkeypatch.setattr(plugin, "_windows_powershell_executable", lambda: "powershell.exe")
    assert plugin._xbox_cropper_name() == "windows"

def test_download_and_crop_xbox_icon_fallback(monkeypatch, tmp_path):
    plugin = main.Plugin.__new__(main.Plugin)
    monkeypatch.setattr(main, "Image", None)
    monkeypatch.setattr(os, "name", "posix")
    monkeypatch.setattr(plugin, "_windows_powershell_executable", lambda: "")
    
    # Mock urlopen to return a fake image
    class MockResponse:
        def read(self):
            return b"fake_image_bytes"
        def __enter__(self): return self
        def __exit__(self, exc_type, exc_val, exc_tb): pass
    
    def mock_urlopen(request, timeout=25, context=None):
        return MockResponse()
    
    monkeypatch.setattr(main.urllib.request, "urlopen", mock_urlopen)
    
    # Ensure crop entry point returns gracefully and just writes the raw bytes
    out_path = tmp_path / "out.png"
    plugin._download_and_crop_xbox_icon("http://fake.com/img.png", out_path)
    
    assert out_path.exists()
    assert out_path.read_bytes() == b"fake_image_bytes"
