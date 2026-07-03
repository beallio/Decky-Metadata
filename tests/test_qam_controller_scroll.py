from pathlib import Path
import re


PROJECT_ROOT = Path(__file__).resolve().parents[1]
COMPONENTS = PROJECT_ROOT / "src" / "components.tsx"

NAVIGABLE_FIELD = (
    r'<Field focusable={true} highlightOnFocus={true} childrenLayout="below" '
    r'padding="standard" bottomSeparator="none">'
)


def _content_source() -> str:
    source = COMPONENTS.read_text(encoding="utf-8")
    start = source.index("export const Content = () => {")
    end = source.index("export const MetadataPage = () => {")
    return source[start:end]


def test_qam_stats_block_is_own_navigable_panel_section() -> None:
    content = _content_source()

    assert re.search(
        rf"<PanelSection>\s*"
        rf"<PanelSectionRow>\s*"
        rf"{re.escape(NAVIGABLE_FIELD)}\s*"
        rf"<div style={{rowStackStyle}}>.*?"
        rf"Detected non-Steam games.*?"
        rf"Metadata saved.*?"
        rf"Missing metadata",
        content,
        flags=re.DOTALL,
    )


def test_qam_versions_block_is_own_navigable_panel_section() -> None:
    content = _content_source()

    assert re.search(
        rf'<PanelSection title="Versions">\s*'
        rf"<PanelSectionRow>\s*"
        rf"{re.escape(NAVIGABLE_FIELD)}\s*"
        rf"<div style={{diagnosticsGridStyle}}>.*?"
        rf"Plugin.*?"
        rf"Commit.*?"
        rf"Delisted index.*?"
        rf"Metadata",
        content,
        flags=re.DOTALL,
    )
