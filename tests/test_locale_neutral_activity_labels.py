from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]

ITALIAN_TOKENS = (
    "Aggiornamento",
    "Notizie",
    "Pubblicazione",
    "bottino",
    "vantaggi",
    "sfida",
    "nel gioco",
)


@pytest.fixture()
def source() -> str:
    return (ROOT / "src" / "steam" / "activity.ts").read_text(encoding="utf-8")


def test_activity_type_labels_have_no_italian_residue(source: str) -> None:
    for token in ITALIAN_TOKENS:
        assert token not in source, f"found leftover Italian token {token!r} in activity.ts"


def test_activity_type_labels_use_english_fallback(source: str) -> None:
    assert '"News"' in source
    assert '|| "News"' in source
