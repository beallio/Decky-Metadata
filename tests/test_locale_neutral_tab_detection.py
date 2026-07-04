from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_tab_text_normalization_does_not_pin_italian_locale() -> None:
    source = (ROOT / "src" / "steam" / "core.ts").read_text(encoding="utf-8")

    assert 'toLocaleLowerCase("it-IT")' not in source
