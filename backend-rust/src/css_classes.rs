use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

const MAX_TRANSLATIONS_BYTES: u64 = 16 * 1024 * 1024;

/// Canonical CSS Loader mapping keys used by Decky Metadata on Steam Vite/Rolldown
/// builds where Webpack JS CSS-module objects are tree-shaken away.
const TRANSLATION_KEYS: &[(&str, &str)] = &[
    ("appDetailsHeader", "9jzUK0EK_Header"),
    ("appDetailsInnerContainer", "9jzUK0EK_InnerContainer"),
    ("playSection", "L3jh3XgZ_PlaySection"),
    ("appDetailsRoot", "L3jh3XgZ_AppDetailsRoot"),
    ("appActionButton", "L3jh3XgZ_AppActionButton"),
    ("appButtons", "L3jh3XgZ_AppButtons"),
    ("gameInfoQuickLinks", "L3jh3XgZ_GameInfoQuickLinks"),
    ("gameInfoContainer", "L3jh3XgZ_GameInfoContainer"),
    ("topCapsule", "ELzXGJn8_TopCapsule"),
    ("headerBackgroundImage", "ELzXGJn8_HeaderBackgroundImage"),
    ("fullscreenEnterStart", "ELzXGJn8_FullscreenEnterStart"),
    ("fullscreenEnterActive", "ELzXGJn8_FullscreenEnterActive"),
    ("fullscreenEnterDone", "ELzXGJn8_FullscreenEnterDone"),
    ("fullscreenExitStart", "ELzXGJn8_FullscreenExitStart"),
    ("fullscreenExitActive", "ELzXGJn8_FullscreenExitActive"),
    ("fullscreenExitDone", "ELzXGJn8_FullscreenExitDone"),
    ("cloudStatusRow", "cuOVbdpY_CloudStatusRow"),
    ("menuButton", "cuOVbdpY_MenuButton"),
    ("controllerConfigButton", "cuOVbdpY_ControllerConfigButton"),
    ("gameStatsSection", "cuOVbdpY_GameStatsSection"),
    ("playBar", "cuOVbdpY_PlayBar"),
    ("deckVerifiedInfo", "ss4TzIku_DeckVerifiedInfo"),
    ("deckVerifiedDetails", "ss4TzIku_Details"),
    ("deckVerifiedFocused", "ss4TzIku_Focused"),
    ("gameDescription", "ss4TzIku_GameDescription"),
    ("descriptionInnerContainer", "ss4TzIku_InnerContainer"),
    ("libraryItemBox", "E9TkPRCA_LibraryItemBox"),
    ("libraryItemDraggable", "E9TkPRCA_Draggable"),
    ("libraryItemIcons", "E9TkPRCA_LibraryItemIcons"),
    (
        "libraryItemOverlayInnerArea",
        "E9TkPRCA_LibraryItemOverlayInnerArea",
    ),
    ("recentGamesContainer", "tjjBDocm_RecentGamesContainer"),
    (
        "recentGamesBackgroundImages",
        "tjjBDocm_RecentGamesBackgroundImages",
    ),
    ("playButton", "wGpIi7EP_PlayButton"),
];

fn is_valid_css_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == '_' || first == '-')
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

/// Read the latest translated Steam CSS class names from CSS Loader's local
/// `~/homebrew/themes/css_translations.json`, if present.
///
/// Always returns an empty map when CSS Loader is not installed, the file is
/// missing, symlinked, oversized, or unparseable.
pub fn resolve_translated_css_classes(decky_home: &Path) -> BTreeMap<String, String> {
    if decky_home.as_os_str().is_empty() {
        return BTreeMap::new();
    }
    let themes_dir = decky_home.join("themes");
    if fs::symlink_metadata(&themes_dir)
        .map(|meta| meta.file_type().is_symlink() || !meta.is_dir())
        .unwrap_or(true)
    {
        return BTreeMap::new();
    }
    let path = themes_dir.join("css_translations.json");
    let Ok(meta) = fs::symlink_metadata(&path) else {
        return BTreeMap::new();
    };
    if meta.file_type().is_symlink() || !meta.is_file() || meta.len() > MAX_TRANSLATIONS_BYTES {
        return BTreeMap::new();
    }
    let Ok(raw) = fs::read_to_string(&path) else {
        return BTreeMap::new();
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return BTreeMap::new();
    };
    let Some(map) = parsed.as_object() else {
        return BTreeMap::new();
    };

    let mut resolved = BTreeMap::new();
    for &(field, canonical) in TRANSLATION_KEYS {
        let Some(latest) = map
            .get(canonical)
            .and_then(|value| value.as_array())
            .and_then(|entries| entries.last())
            .and_then(|value| value.as_str())
        else {
            continue;
        };
        if is_valid_css_identifier(latest) {
            resolved.insert(field.to_string(), latest.to_string());
        }
    }
    resolved
}

#[cfg(test)]
mod tests {
    use super::resolve_translated_css_classes;
    use std::fs;
    use std::os::unix::fs::symlink;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "decky-metadata-css-classes-{}-{}",
                std::process::id(),
                unique
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn resolves_latest_valid_entries_and_rejects_symlinks() {
        let dir = TempDir::new();
        let home = dir.0.join("homebrew");
        let themes = home.join("themes");
        fs::create_dir_all(&themes).unwrap();
        let path = themes.join("css_translations.json");
        fs::write(
            &path,
            r#"{
                "9jzUK0EK_InnerContainer": ["_1SvpjsckP9cPRxO6gCBHrw", "aqfOaplliDM-"],
                "E9TkPRCA_Draggable": ["_1pwP4eeP1zQD7PEgmsep0W", "E6FHi-jyiIw-"],
                "cuOVbdpY_GameStatsSection": ["_1mDAVT4sTzFRwJtlKCw2Ws", "DX26wbzR1iU-"],
                "L3jh3XgZ_PlaySection": ["bad class; injected"]
            }"#,
        )
        .unwrap();

        let resolved = resolve_translated_css_classes(&home);
        assert_eq!(
            resolved.get("appDetailsInnerContainer").map(String::as_str),
            Some("aqfOaplliDM-")
        );
        assert_eq!(
            resolved.get("libraryItemDraggable").map(String::as_str),
            Some("E6FHi-jyiIw-")
        );
        assert_eq!(
            resolved.get("gameStatsSection").map(String::as_str),
            Some("DX26wbzR1iU-")
        );
        assert!(!resolved.contains_key("playSection"));

        // Symlinked css_translations.json must be rejected.
        let target = dir.0.join("outside.json");
        fs::write(&target, r#"{"L3jh3XgZ_PlaySection": ["XzQVNZx-stM-"]}"#).unwrap();
        fs::remove_file(&path).unwrap();
        symlink(&target, &path).unwrap();
        assert!(resolve_translated_css_classes(&home).is_empty());
    }
}
