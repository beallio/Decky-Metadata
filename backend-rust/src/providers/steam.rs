use crate::{
    http::Http,
    logging,
    matching::{self, py_string, py_truthy},
};
use log::Level;
use regex::Regex;
use reqwest::Url;
use serde_json::{Map, Value, json};
use std::{
    collections::HashSet,
    sync::LazyLock,
    time::Duration,
};

pub const STEAM_STORE_SEARCH_URL: &str = "https://store.steampowered.com/api/storesearch/";
pub const STEAM_APP_DETAILS_URL: &str = "https://store.steampowered.com/api/appdetails";
pub const STEAM_NEWS_URL: &str = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/";
pub const STEAM_EVENTS_URL: &str = "https://store.steampowered.com/events/ajaxgetpartnereventspageable/";
pub const STEAM_DECK_COMPAT_URL: &str = "https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport";
pub const STEAM_STORE_APP_URL: &str = "https://store.steampowered.com/app/{appid}/";

const STEAM_NEWS_FEEDS: &str = "steam_community_announcements,steam_community_announcements_koreana,steam_community_announcements_japanese,steam_community_announcements_schinese,steam_community_announcements_tchinese,steam_community_announcements_french,steam_community_announcements_german,steam_community_announcements_spanish,steam_community_announcements_italian,steam_community_announcements_polish,steam_community_announcements_portuguese,steam_community_announcements_russian";
const STEAM_ACTIVITY_EVENT_TYPES: [i64; 9] = [12, 13, 14, 15, 23, 24, 25, 28, 35];

static RX_CLAN_IMAGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\A\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}/(\d+)/([^\s<>\)\]\[]+)")
        .expect("fixed Steam clan-image regex")
});
static RX_IMAGE_TAG_END: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[/img\].*$").expect("fixed Steam image-tag regex")
});
static RX_IMAGE_PUNCTUATION_END: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\]\)>.,;]+$").expect("fixed Steam image punctuation regex")
});
static RX_IMAGE_EXTENSION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\.(?:jpg|jpeg|png|webp|gif|avif)(?:[?#].*)?$")
        .expect("fixed Steam image extension regex")
});
static RX_PREVIEW_YOUTUBE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[previewyoutube=([A-Za-z0-9_-]{11})(?:;[^\]]*)?\]")
        .expect("fixed Steam preview video regex")
});
static RX_NEWS_IMAGE_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?i)\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}/\d+/[^\s<>\)\]\[]+\.(?:jpg|jpeg|png|webp|gif|avif)(?:[?#][^\s<>\)\]\[]*)?",
        r#"(?is)<img[^>]+src=["']([^"']+)["']"#,
        r#"(?is)<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|image)["'][^>]+content=["']([^"']+)["']"#,
        r"(?is)\[img\]([^\[]+)\[/img\]",
        r"(?i)((?:https?:)?//[^\s<>\)]+\.(?:jpg|jpeg|png|webp|gif|avif))(?:[?&][^\s<>\)]*)?",
    ]
    .into_iter()
    .map(|pattern| Regex::new(pattern).expect("fixed Steam news image regex"))
    .collect()
});
static RX_PREVIEW_YOUTUBE_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[previewyoutube=[A-Za-z0-9_-]{11}(?:;[^\]]*)?\]\s*\[/previewyoutube\]")
        .expect("fixed Steam preview video block regex")
});
static RX_PREVIEW_YOUTUBE_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[previewyoutube=[^\]]+\]").expect("fixed Steam preview video tag regex")
});
static RX_STEAM_IMAGE_TEXT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}/\d+/[^\s<>\)\]\[]+")
        .expect("fixed Steam image placeholder text regex")
});
static RX_BBCODE_IMAGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[img\][\s\S]*?\[/img\]").expect("fixed Steam BBCode image regex")
});
static RX_BBCODE_URL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[url=([^\]]+)\]([\s\S]*?)\[/url\]").expect("fixed Steam BBCode URL regex")
});
static RX_BBCODE_LIST: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[list\][\s\S]*?\[/list\]").expect("fixed Steam BBCode list regex")
});
static RX_BBCODE_LIST_MARKER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[/?(?:list|\*)[^\]]*\]").expect("fixed Steam BBCode list marker regex")
});
static RX_BBCODE_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[/?(?:p|br|hr|quote|spoiler|table|tr|td|th|img|url|h1|h2|h3|h4|b|i|u|s|strike|list|\*|code|noparse|previewyoutube|video|youtube|size|color|font|center|left|right)[^\]]*\]")
        .expect("fixed Steam BBCode tag regex")
});
static RX_HTML_BREAK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)<br\s*/?>").expect("fixed Steam line-break regex")
});
static RX_WHITESPACE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\s+").expect("fixed Steam whitespace regex")
});
static RX_STEAM_APP_URL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)store\.steampowered\.com/app/(\d+)")
        .expect("fixed Steam app URL regex")
});
static RX_DIGITS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\d+").expect("fixed Steam number regex"));
static RX_NON_DIGITS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[^0-9]").expect("fixed Steam non-digit regex"));

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeckCompatibilityStatus {
    Available,
    Unavailable,
    Failed,
}

impl DeckCompatibilityStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Available => "available",
            Self::Unavailable => "unavailable",
            Self::Failed => "failed",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DeckCompatibilityLookup {
    pub status: DeckCompatibilityStatus,
    pub category: Option<i64>,
}

fn query_url(base: &str, parameters: &[(&str, String)]) -> String {
    let mut url = Url::parse(base).expect("fixed Steam endpoint URL");
    url.query_pairs_mut()
        .extend_pairs(parameters.iter().map(|(key, value)| (*key, value.as_str())));
    url.to_string()
}

fn python_or_string(value: &Value) -> String {
    if py_truthy(value) {
        py_string(value)
    } else {
        String::new()
    }
}

fn percent_unquote(value: &str) -> String {
    fn hex(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }

    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2])) {
                decoded.push((high << 4) | low);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

fn unescape_steam_text(value: &str) -> String {
    percent_unquote(&matching::decode_html_entities(value)).replace("\\/", "/")
}

fn strip_image_tail(value: &str) -> String {
    let value = RX_IMAGE_TAG_END.replace(value, "");
    RX_IMAGE_PUNCTUATION_END.replace(&value, "").trim().to_owned()
}

pub fn steam_event_json(value: &Value) -> Value {
    match value {
        Value::Object(_) => value.clone(),
        Value::String(text) => serde_json::from_str::<Value>(text)
            .ok()
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({})),
        _ => json!({}),
    }
}

pub fn steam_localized_value(value: &Value) -> String {
    if let Some(items) = value.as_array() {
        return items
            .iter()
            .filter_map(Value::as_str)
            .find(|item| !item.trim().is_empty())
            .unwrap_or_default()
            .trim()
            .to_owned();
    }
    if let Some(items) = value.as_object() {
        for key in ["0", "english", "en"] {
            if let Some(item) = items.get(key).and_then(Value::as_str) {
                if !item.trim().is_empty() {
                    return item.trim().to_owned();
                }
            }
        }
        return items
            .values()
            .filter_map(Value::as_str)
            .find(|item| !item.trim().is_empty())
            .unwrap_or_default()
            .trim()
            .to_owned();
    }
    python_or_string(value).trim().to_owned()
}

pub fn steam_event_clan_id(event: &Value) -> String {
    let announcement = event["announcement_body"].as_object();
    [
        announcement.and_then(|value| value.get("clanid")),
        announcement.and_then(|value| value.get("clan_id")),
        event.get("clanid"),
        event.get("clan_id"),
        event.get("clan_account_id"),
    ]
    .into_iter()
    .flatten()
    .map(python_or_string)
    .map(|value| RX_NON_DIGITS.replace_all(&value, "").into_owned())
    .find(|value| !value.is_empty())
    .unwrap_or_default()
}

pub fn steam_partner_asset_url(raw: &str, clan_id: &str) -> String {
    let mut value = unescape_steam_text(raw).trim().trim_matches(['"', '\'']).to_owned();
    if value.is_empty() {
        return String::new();
    }
    value = strip_image_tail(&value);
    if let Some(captures) = RX_CLAN_IMAGE.captures(&value) {
        return format!(
            "https://clan.cloudflare.steamstatic.com/images/{}/{}",
            captures.get(1).map_or("", |capture| capture.as_str()),
            captures.get(2).map_or("", |capture| capture.as_str())
        );
    }
    if value.starts_with("//")
        || value.get(..7).is_some_and(|prefix| prefix.eq_ignore_ascii_case("http://"))
        || value.get(..8).is_some_and(|prefix| prefix.eq_ignore_ascii_case("https://"))
    {
        return matching::https_url(&value);
    }
    if !clan_id.is_empty() && RX_IMAGE_EXTENSION.is_match(&value) {
        return format!(
            "https://clan.cloudflare.steamstatic.com/images/{clan_id}/{}",
            value.trim_start_matches('/')
        );
    }
    String::new()
}

fn char_byte_index(value: &str, character: usize) -> usize {
    value
        .char_indices()
        .nth(character)
        .map_or(value.len(), |(index, _)| index)
}

fn add_news_image_candidate(
    candidates: &mut Vec<(i64, usize, String)>,
    raw: &str,
    position: usize,
    context: &str,
    base_score: i64,
) {
    let url = {
        let candidate = steam_partner_asset_url(raw, "");
        if candidate.is_empty() {
            matching::https_url(raw.trim())
        } else {
            candidate
        }
    };
    if url.is_empty() {
        return;
    }
    let haystack = format!("{url} {context}").to_lowercase();
    let mut score = base_score;
    for token in [
        "roadmap",
        "calendar",
        "schedule",
        "content",
        "update",
        "patch",
        "feature",
        "features",
        "event",
        "events",
        "challenge",
        "dlc",
        "preview",
        "screenshot",
        "image below",
        "new content",
        "release",
    ] {
        if haystack.contains(token) {
            score += 90;
        }
    }
    for token in [
        "divider",
        "separator",
        "spacer",
        "line",
        "border",
        "footer",
        "headerbar",
        "header_bar",
        "logo",
        "icon",
        "avatar",
        "button",
        "bullet",
        "store_capsule",
        "small_capsule",
        "capsule_sm",
        "discord",
    ] {
        if haystack.contains(token) {
            score -= 120;
        }
    }
    if ["1920", "1600", "1280", "1200", "1080", "800", "720", "roadmap", "calendar", "wide"]
        .iter()
        .any(|token| haystack.contains(token))
    {
        score += 20;
    }
    score += (position / 500).min(20) as i64;
    candidates.push((score, position, url));
}

pub fn steam_news_image_candidates(contents: &str, _steam_appid: i64) -> Vec<String> {
    let text = unescape_steam_text(contents);
    if text.is_empty() {
        return Vec::new();
    }
    let mut candidates = Vec::new();
    if let Some(captures) = RX_PREVIEW_YOUTUBE.captures(&text) {
        if let Some(video) = captures.get(1) {
            let position = text[..captures.get(0).expect("full preview match").start()]
                .chars()
                .count();
            add_news_image_candidate(
                &mut candidates,
                &format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", video.as_str()),
                position,
                "youtube preview",
                45,
            );
        }
    }
    for pattern in RX_NEWS_IMAGE_PATTERNS.iter() {
        for found in pattern.captures_iter(&text) {
            let full_match = found.get(0).expect("image pattern always matches");
            let raw = found.get(1).unwrap_or(full_match).as_str();
            let start_character = text[..full_match.start()].chars().count();
            let end_character = text[..full_match.end()].chars().count();
            let start = char_byte_index(&text, start_character.saturating_sub(260));
            let end = char_byte_index(&text, (end_character + 260).min(text.chars().count()));
            let context = &text[start..end];
            add_news_image_candidate(
                &mut candidates,
                raw,
                start_character,
                context,
                50,
            );
        }
    }
    candidates.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| left.1.cmp(&right.1)));
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter_map(|(_, _, url)| seen.insert(url.clone()).then_some(url))
        .collect()
}

pub fn steam_partner_event_images(event: &Value, steam_appid: i64) -> Vec<String> {
    let jsondata = steam_event_json(&event["jsondata"]);
    let clan_id = steam_event_clan_id(event);
    let announcement = event["announcement_body"].as_object();
    let body_value = announcement
        .and_then(|value| value.get("body"))
        .filter(|value| py_truthy(value))
        .or_else(|| event.get("event_notes"));
    let body = body_value.map(python_or_string).unwrap_or_default();
    let mut images = Vec::new();
    let mut seen = HashSet::new();

    let mut add = |raw: &Value| {
        let raw_value = steam_localized_value(raw);
        if raw_value.is_empty() {
            return;
        }
        let mut expanded = steam_news_image_candidates(&raw_value, steam_appid);
        if expanded.is_empty() {
            let direct = steam_partner_asset_url(&raw_value, &clan_id);
            let direct = if direct.is_empty() {
                matching::https_url(raw_value.trim())
            } else {
                direct
            };
            if !direct.is_empty() {
                expanded.push(direct);
            }
        }
        for image in expanded {
            if seen.insert(image.clone()) {
                images.push(image);
            }
        }
    };

    if !body.is_empty() {
        add(&Value::String(body));
    }
    for candidate in [
        &jsondata["localized_capsule_image"],
        &jsondata["localized_spotlight_image"],
        &jsondata["localized_title_image"],
        &jsondata["localized_header_image"],
        &event["image"],
        &event["capsule"],
        &event["capsule_image"],
        &event["header_image_url"],
        &event["preview_image_url"],
    ] {
        add(candidate);
    }
    if announcement.is_some() {
        for candidate in [
            &event["announcement_body"]["image"],
            &event["announcement_body"]["capsule"],
            &event["announcement_body"]["capsule_image"],
        ] {
            add(candidate);
        }
    }
    images
}

pub fn clean_steam_news_text(value: &str) -> String {
    let mut text = unescape_steam_text(value);
    text = RX_PREVIEW_YOUTUBE_BLOCK.replace_all(&text, " ").into_owned();
    text = RX_PREVIEW_YOUTUBE_TAG.replace_all(&text, " ").into_owned();
    text = RX_STEAM_IMAGE_TEXT.replace_all(&text, " ").into_owned();
    text = RX_BBCODE_IMAGE.replace_all(&text, " ").into_owned();
    text = RX_BBCODE_URL
        .replace_all(&text, "$2")
        .into_owned();
    text = RX_BBCODE_LIST
        .replace_all(&text, |captures: &regex::Captures<'_>| {
            RX_BBCODE_LIST_MARKER
                .replace_all(captures.get(0).expect("list match").as_str(), " ")
                .into_owned()
        })
        .into_owned();
    text = RX_BBCODE_TAG.replace_all(&text, " ").into_owned();
    text = RX_HTML_BREAK.replace_all(&text, " ").into_owned();
    text = matching::clean_html_text(&text);
    RX_WHITESPACE.replace_all(&text, " ").trim().to_owned()
}

pub fn steam_news_raw_body(value: &str) -> String {
    let mut text = unescape_steam_text(value).trim().to_owned();
    if text.chars().count() < 4000 {
        text = RX_WHITESPACE.replace_all(&text, " ").into_owned();
    }
    text.chars().take(16000).collect::<String>().trim().to_owned()
}

pub fn steam_news_summary(contents: &str) -> String {
    clean_steam_news_text(contents).chars().take(600).collect()
}

pub async fn steam_announcement_page_image(http: &Http, url: &str) -> String {
    let url = matching::https_url(url);
    if url.is_empty() {
        return String::new();
    }
    let Ok(page) = http.text(&url, Duration::from_secs(7), usize::MAX).await else {
        return String::new();
    };
    let text = unescape_steam_text(&page);
    static RX_ANNOUNCEMENT_IMAGE_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
        [
            r#"(?is)<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|image)["'][^>]+content=["']([^"']+)["']"#,
            r#"(?is)<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']"#,
            r#"(?is)background-image\s*:\s*url\(["']?([^"')]+)["']?\)"#,
            r"(?i)\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}/\d+/[^\s<>\)\]\[]+\.(?:jpg|jpeg|png|webp|gif|avif)(?:[?#][^\s<>\)\]\[]*)?",
        ]
        .into_iter()
        .map(|pattern| Regex::new(pattern).expect("fixed Steam announcement image regex"))
        .collect()
    });
    for pattern in RX_ANNOUNCEMENT_IMAGE_PATTERNS.iter() {
        let Some(found) = pattern.captures(&text) else {
            continue;
        };
        let full_match = found.get(0).expect("announcement image pattern match");
        let raw = found.get(1).unwrap_or(full_match).as_str().trim();
        let raw = strip_image_tail(raw);
        if let Some(captures) = RX_CLAN_IMAGE.captures(&raw) {
            return format!(
                "https://clan.cloudflare.steamstatic.com/images/{}/{}",
                captures.get(1).map_or("", |capture| capture.as_str()),
                captures.get(2).map_or("", |capture| capture.as_str())
            );
        }
        let image = matching::https_url(&raw);
        if !image.is_empty() {
            return image;
        }
    }
    String::new()
}

fn python_int(value: &Value) -> Option<i64> {
    match value {
        Value::Bool(value) => Some(i64::from(*value)),
        Value::Number(value) => {
            if let Some(integer) = value.as_i64() {
                return Some(integer);
            }
            let number = value.as_f64()?;
            let truncated = number.trunc();
            if number.is_finite() && truncated >= i64::MIN as f64 && truncated < 9_223_372_036_854_775_808.0 {
                Some(truncated as i64)
            } else {
                None
            }
        }
        Value::String(value) => value.trim().parse::<i64>().ok(),
        _ => None,
    }
}

fn log_provider_error(message: &str, appid: Option<i64>, error: Option<&str>, level: Level) {
    let mut fields = Map::new();
    if let Some(appid) = appid {
        fields.insert("steam_appid".into(), json!(appid));
    }
    if let Some(error) = error {
        fields.insert("error".into(), json!(error));
    }
    logging::event("steam", message, Value::Object(fields), level);
}

pub async fn steam_deck_compat_lookup_for_appid(http: &Http, appid: i64) -> DeckCompatibilityLookup {
    if appid <= 0 {
        return DeckCompatibilityLookup {
            status: DeckCompatibilityStatus::Failed,
            category: None,
        };
    }
    let url = query_url(
        STEAM_DECK_COMPAT_URL,
        &[("nAppID", appid.to_string()), ("l", "english".into())],
    );
    let payload = match http.json(&url, Duration::from_secs(12), usize::MAX).await {
        Ok(payload) => payload,
        Err(error) => {
            log_provider_error("deck compat fetch failed", Some(appid), Some(&error), Level::Warn);
            return DeckCompatibilityLookup {
                status: DeckCompatibilityStatus::Failed,
                category: None,
            };
        }
    };
    let Some(results) = payload.get("results").and_then(Value::as_object) else {
        log_provider_error("deck compat fetch failed", Some(appid), Some("missing deck compatibility results"), Level::Warn);
        return DeckCompatibilityLookup {
            status: DeckCompatibilityStatus::Failed,
            category: None,
        };
    };
    let Some(raw_category) = results.get("resolved_category") else {
        log_provider_error("deck compat fetch failed", Some(appid), Some("missing deck compatibility category"), Level::Warn);
        return DeckCompatibilityLookup {
            status: DeckCompatibilityStatus::Failed,
            category: None,
        };
    };
    if raw_category.is_null() {
        return DeckCompatibilityLookup {
            status: DeckCompatibilityStatus::Unavailable,
            category: None,
        };
    }
    let Some(category) = python_int(raw_category) else {
        log_provider_error("deck compat fetch failed", Some(appid), Some("invalid deck compatibility category"), Level::Warn);
        return DeckCompatibilityLookup {
            status: DeckCompatibilityStatus::Failed,
            category: None,
        };
    };
    if !(0..=3).contains(&category) {
        return DeckCompatibilityLookup {
            status: DeckCompatibilityStatus::Unavailable,
            category: None,
        };
    }
    logging::event(
        "steam",
        "deck compat resolved",
        json!({"steam_appid": appid, "category": category}),
        Level::Debug,
    );
    DeckCompatibilityLookup {
        status: DeckCompatibilityStatus::Available,
        category: Some(category),
    }
}

fn steam_match_appid(value: &Value) -> Option<i64> {
    match value {
        Value::Bool(_) => None,
        Value::Number(value) => value.as_i64().filter(|value| *value > 0),
        Value::String(value) => {
            let value = value.trim();
            if value.is_ascii() && !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()) {
                value.parse::<i64>().ok().filter(|value| *value > 0)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn steam_match_image(value: &Value) -> Option<String> {
    let url = value.as_str()?.trim();
    let parsed = Url::parse(url).ok()?;
    (parsed.scheme() == "https" && parsed.host_str().is_some()).then(|| url.to_owned())
}

pub async fn search_steam_matches(http: &Http, query: &Value, limit: &Value) -> Value {
    let Some(query) = query.as_str() else {
        return json!({"items": [], "error": null});
    };
    let clean_query = matching::clean_game_title(query);
    if clean_query.is_empty() {
        return json!({"items": [], "error": null});
    }
    let result_limit = matching::safe_int(limit)
        .filter(|limit| *limit != 0)
        .unwrap_or(8)
        .clamp(1, 12) as usize;
    let url = query_url(
        STEAM_STORE_SEARCH_URL,
        &[
            ("term", clean_query),
            ("cc", "US".into()),
            ("l", "english".into()),
        ],
    );
    let payload = match http.json(&url, Duration::from_secs(12), usize::MAX).await {
        Ok(payload) => payload,
        Err(_) => {
            log_provider_error("match search failed", None, None, Level::Warn);
            return json!({"items": [], "error": "Steam search is unavailable. Try again."});
        }
    };
    let Some(rows) = payload.get("items").and_then(Value::as_array) else {
        log_provider_error("match search failed", None, Some("Invalid Steam search response"), Level::Warn);
        return json!({"items": [], "error": "Steam search is unavailable. Try again."});
    };
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    for row in rows {
        if row["type"] != "app" {
            continue;
        }
        let Some(appid) = steam_match_appid(&row["id"]) else {
            continue;
        };
        let Some(raw_title) = row["name"].as_str() else {
            continue;
        };
        let title = matching::clean_game_title(raw_title);
        if title.is_empty() || !seen.insert(appid) {
            continue;
        }
        items.push(json!({
            "steam_appid": appid,
            "title": title,
            "cover_url": steam_match_image(&row["tiny_image"]),
        }));
        if items.len() == result_limit {
            break;
        }
    }
    json!({"items": items, "error": null})
}

pub async fn steam_match_preview(http: &Http, steam_appid: &Value) -> Value {
    let Some(appid) = steam_match_appid(steam_appid) else {
        return json!({"preview": null, "error": "Select a valid Steam game."});
    };
    let url = query_url(
        STEAM_APP_DETAILS_URL,
        &[
            ("appids", appid.to_string()),
            ("l", "english".into()),
            ("filters", "basic,developers,release_date".into()),
        ],
    );
    let result = async {
        let payload = http.json(&url, Duration::from_secs(12), usize::MAX).await?;
        let row = payload.get(appid.to_string());
        if !row
            .and_then(|row| row.get("success"))
            .is_some_and(py_truthy)
        {
            return Err("Steam game details are unavailable".to_owned());
        }
        let data = row
            .and_then(|row| row.get("data"))
            .filter(|data| data.is_object())
            .ok_or_else(|| "Steam game details are unavailable".to_owned())?;
        let raw_title = data["name"]
            .as_str()
            .ok_or_else(|| "Steam game details are unavailable".to_owned())?;
        let title = matching::clean_game_title(raw_title);
        if title.is_empty() {
            return Err("Steam game title is unavailable".to_owned());
        }
        let developers = data["developers"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .filter(|name| !name.trim().is_empty())
            .map(|name| matching::clean_html_text(name).trim().to_owned())
            .collect::<Vec<_>>();
        let release_date_label = data["release_date"]["date"]
            .as_str()
            .map(matching::clean_html_text)
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        let app_type = data["type"]
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let cover_url = steam_match_image(&data["header_image"])
            .or_else(|| steam_match_image(&data["capsule_image"]));
        Ok::<Value, String>(json!({
            "steam_appid": appid,
            "title": title,
            "cover_url": cover_url,
            "developers": developers,
            "release_date_label": release_date_label,
            "app_type": app_type,
        }))
    }
    .await;
    match result {
        Ok(preview) => json!({"preview": preview, "error": null}),
        Err(error) => {
            log_provider_error("match preview failed", Some(appid), Some(&error), Level::Warn);
            json!({"preview": null, "error": "Steam details are unavailable. You can still use this match."})
        }
    }
}

pub async fn steam_appdetails_for_appid(http: &Http, appid: i64) -> Option<Value> {
    if appid <= 0 {
        return None;
    }
    let url = query_url(
        STEAM_APP_DETAILS_URL,
        &[("appids", appid.to_string()), ("l", "english".into())],
    );
    let payload = match http.json(&url, Duration::from_secs(12), usize::MAX).await {
        Ok(payload) => payload,
        Err(error) => {
            log_provider_error("appdetails fetch failed", Some(appid), Some(&error), Level::Warn);
            return None;
        }
    };
    let Some(app_payload) = payload.get(appid.to_string()).filter(|value| value.is_object()) else {
        return None;
    };
    if !app_payload.get("success").is_some_and(py_truthy) {
        return None;
    }
    let Some(data) = app_payload.get("data").filter(|value| value.is_object()) else {
        return None;
    };

    let mut details = Map::new();
    let title = python_or_string(&data["name"]).trim().to_owned();
    if !title.is_empty() {
        details.insert("title".into(), json!(title));
        let steam_store_name = matching::clean_game_title(&title);
        if !steam_store_name.is_empty() {
            details.insert("steam_store_name".into(), json!(steam_store_name));
        }
    }

    let descriptions = ["short_description", "about_the_game", "detailed_description"]
        .map(|key| matching::description_html_to_text(&python_or_string(&data[key])));
    let short_description = descriptions[0].clone();
    let description = descriptions
        .iter()
        .find(|description| !description.is_empty())
        .cloned()
        .unwrap_or_default();
    if !description.is_empty() {
        details.insert("description".into(), json!(description));
        details.insert(
            "short_description".into(),
            json!(if short_description.is_empty() { &description } else { &short_description }),
        );
    }

    for (source, target) in [("developers", "developers"), ("publishers", "publishers")] {
        if let Some(values) = data[source].as_array() {
            let people = values
                .iter()
                .map(|value| py_string(value).trim().to_owned())
                .filter(|name| !name.is_empty())
                .map(|name| json!({"name": name, "url": ""}))
                .collect::<Vec<_>>();
            if !people.is_empty() {
                details.insert(target.into(), json!(people));
            }
        }
    }
    if let Some(genres) = data["genres"].as_array() {
        let genres = genres
            .iter()
            .filter_map(|genre| genre.get("description"))
            .map(python_or_string)
            .map(|description| description.trim().to_owned())
            .filter(|description| !description.is_empty())
            .collect::<Vec<_>>();
        if !genres.is_empty() {
            details.insert("genres".into(), json!(genres));
        }
    }
    if let Some(date) = matching::normalize_release_date(&data["release_date"]["date"]) {
        details.insert("release_date".into(), json!(date));
    }
    if let Some(rating) = matching::rating_to_percent(&data["metacritic"]["score"]) {
        details.insert("rating".into(), json!(rating));
    }
    let store_categories = data["categories"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|category| category.get("id"))
        .filter_map(matching::safe_int)
        .filter(|category| *category != 0)
        .collect::<Vec<_>>();
    if !store_categories.is_empty() {
        details.insert("store_categories".into(), json!(store_categories));
    }
    let mut dlc = Vec::new();
    if let Some(raw_dlc) = data["dlc"].as_array() {
        for value in raw_dlc {
            let appid = match value {
                Value::Bool(_) => continue,
                Value::Number(value) => value.as_i64(),
                Value::String(value) => value.trim().parse::<i64>().ok(),
                _ => None,
            };
            if let Some(appid) = appid.filter(|appid| *appid > 0) {
                if !dlc.contains(&appid) {
                    dlc.push(appid);
                }
            }
        }
    }
    details.insert("steam_dlc_appids".into(), json!(dlc));
    details.insert(
        "has_points_shop".into(),
        json!(store_categories.contains(&29)),
    );
    let screenshots = data["screenshots"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|screenshot| py_truthy(&screenshot["path_full"]))
        .map(|screenshot| {
            json!({
                "id": screenshot.get("id").cloned().unwrap_or(Value::Null),
                "url": screenshot["path_full"],
                "thumbnail": screenshot.get("path_thumbnail").cloned().unwrap_or(Value::Null),
            })
        })
        .collect::<Vec<_>>();
    details.insert("screenshots".into(), json!(screenshots));

    logging::event(
        "steam",
        "appdetails resolved",
        json!({"steam_appid": appid, "name": title}),
        Level::Debug,
    );
    Some(Value::Object(details))
}

pub async fn steam_partner_events_for_appid(http: &Http, appid: i64, limit: i64) -> Vec<Value> {
    let requested_limit = if limit == 0 { 10 } else { limit };
    let count = requested_limit.saturating_mul(3).clamp(10, 50);
    let url = query_url(
        STEAM_EVENTS_URL,
        &[
            ("appid", appid.to_string()),
            ("offset", "0".into()),
            ("count", count.to_string()),
            ("l", "english".into()),
            ("origin", "https://store.steampowered.com".into()),
        ],
    );
    let payload = match http.json(&url, Duration::from_secs(12), usize::MAX).await {
        Ok(payload) => payload,
        Err(error) => {
            log_provider_error("partner events fetch failed", Some(appid), Some(&error), Level::Error);
            return Vec::new();
        }
    };
    let Some(events) = payload.get("events").and_then(Value::as_array) else {
        return Vec::new();
    };
    let row_limit = requested_limit.clamp(1, 12) as usize;
    let mut rows = Vec::new();
    for event in events {
        if !event.is_object() {
            continue;
        }
        let raw_event_type = if py_truthy(&event["event_type"]) {
            &event["event_type"]
        } else {
            &event["type"]
        };
        let event_type = matching::as_number(raw_event_type, 0.0) as i64;
        if !STEAM_ACTIVITY_EVENT_TYPES.contains(&event_type) {
            continue;
        }
        let announcement = event["announcement_body"].as_object();
        let event_gid = python_or_string(&event["gid"]).trim().to_owned();
        let announcement_gid = announcement
            .and_then(|value| value.get("gid"))
            .map(python_or_string)
            .unwrap_or_default()
            .trim()
            .to_owned();
        let gid = if event_gid.is_empty() {
            announcement_gid.clone()
        } else {
            event_gid.clone()
        };
        let raw_headline = announcement
            .and_then(|value| value.get("headline"))
            .filter(|value| py_truthy(value))
            .or_else(|| event.get("event_name"))
            .map(python_or_string)
            .unwrap_or_default();
        let title = matching::clean_html_text(&raw_headline);
        if gid.is_empty() || title.is_empty() {
            continue;
        }
        let body_value = announcement
            .and_then(|value| value.get("body"))
            .filter(|value| py_truthy(value))
            .or_else(|| event.get("event_notes"));
        let body = body_value.map(python_or_string).unwrap_or_default();
        let raw_date = announcement
            .and_then(|value| value.get("posttime"))
            .filter(|value| py_truthy(value))
            .or_else(|| event.get("rtime32_start_time").filter(|value| py_truthy(value)))
            .or_else(|| event.get("rtime_created"));
        let date = raw_date.map_or(0, |value| matching::as_number(value, 0.0) as i64);
        let event_url = if !announcement_gid.is_empty() {
            format!("https://steamcommunity.com/games/{appid}/announcements/detail/{announcement_gid}")
        } else {
            format!("https://store.steampowered.com/news/app/{appid}/view/{event_gid}")
        };
        let image_sources = steam_partner_event_images(event, appid);
        let event_type_name = python_or_string(&event["event_type_name"]);
        let feed_label = matching::clean_html_text(if event_type_name.is_empty() {
            "Steam"
        } else {
            &event_type_name
        });
        rows.push(json!({
            "id": if announcement_gid.is_empty() { &event_gid } else { &announcement_gid },
            "gid": if announcement_gid.is_empty() { &event_gid } else { &announcement_gid },
            "event_gid": event_gid,
            "news_id": if announcement_gid.is_empty() { &event_gid } else { &announcement_gid },
            "announcement_gid": if announcement_gid.is_empty() { &event_gid } else { &announcement_gid },
            "event_type": event_type,
            "type": event_type,
            "title": title,
            "url": matching::https_url(&event_url),
            "summary": steam_news_summary(if body.is_empty() { &title } else { &body }),
            "body": clean_steam_news_text(&body).chars().take(4000).collect::<String>(),
            "raw_body": body,
            "image": image_sources.first().cloned().unwrap_or_default(),
            "image_sources": image_sources,
            "author": "Steam",
            "feedLabel": feed_label,
            "date": date,
        }));
        if rows.len() >= row_limit {
            break;
        }
    }
    match crate::metadata::sanitize_news(&Value::Array(rows)) {
        Ok(rows) => rows,
        Err(error) => {
            log_provider_error("partner events sanitization failed", Some(appid), Some(&error), Level::Warn);
            Vec::new()
        }
    }
}

pub async fn steam_news_for_appid(
    http: &Http,
    appid: i64,
    _title: &str,
    limit: i64,
) -> Result<Vec<Value>, String> {
    let partner_limit = if limit == 0 { 6 } else { limit }.max(10);
    let partner_events = steam_partner_events_for_appid(http, appid, partner_limit).await;
    if !partner_events.is_empty() {
        return Ok(partner_events);
    }
    let news_limit = if limit == 0 { 6 } else { limit }.clamp(1, 10);
    let url = query_url(
        STEAM_NEWS_URL,
        &[
            ("appid", appid.to_string()),
            ("count", news_limit.to_string()),
            ("maxlength", "600".into()),
            ("format", "json".into()),
            ("feeds", STEAM_NEWS_FEEDS.into()),
        ],
    );
    let payload = match http.json(&url, Duration::from_secs(12), usize::MAX).await {
        Ok(payload) => payload,
        Err(error) => {
            log_provider_error("news fetch failed", Some(appid), Some(&error), Level::Error);
            return Ok(Vec::new());
        }
    };
    let Some(items) = payload
        .get("appnews")
        .and_then(|appnews| appnews.get("newsitems"))
        .and_then(Value::as_array)
    else {
        return Ok(Vec::new());
    };
    let mut rows = Vec::new();
    for item in items {
        if !item.is_object() {
            continue;
        }
        let url = matching::https_url(&python_or_string(&item["url"]));
        let title = matching::clean_html_text(&python_or_string(&item["title"]));
        if url.is_empty() || title.is_empty() {
            continue;
        }
        let contents = python_or_string(&item["contents"]);
        let mut image_sources = steam_news_image_candidates(&contents, appid);
        let mut image = image_sources.first().cloned().unwrap_or_default();
        if image.is_empty() {
            image = steam_announcement_page_image(http, &url).await;
            if !image.is_empty() {
                image_sources.push(image.clone());
            }
        }
        let gid = python_or_string(&item["gid"]).trim().to_owned();
        let date = matching::as_number(&item["date"], 0.0) as i64;
        rows.push(json!({
            "id": if gid.is_empty() { &url } else { &gid },
            "gid": gid,
            "news_id": gid,
            "announcement_gid": gid,
            "event_type": 28,
            "type": 28,
            "title": title,
            "url": url,
            "summary": steam_news_summary(&contents),
            "body": clean_steam_news_text(&contents).chars().take(4000).collect::<String>(),
            "raw_body": contents,
            "image": image,
            "image_sources": image_sources,
            "author": matching::clean_html_text(&python_or_string(&item["author"])),
            "feedLabel": matching::clean_html_text(&{
                let feed = python_or_string(&item["feedlabel"]);
                if feed.is_empty() {
                    let feed = python_or_string(&item["feedname"]);
                    if feed.is_empty() { "Steam News".to_owned() } else { feed }
                } else {
                    feed
                }
            }),
            "date": date,
        }));
    }
    crate::metadata::sanitize_news(&Value::Array(rows))
}

pub async fn resolve_steam_appid_for_title(
    http: &Http,
    title: &str,
    metadata: Option<&Value>,
) -> (Option<i64>, String) {
    if let Some(metadata) = metadata.and_then(Value::as_object) {
        for key in ["source_url", "id"] {
            let value = python_or_string(metadata.get(key).unwrap_or(&Value::Null));
            if let Some(captures) = RX_STEAM_APP_URL.captures(&value) {
                if let Some(appid) = captures
                    .get(1)
                    .and_then(|value| matching::safe_int(&Value::String(value.as_str().into())))
                    .filter(|appid| *appid > 0)
                {
                    return (Some(appid), STEAM_STORE_APP_URL.replace("{appid}", &appid.to_string()));
                }
            }
        }
    }
    let clean_title = matching::clean_game_title(title);
    if clean_title.is_empty() || http.cancel.is_cancelled() {
        return (None, String::new());
    }
    let url = query_url(
        STEAM_STORE_SEARCH_URL,
        &[
            ("term", clean_title.clone()),
            ("cc", "US".into()),
            ("l", "english".into()),
        ],
    );
    let mut payload = None;
    for attempt in 0..3 {
        match http.json(&url, Duration::from_secs(12), usize::MAX).await {
            Ok(value) => {
                payload = Some(value);
                break;
            }
            Err(error) => {
                if attempt == 2 {
                    log_provider_error("store search failed", None, Some(&error), Level::Error);
                    return (None, String::new());
                }
                let delay = Duration::from_millis(200 * (attempt + 1));
                tokio::select! {
                    biased;
                    _ = http.cancel.cancelled() => return (None, String::new()),
                    _ = tokio::time::sleep(delay) => {},
                }
            }
        }
    }
    let Some(items) = payload
        .as_ref()
        .and_then(|payload| payload.get("items"))
        .and_then(Value::as_array)
    else {
        return (None, String::new());
    };
    let normalised_query = matching::normalise_match_title(&clean_title);
    let query_numbers = RX_DIGITS
        .find_iter(&normalised_query)
        .map(|value| value.as_str())
        .collect::<HashSet<_>>();
    let mut best: Option<(i64, i64)> = None;
    for (index, item) in items.iter().take(12).enumerate() {
        if !item.is_object() {
            continue;
        }
        let raw_id = if py_truthy(&item["id"]) { &item["id"] } else { &item["appid"] };
        let Some(appid) = matching::safe_int(raw_id).filter(|appid| *appid > 0) else {
            continue;
        };
        let name = matching::clean_game_title(&python_or_string(&item["name"]));
        if name.is_empty() {
            continue;
        }
        let normalised_name = matching::normalise_match_title(&name);
        if normalised_name.is_empty()
            || !matching::distinctive_tokens_present(&normalised_query, &normalised_name)
        {
            continue;
        }
        let mut score = if normalised_name == normalised_query {
            1000
        } else {
            let ratio = matching::sequence_ratio(&normalised_query, &normalised_name);
            if ratio < 0.72 {
                continue;
            }
            (ratio * 500.0) as i64
        };
        if matching::is_non_primary_steam_title(&name, &clean_title) {
            score -= 800;
        }
        let candidate_numbers = RX_DIGITS
            .find_iter(&normalised_name)
            .map(|value| value.as_str())
            .collect::<HashSet<_>>();
        if candidate_numbers.difference(&query_numbers).next().is_some() {
            score -= 120;
        }
        score -= index as i64 * 5;
        if best.is_none_or(|(best_score, _)| score > best_score) {
            best = Some((score, appid));
        }
    }
    let Some((score, appid)) = best.filter(|(score, _)| *score >= 300) else {
        return (None, String::new());
    };
    let _ = score;
    (Some(appid), STEAM_STORE_APP_URL.replace("{appid}", &appid.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Fixture, Http};

    const SEARCH_URL: &str = "https://store.steampowered.com/api/storesearch/?term=Portal&cc=US&l=english";
    const APP_DETAILS_URL: &str = "https://store.steampowered.com/api/appdetails?appids=15100&l=english";
    const EVENTS_URL: &str = "https://store.steampowered.com/events/ajaxgetpartnereventspageable/?appid=400&offset=0&count=30&l=english&origin=https%3A%2F%2Fstore.steampowered.com";
    const NEWS_URL: &str = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=400&count=6&maxlength=600&format=json&feeds=steam_community_announcements%2Csteam_community_announcements_koreana%2Csteam_community_announcements_japanese%2Csteam_community_announcements_schinese%2Csteam_community_announcements_tchinese%2Csteam_community_announcements_french%2Csteam_community_announcements_german%2Csteam_community_announcements_spanish%2Csteam_community_announcements_italian%2Csteam_community_announcements_polish%2Csteam_community_announcements_portuguese%2Csteam_community_announcements_russian";

    fn json_fixture(url: &str, payload: Value) -> Fixture {
        Fixture::json(url, payload)
    }

    fn event_fixture() -> Value {
        json!({"events": [
            {"gid":"ignored-event","event_type":99,"event_name":"Unsupported"},
            {
                "gid":"event-1",
                "event_type":28,
                "event_type_name":"Major Update",
                "clanid":"12345",
                "jsondata":"{\"localized_capsule_image\":{\"english\":\"capsule.jpg\"}}",
                "announcement_body": {
                    "gid":"announcement-1",
                    "clanid":"12345",
                    "headline":"<b>Roadmap update</b>",
                    "posttime":1700000000,
                    "body":"[img]{STEAM_CLAN_IMAGE}/12345/roadmap.jpg[/img]New content"
                }
            }
        ]})
    }

    #[tokio::test]
    async fn steam_appdetails_maps_actual_store_fields_and_failure_payloads() {
        let payload = json!({"15100": {
            "success":true,
            "data": {
                "name":" Assassin's Creed: Director's Cut Edition ",
                "short_description":"<p>Short store description.</p>",
                "detailed_description":"<p>Detailed <b>Steam</b> description.</p>",
                "developers":["Ubisoft Montreal", ""],
                "publishers":["Ubisoft"],
                "genres":[{"id":"1","description":"Action"},{"description":""}],
                "release_date":{"date":"Apr 9, 2008"},
                "screenshots":[
                    {"id":1,"path_thumbnail":"https://cdn.example/thumb.jpg","path_full":"https://cdn.example/full.jpg"},
                    {"id":2,"path_thumbnail":"https://cdn.example/empty.jpg"}
                ],
                "metacritic":{"score":79},
                "categories":[{"id":2},{"id":"22"},{"id":29},{"id":"bad"},{"id":0}],
                "dlc":[15101,"15102",15101,0,-1,15103.5,"15104.5","bad",true]
            }
        }});
        let http = Http::fixtures(vec![json_fixture(APP_DETAILS_URL, payload)]);
        let details = steam_appdetails_for_appid(&http, 15100).await.unwrap();
        assert_eq!(details["title"], "Assassin's Creed: Director's Cut Edition");
        assert_eq!(details["steam_store_name"], "Assassin's Creed: Director's Cut Edition");
        assert_eq!(details["description"], "Short store description.");
        assert_eq!(details["short_description"], "Short store description.");
        assert_eq!(details["developers"], json!([{"name":"Ubisoft Montreal","url":""}]));
        assert_eq!(details["publishers"], json!([{"name":"Ubisoft","url":""}]));
        assert_eq!(details["genres"], json!(["Action"]));
        assert_eq!(details["release_date"], "2008-04-09");
        assert_eq!(details["rating"], 79);
        assert_eq!(details["store_categories"], json!([2,22,29]));
        assert_eq!(details["steam_dlc_appids"], json!([15101,15102]));
        assert_eq!(details["has_points_shop"], true);
        assert_eq!(details["screenshots"], json!([
            {"id":1,"url":"https://cdn.example/full.jpg","thumbnail":"https://cdn.example/thumb.jpg"}
        ]));
        http.assert_drained();

        let unusable = Http::fixtures(vec![
            json_fixture(APP_DETAILS_URL, json!({"15100":{"success":false,"data":{"name":"Nope"}}})),
            json_fixture(APP_DETAILS_URL, json!({"15100":{"success":true,"data":null}})),
            Fixture::failure(APP_DETAILS_URL),
        ]);
        assert!(steam_appdetails_for_appid(&unusable, 15100).await.is_none());
        assert!(steam_appdetails_for_appid(&unusable, 15100).await.is_none());
        assert!(steam_appdetails_for_appid(&unusable, 15100).await.is_none());
        unusable.assert_drained();
    }

    #[tokio::test]
    async fn steam_appdetails_short_circuits_nonpositive_ids_and_keeps_empty_defaults() {
        let http = Http::fixtures(vec![json_fixture(
            "https://store.steampowered.com/api/appdetails?appids=42&l=english",
            json!({"42":{"success":true,"data":{"name":"No extras"}}}),
        )]);
        assert!(steam_appdetails_for_appid(&http, 0).await.is_none());
        assert!(steam_appdetails_for_appid(&http, -1).await.is_none());
        assert_eq!(
            steam_appdetails_for_appid(&http, 42).await.unwrap(),
            json!({"title":"No extras","steam_store_name":"No extras","steam_dlc_appids":[],"has_points_shop":false,"screenshots":[]})
        );
        http.assert_drained();
    }

    #[tokio::test]
    async fn steam_manual_picker_preserves_type_boundaries_limits_and_errors() {
        let rows = (1..=13)
            .map(|appid| json!({"type":"app","id":appid,"name":format!("Portal {appid}")}))
            .collect::<Vec<_>>();
        let http = Http::fixtures(vec![json_fixture(SEARCH_URL, json!({"items":rows}))]);
        let result = search_steam_matches(&http, &json!("Portal"), &json!(99)).await;
        assert_eq!(result["error"], Value::Null);
        assert_eq!(result["items"].as_array().unwrap().len(), 12);
        assert_eq!(result["items"][0]["steam_appid"], 1);
        assert_eq!(result["items"][11]["steam_appid"], 12);
        http.assert_drained();
        let ten_rows = (1..=10)
            .map(|appid| json!({"type":"app","id":appid,"name":format!("Portal {appid}")}))
            .collect::<Vec<_>>();
        let limits = Http::fixtures(vec![
            json_fixture(SEARCH_URL, json!({"items":ten_rows})),
            json_fixture(SEARCH_URL, json!({"items":[{"type":"app","id":1,"name":"Portal"}]})),
        ]);
        assert_eq!(
            search_steam_matches(&limits, &json!("Portal"), &json!(0)).await["items"].as_array().unwrap().len(),
            8
        );
        assert_eq!(
            search_steam_matches(&limits, &json!("Portal"), &json!(-1)).await["items"].as_array().unwrap().len(),
            1
        );
        limits.assert_drained();

        let invalid = Http::fixtures(Vec::new());
        assert_eq!(
            search_steam_matches(&invalid, &json!(true), &json!(8)).await,
            json!({"items":[],"error":null})
        );
        assert_eq!(
            steam_match_preview(&invalid, &json!(true)).await,
            json!({"preview":null,"error":"Select a valid Steam game."})
        );
        invalid.assert_drained();

        let failure = Http::fixtures(vec![Fixture::failure(SEARCH_URL)]);
        assert_eq!(
            search_steam_matches(&failure, &json!("Portal"), &json!(8)).await,
            json!({"items":[],"error":"Steam search is unavailable. Try again."})
        );
        failure.assert_drained();
    }

    #[tokio::test]
    async fn steam_manual_search_filters_rows_and_preview_uses_partial_release_date() {
        let capsule = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/400/header.jpg";
        let search = Http::fixtures(vec![json_fixture(
            SEARCH_URL,
            json!({"items":[
                {"type":"bundle","id":99,"name":"Portal bundle"},
                {"type":"app","id":true,"name":"Bad bool id"},
                {"type":"app","id":"٤٠٠","name":"Unicode digits"},
                {"type":"app","id":400,"name":"Portal","tiny_image":"https://["},
                {"type":"app","id":"400","name":"Duplicate"},
                {"type":"app","id":401,"name":""}
            ]}),
        )]);
        assert_eq!(
            search_steam_matches(&search, &json!("Portal"), &json!(1)).await,
            json!({"items":[{"steam_appid":400,"title":"Portal","cover_url":null}],"error":null})
        );
        search.assert_drained();

        let preview = Http::fixtures(vec![json_fixture(
            "https://store.steampowered.com/api/appdetails?appids=400&l=english&filters=basic%2Cdevelopers%2Crelease_date",
            json!({"400":{"success":true,"data":{
                "steam_appid":400,"name":"Portal","type":"game","header_image":"https://[",
                "capsule_image":capsule,"developers":["Valve"],"release_date":{"date":"2007"}
            }}}),
        )]);
        assert_eq!(
            steam_match_preview(&preview, &json!("400")).await,
            json!({"preview":{
                "steam_appid":400,"title":"Portal","cover_url":capsule,"developers":["Valve"],
                "release_date_label":"2007","app_type":"game"
            },"error":null})
        );
        preview.assert_drained();

        let failure = Http::fixtures(vec![json_fixture(
            "https://store.steampowered.com/api/appdetails?appids=400&l=english&filters=basic%2Cdevelopers%2Crelease_date",
            json!({"400":{"success":false}}),
        )]);
        assert_eq!(
            steam_match_preview(&failure, &json!(400)).await,
            json!({"preview":null,"error":"Steam details are unavailable. You can still use this match."})
        );
        failure.assert_drained();
    }

    #[tokio::test]
    async fn steam_automatic_matching_uses_distinctive_tokens_variants_rank_and_pinned_ids() {
        let http = Http::fixtures(vec![json_fixture(
            "https://store.steampowered.com/api/storesearch/?term=Warhammer+40%2C000%3A+Space+Marine&l=english&cc=US",
            json!({"items":[
                {"id":55410,"name":"Warhammer 40,000: Space Marine Demo"},
                {"id":55150,"name":"Warhammer 40,000: Space Marine - Anniversary Edition"},
                {"id":2183900,"name":"Warhammer 40,000: Space Marine 2"},
                {"id":3212020,"name":"Warhammer 40,000: Space Marine 2 - Original Soundtrack"}
            ]}),
        )]);
        assert_eq!(
            resolve_steam_appid_for_title(&http, "Warhammer 40,000: Space Marine", None).await,
            (Some(55150), "https://store.steampowered.com/app/55150/".to_owned())
        );
        http.assert_drained();

        let pinned = Http::fixtures(Vec::new());
        assert_eq!(
            resolve_steam_appid_for_title(
                &pinned,
                "Different title",
                Some(&json!({"steam_store_url":"https://store.steampowered.com/app/10/","source_url":"https://store.steampowered.com/app/999/"})),
            )
            .await,
            (Some(999), "https://store.steampowered.com/app/999/".to_owned())
        );
        assert_eq!(
            resolve_steam_appid_for_title(
                &pinned,
                "Different title",
                Some(&json!({"id":"http://store.steampowered.com/app/123/news"})),
            )
            .await,
            (Some(123), "https://store.steampowered.com/app/123/".to_owned())
        );
        pinned.assert_drained();

        let wrong_tokens = Http::fixtures(vec![json_fixture(
            "https://store.steampowered.com/api/storesearch/?term=Assassin%27s+Creed+Valhalla&l=english&cc=US",
            json!({"items":[{"id":15100,"name":"Assassin's Creed: Director's Cut Edition"}]}),
        )]);
        assert_eq!(
            resolve_steam_appid_for_title(&wrong_tokens, "Assassin's Creed Valhalla", None).await,
            (None, String::new())
        );
        wrong_tokens.assert_drained();
    }

    #[tokio::test]
    async fn steam_automatic_matching_retries_and_ignores_candidates_after_twelve() {
        let url="https://store.steampowered.com/api/storesearch/?term=Wobbly+Life&l=english&cc=US";
        let retry = Http::fixtures(vec![
            Fixture::failure(url),
            json_fixture(url, json!({"items":[{"id":1211020,"name":"Wobbly Life"}]})),
        ]);
        assert_eq!(
            resolve_steam_appid_for_title(&retry, "Wobbly Life", None).await,
            (Some(1211020), "https://store.steampowered.com/app/1211020/".to_owned())
        );
        retry.assert_drained();
        let exhausted = Http::fixtures(vec![
            Fixture::failure(url),
            Fixture::failure(url),
            Fixture::failure(url),
        ]);
        assert_eq!(
            resolve_steam_appid_for_title(&exhausted, "Wobbly Life", None).await,
            (None, String::new())
        );
        exhausted.assert_drained();

        let mut items = (0..12)
            .map(|index| json!({"id":1000+index,"name":format!("Unrelated {index}")}))
            .collect::<Vec<_>>();
        items.push(json!({"id":777,"name":"Portal"}));
        let beyond_limit = Http::fixtures(vec![json_fixture(SEARCH_URL, json!({"items":items}))]);
        assert_eq!(
            resolve_steam_appid_for_title(&beyond_limit, "Portal", None).await,
            (None, String::new())
        );
        beyond_limit.assert_drained();
    }

    #[tokio::test]
    async fn steam_compatibility_distinguishes_available_unavailable_and_failed() {
        let url = "https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=123&l=english";
        let http = Http::fixtures(vec![
            json_fixture(url, json!({"success":1,"results":{"resolved_category":3}})),
            json_fixture(url, json!({"success":1,"results":{"resolved_category":null}})),
            json_fixture(url, json!({"success":1,"results":{"resolved_category":7}})),
            json_fixture(url, json!({"success":1,"results":{}})),
            Fixture::failure(url),
        ]);
        assert_eq!(
            steam_deck_compat_lookup_for_appid(&http, 123).await,
            DeckCompatibilityLookup { status: DeckCompatibilityStatus::Available, category: Some(3) }
        );
        assert_eq!(
            steam_deck_compat_lookup_for_appid(&http, 123).await,
            DeckCompatibilityLookup { status: DeckCompatibilityStatus::Unavailable, category: None }
        );
        assert_eq!(
            steam_deck_compat_lookup_for_appid(&http, 123).await,
            DeckCompatibilityLookup { status: DeckCompatibilityStatus::Unavailable, category: None }
        );
        assert_eq!(
            steam_deck_compat_lookup_for_appid(&http, 123).await,
            DeckCompatibilityLookup { status: DeckCompatibilityStatus::Failed, category: None }
        );
        assert_eq!(
            steam_deck_compat_lookup_for_appid(&http, 123).await,
            DeckCompatibilityLookup { status: DeckCompatibilityStatus::Failed, category: None }
        );
        assert_eq!(
            steam_deck_compat_lookup_for_appid(&http, 0).await,
            DeckCompatibilityLookup { status: DeckCompatibilityStatus::Failed, category: None }
        );
        http.assert_drained();
    }

    #[tokio::test]
    async fn steam_partner_events_keep_supported_types_localized_titles_and_images() {
        let supported = [12, 13, 14, 15, 23, 24, 25, 28, 35]
            .into_iter()
            .enumerate()
            .map(|(index, event_type)| json!({
                "gid":format!("event-{index}"),"event_type":event_type,"event_name":format!("Event {index}"),
                "rtime_created":1700000000+index,"jsondata":"{\"localized_title_image\":{\"english\":\"poster.jpg\"}}",
                "announcement_body":{"gid":format!("announcement-{index}"),"headline":format!("Headline {index}"),"body":"Release update"}
            }))
            .collect::<Vec<_>>();
        let events = Http::fixtures(vec![json_fixture(
            EVENTS_URL,
            json!({"events": [
                {"gid":"ignored","event_type":11,"event_name":"Not supported"},
                {"gid":"localized","event_type":28,"jsondata":"{}","announcement_body":{
                    "gid":"localized-announcement","headline":"Localized title","body":"[img]{STEAM_CLAN_IMAGE}/12345/roadmap.jpg[/img]",
                    "clanid":"12345"
                },"clanid":"67890"},
                supported[0].clone(),supported[1].clone(),supported[2].clone(),supported[3].clone(),
                supported[4].clone(),supported[5].clone(),supported[6].clone(),supported[7].clone(),supported[8].clone()
            ]}),
        )]);
        let rows = steam_partner_events_for_appid(&events, 400, 10).await;
        assert_eq!(rows.len(), 10);
        assert_eq!(rows[0]["title"], "Localized title");
        assert_eq!(rows[0]["image"], "https://clan.cloudflare.steamstatic.com/images/12345/roadmap.jpg");
        assert_eq!(rows[1]["event_type"], 12);
        assert_eq!(rows.last().unwrap()["event_type"], 35);
        assert!(rows.iter().all(|row| row["url"].as_str().unwrap().contains("steamcommunity.com/games/400/announcements/detail/")));
        events.assert_drained();
    }

    #[tokio::test]
    async fn steam_news_falls_back_to_news_feed_and_announcement_page_images() {
        let page_url = "https://steamcommunity.com/games/400/announcements/detail/2";
        let page = "<html><head><meta property=\"og:image\" content=\"https://cdn.example.com/page-image.jpg\"></head></html>";
        let http = Http::fixtures(vec![
            json_fixture(EVENTS_URL, json!({"events":[]})),
            json_fixture(NEWS_URL, json!({"appnews":{"appid":400,"newsitems":[
                {"gid":"1","title":"<b>Update one</b>","url":"https://store.steampowered.com/news/app/400/view/1","contents":"[img]https://cdn.example.com/body-image.jpg[/img]Patch details","author":"Studio","feedlabel":"Announcements","date":1700000000},
                {"gid":"2","title":"Update two","url":page_url,"contents":"Article contents","author":"Studio","feedname":"Steam feed","date":1700000100}
            ]}})),
            Fixture::text(page_url, page),
        ]);
        let rows = steam_news_for_appid(&http, 400, "Portal", 6).await.unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["title"], "Update one");
        assert_eq!(rows[0]["event_type"], 28);
        assert_eq!(rows[0]["image"], "https://cdn.example.com/body-image.jpg");
        assert_eq!(rows[0]["summary"], "Patch details");
        assert_eq!(rows[1]["image"], "https://cdn.example.com/page-image.jpg");
        assert_eq!(rows[1]["feedLabel"], "Steam feed");
        assert_eq!(rows[1]["date"], 1700000100);
        http.assert_drained();
    }

    #[tokio::test]
    async fn steam_news_prefers_partner_activity_and_swallows_news_failures() {
        let partner = Http::fixtures(vec![json_fixture(EVENTS_URL, event_fixture())]);
        let rows = steam_news_for_appid(&partner, 400, "Example", 6).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["event_type"], 28);
        assert_eq!(rows[0]["announcement_gid"], "announcement-1");
        partner.assert_drained();

        let failure = Http::fixtures(vec![
            json_fixture(EVENTS_URL, json!({"events":[]})),
            Fixture::failure(NEWS_URL),
        ]);
        assert_eq!(steam_news_for_appid(&failure, 400, "Example", 6).await.unwrap(), Vec::<Value>::new());
        failure.assert_drained();
    }

    #[test]
    fn steam_image_text_helpers_decode_entities_and_choose_article_art() {
        let body = "intro [img]https://cdn.example.com/divider.jpg[/img] Roadmap [img]https://cdn.example.com/roadmap.jpg[/img]";
        assert_eq!(
            steam_news_image_candidates(body, 1).first().map(String::as_str),
            Some("https://cdn.example.com/divider.jpg")
        );
        let separated=format!("intro [img]https://cdn.example.com/divider.jpg[/img] {} Roadmap [img]https://cdn.example.com/roadmap.jpg[/img]","middle ".repeat(100));
        assert_eq!(steam_news_image_candidates(&separated,1).first().map(String::as_str),Some("https://cdn.example.com/roadmap.jpg"));
        assert_eq!(
            steam_partner_asset_url("{STEAM_CLAN_IMAGE}/12345/update.jpg[/img]", ""),
            "https://clan.cloudflare.steamstatic.com/images/12345/update.jpg"
        );
        assert_eq!(clean_steam_news_text("<p>New &amp; improved</p>"), "New & improved");
        assert!(steam_news_raw_body("[img]https://cdn.example.com/x.jpg[/img]").contains("[img]"));
        let localized = json!({
            "clanid":"12345",
            "jsondata":{"localized_title_image":{"english":"poster.jpg"}},
            "announcement_body":{"body":""}
        });
        assert_eq!(
            steam_localized_value(&json!({"english":"", "en":" poster.jpg "})),
            "poster.jpg"
        );
        assert_eq!(
            steam_partner_event_images(&localized, 400),
            vec!["https://clan.cloudflare.steamstatic.com/images/12345/poster.jpg"]
        );
    }
}
