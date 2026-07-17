from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTENT_PANEL = ROOT / "src" / "ContentPanel.tsx"
QAM_DIR = ROOT / "src" / "components" / "qam"


def _source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_content_panel_composes_four_qam_sections_in_approved_order() -> None:
    source = _source(CONTENT_PANEL)
    components = (
        "MetadataSection",
        "DelistedIndexSection",
        "LogsSection",
        "VersionsSection",
    )

    positions = [source.index(f"<{component}") for component in components]

    assert positions == sorted(positions)
    for component in components:
        assert re.search(rf"import\s+\{{\s*{component}\s*\}}", source)

    assert "<Focusable" in source
    assert "preferredFocus={true}" in source
    assert (
        "navEntryPreferPosition={NavEntryPositionPreferences.PREFERRED_CHILD}" in source
    )
    assert "getGamepadNavigationTrees" in source
    assert ".BTakeFocus()" in source
    assert "ref={focusPanel}" in source
    assert "useLayoutEffect" not in source
    assert "requestAnimationFrame" in source
    assert "cancelAnimationFrame" in source
    assert ".focus(" not in source
    assert "setTimeout" not in source


def test_metadata_section_has_preferred_summary_and_approved_copy() -> None:
    source = _source(QAM_DIR / "MetadataSection.tsx")

    assert 'title="Metadata"' in source
    assert "preferredFocus={true}" in source
    assert "Detected non-Steam games" in source
    assert "Metadata saved" in source
    assert "Missing metadata" in source
    assert (
        "Find and save metadata for detected non-Steam games that do not have a match yet."
        in source
    )
    assert "Refresh metadata" in source
    assert "Metadata cache" in source
    assert "Clear saved matches and metadata so games can be matched again." in source
    assert "Clear cache" in source


def test_qam_descriptions_render_below_their_buttons() -> None:
    metadata = _source(QAM_DIR / "MetadataSection.tsx")

    # The helper copy now follows its button rather than preceding it.
    assert metadata.index("Find and save metadata") > metadata.index("Refresh metadata")
    assert metadata.index("Clear saved matches and metadata") > metadata.index(
        "Clear cache"
    )


def test_qam_separator_contract_is_explicit() -> None:
    metadata = _source(QAM_DIR / "MetadataSection.tsx")
    delisted = _source(QAM_DIR / "DelistedIndexSection.tsx")

    # Neither action button draws a rule; the Metadata panel is closed by the
    # standard separator on its final (Clear cache) description.
    refresh_metadata = re.search(
        r'<ButtonItem[^>]*bottomSeparator="none"[^>]*>[\s\S]*?Refresh metadata[\s\S]*?</ButtonItem>',
        metadata,
    )
    clear_cache = re.search(
        r'<ButtonItem[^>]*bottomSeparator="none"[^>]*>[\s\S]*?Clear cache[\s\S]*?</ButtonItem>',
        metadata,
    )
    cache_description_closes_panel = re.search(
        r'bottomSeparator="standard"[\s\S]*?Clear saved matches and metadata',
        metadata,
    )
    refresh_delisted = re.search(
        r'<ButtonItem[^>]*bottomSeparator="standard"[^>]*>[\s\S]*?Refresh delisted games[\s\S]*?</ButtonItem>',
        delisted,
    )

    assert refresh_metadata
    assert clear_cache
    assert cache_description_closes_panel
    assert refresh_delisted


def test_logs_and_versions_match_the_stable_qam_contract() -> None:
    logs = _source(QAM_DIR / "LogsSection.tsx")
    versions = _source(QAM_DIR / "VersionsSection.tsx")
    modal = _source(QAM_DIR / "PluginLogModal.tsx")

    assert 'title="Logs"' in logs
    assert "View Logs" in logs
    assert "Debug Logging" in logs
    assert "Enables verbose logging for troubleshooting." in logs
    assert 'title="Versions"' in versions
    assert "Decky Metadata:" in versions
    assert "Decky:" in versions
    assert "SteamOS:" in versions
    assert "Unknown" in versions
    assert 'strTitle="Plugin Logs"' in modal
    assert "No recent logs" in modal
    assert "bAlertDialog={true}" in modal


def test_bulk_activity_refresh_is_removed_only_from_frontend_qam_path() -> None:
    content = _source(CONTENT_PANEL)
    activity = _source(ROOT / "src" / "steam" / "activity.ts")
    install = _source(ROOT / "src" / "steam" / "install.ts")
    backend = _source(ROOT / "src" / "backend.ts")
    python_backend = _source(ROOT / "main.py")

    for removed in (
        "getActivityRefreshProgress",
        "startRefreshSteamActivities",
        "activityBusy",
        "activityMessage",
        "activityStatusKind",
        "refreshActivities",
        "Refresh Activity",
        "decky-metadata:activity-refreshed",
    ):
        assert removed not in content

    assert "installActivityRefreshedListener" not in activity
    assert "installActivityRefreshedListener" not in install
    assert "refreshSteamActivityForApp" in activity
    assert "refreshDeckyNativeActivityForApp" in activity
    assert "refreshDeckyNativeActivityForApp" in install
    assert "startRefreshSteamActivities" in backend
    assert "getActivityRefreshProgress" in backend
    assert "start_refresh_steam_activities" in python_backend
    assert "get_activity_refresh_progress" in python_backend
