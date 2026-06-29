from __future__ import annotations

import inspect

import main


def test_main_imports_with_fake_decky() -> None:
    assert inspect.isclass(main.Plugin)
