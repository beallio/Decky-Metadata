//! Steam content language.
//!
//! The plugin interface follows the Steam UI language through its own catalogs;
//! downloaded metadata follows the same Steam language, but Steam accepts its
//! own language names (`l=french`) rather than BCP-47 tags, so every provider
//! boundary converts through this module.

/// Steam language name and its canonical BCP-47 tag, newest Steam list.
pub const STEAM_LANGUAGES: &[(&str, &str)] = &[
    ("english", "en"),
    ("german", "de"),
    ("french", "fr"),
    ("italian", "it"),
    ("koreana", "ko"),
    ("spanish", "es"),
    ("latam", "es-419"),
    ("portuguese", "pt"),
    ("brazilian", "pt-br"),
    ("schinese", "zh-hans"),
    ("tchinese", "zh-hant"),
    ("japanese", "ja"),
    ("russian", "ru"),
    ("thai", "th"),
    ("vietnamese", "vi"),
    ("polish", "pl"),
    ("danish", "da"),
    ("dutch", "nl"),
    ("finnish", "fi"),
    ("norwegian", "no"),
    ("swedish", "sv"),
    ("czech", "cs"),
    ("hungarian", "hu"),
    ("romanian", "ro"),
    ("turkish", "tr"),
    ("ukrainian", "uk"),
    ("bulgarian", "bg"),
    ("greek", "el"),
    ("indonesian", "id"),
];

/// The deterministic fallback language.
pub const DEFAULT_LANGUAGE: &str = "english";

/// Resolve a Steam language name or a BCP-47 tag to a Steam language name.
///
/// Returns `None` for an unknown language so callers can reject it instead of
/// silently advertising an unsupported content language.
pub fn normalize(value: &str) -> Option<&'static str> {
    let value = value.trim().to_lowercase().replace('_', "-");
    if value.is_empty() {
        return None;
    }
    for (language, tag) in STEAM_LANGUAGES {
        if value == *language || value == *tag {
            return Some(language);
        }
    }
    // "fr-FR", "en-GB": match the base subtag.
    let base = value.split('-').next().unwrap_or("");
    if base == "zh" {
        // Simplified unless the tag asks for the traditional script.
        return Some(if value.contains("hant") {
            "tchinese"
        } else {
            "schinese"
        });
    }
    for (language, tag) in STEAM_LANGUAGES {
        if tag.split('-').next() == Some(base) {
            return Some(language);
        }
    }
    None
}

/// BCP-47 tag for a normalized Steam language name.
pub fn tag(language: &str) -> &'static str {
    STEAM_LANGUAGES
        .iter()
        .find(|(name, _)| *name == language)
        .map(|(_, tag)| *tag)
        .unwrap_or("en")
}

/// `Accept-Language` header value for a Steam language name.
pub fn accept_language(language: &str) -> String {
    let tag = tag(language);
    if tag == "en" {
        return "en-US,en;q=0.9".to_owned();
    }
    let base = tag.split('-').next().unwrap_or(tag);
    format!("{tag},{base};q=0.9,en;q=0.5")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_steam_names_and_tags() {
        assert_eq!(normalize("french"), Some("french"));
        assert_eq!(normalize("FRENCH"), Some("french"));
        assert_eq!(normalize("fr"), Some("french"));
        assert_eq!(normalize("fr-FR"), Some("french"));
        assert_eq!(normalize("pt_BR"), Some("brazilian"));
        assert_eq!(normalize("brazilian"), Some("brazilian"));
        assert_eq!(normalize("zh-Hans"), Some("schinese"));
        assert_eq!(normalize("schinese"), Some("schinese"));
    }

    #[test]
    fn rejects_unknown_languages() {
        assert_eq!(normalize(""), None);
        assert_eq!(normalize("klingon"), None);
        assert_eq!(normalize("xx-YY"), None);
    }

    #[test]
    fn builds_accept_language_headers() {
        assert_eq!(accept_language("english"), "en-US,en;q=0.9");
        assert_eq!(accept_language("french"), "fr,fr;q=0.9,en;q=0.5");
        assert_eq!(accept_language("brazilian"), "pt-br,pt;q=0.9,en;q=0.5");
    }
}
