use crate::{
    http::{Http, Redirects},
    matching,
};
use regex::Regex;
use reqwest::{Method, header::CONTENT_LENGTH};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    sync::LazyLock,
    time::Duration,
};
use unicode_casefold::UnicodeCaseFold;

pub const IGN_GRAPHQL_URL: &str = "https://mollusk.apis.ign.com/graphql";
pub const IGN_BASE_URL: &str = "https://www.ign.com";
pub const IGN_GRAPHQL_MAX_BYTES: usize = 2 * 1024 * 1024;
pub const IGN_GRAPHQL_ERROR_MAX_BYTES: usize = 8 * 1024;
pub const TRAILER_HTML_MAX_BYTES: usize = 1_048_576;
pub const TRAILER_LISTING_MAX_ITEMS: usize = 24;
pub const TRAILER_VIDEO_MAX_PAGES: usize = 12;
pub const TRAILER_VIDEO_MAX_ASSETS: usize = 8;

static RX_SLUG_REMOVE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(the|game of the year|goty|deluxe|ultimate|complete|edition|remastered|remaster)\b")
        .expect("fixed IGN slug-removal regex")
});
static RX_SLUG_WORDS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[a-z0-9]+").expect("fixed IGN slug-word regex"));
static RX_IGN_GAME_ID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\A[A-Za-z0-9:._-]{1,256}\z").expect("fixed IGN game-id regex")
});
static RX_IGN_SLUG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\A[a-z0-9][a-z0-9-]{0,119}\z").expect("fixed IGN slug regex")
});
static RX_IGN_ID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\A[A-Za-z0-9_-]{1,128}\z").expect("fixed IGN video-id regex")
});
static RX_IGN_VIDEO_PATH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\A/videos/[A-Za-z0-9_-]+\z").expect("fixed IGN video-path regex")
});
static RX_IGN_ASSET_HOST: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\Aassets(?:[0-9]+)?\.ign\.com\z").expect("fixed IGN asset-host regex")
});
static RX_HTML_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)</?(div|a)\b[^>]*>").expect("fixed IGN listing-tag regex")
});
static RX_HTML_ATTRIBUTES: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')"#)
        .expect("fixed IGN HTML-attribute regex")
});
static RX_NEXT_SCRIPT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<script\b[^>]*>").expect("fixed IGN Next.js script regex")
});
static RX_SCRIPT_CLOSE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)</script\s*>").expect("fixed IGN script-close regex")
});
static RX_CONSOLE_SUFFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\s*(?:\[[^\]]+\]|\([^)]+\))\s*$")
        .expect("fixed IGN console-suffix regex")
});
static RX_TRAILING_IGN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\s*(?:[-|:]\s*)?IGN$").expect("fixed IGN trailer-name suffix regex")
});
static RX_ASCII_TITLE_WORDS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[a-z0-9]+").expect("fixed IGN title-token regex"));
static RX_MMO_WORD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bmmo\b").expect("fixed IGN MMO-boundary regex"));

const STORE_CATEGORY: &[(&str, i64)] = &[
    ("multiplayer", 1),
    ("single_player", 2),
    ("co_op", 9),
    ("mmo", 20),
    ("achievements", 22),
    ("split_screen", 24),
    ("full_controller", 28),
    ("online_multiplayer", 36),
    ("local_multiplayer", 37),
    ("online_co_op", 38),
    ("local_co_op", 392),
];
const TRAILER_ALLOWED_TITLE_WORDS: &[&str] = &[
    "ign", "official", "launch", "story", "gameplay", "reveal", "teaser", "cinematic",
    "announcement", "debut", "trailer", "red", "band", "extended", "final", "new", "first",
    "look", "world", "premiere", "video", "hd", "4k", "for", "the",
];
const TRAILER_REJECT_TITLE_WORDS: &[&str] = &[
    "analysis", "behind", "breakdown", "commercial", "developer", "documentary", "dlc",
    "edition", "expansion", "feature", "guide", "interview", "lore", "making", "news",
    "patch", "pinball", "playstation", "plus", "podcast", "promo", "promotional", "recap",
    "remaster", "remastered", "review", "roundtable", "scenes", "stream", "update",
    "walkthrough", "movie", "film", "machine", "booster", "pass", "holiday", "holidays",
    "collection", "and", "ii", "iii", "iv",
];

fn casefold(value: &str) -> String {
    value.case_fold().collect()
}

fn truthy_string(value: &Value) -> String {
    if matching::py_truthy(value) {
        matching::py_string(value)
    } else {
        String::new()
    }
}

fn truthy<'a>(value: &'a Value, fallback: &'a Value) -> &'a Value {
    if matching::py_truthy(value) { value } else { fallback }
}

fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or(&[])
}


/// Make an IGN game URL using the same relative-value conventions as the provider.
pub fn absolute_ign_url(value: Option<&str>) -> String {
    let Some(value) = value.filter(|value| !value.is_empty()) else {
        return String::new();
    };
    if value.starts_with("http") {
        value.to_owned()
    } else if value.starts_with('/') {
        format!("{IGN_BASE_URL}{value}")
    } else {
        format!("{IGN_BASE_URL}/games/{value}")
    }
}

/// Extract a slug from an IGN URL or the provider's relative slug forms.
pub fn slug_from_ign_value(value: &str) -> String {
    let raw = value.trim();
    if raw.is_empty() {
        return String::new();
    }
    if raw.starts_with("http") {
        let Some(parsed) = split_url(raw) else {
            return String::new();
        };
        let parts: Vec<&str> = parsed.path.split('/').filter(|part| !part.is_empty()).collect();
        if parts.len() >= 2 && parts[0] == "games" {
            return parts[1].to_owned();
        }
        return String::new();
    }
    let raw = raw.trim_matches('/');
    if let Some(rest) = raw.strip_prefix("games/") {
        return rest.split('/').next().unwrap_or_default().to_owned();
    }
    raw.split('/').next().unwrap_or_default().to_owned()
}

/// Generate the original IGN slug candidates, including the known Blood Stone alias.
pub fn slug_candidates(title: &str) -> Vec<String> {
    let mut cleaned = matching::clean_game_title(title).to_lowercase();
    for (old, new) in [
        ("&", " and "),
        ("+", " plus "),
        (":", " "),
        ("'", ""),
        ("’", ""),
    ] {
        cleaned = cleaned.replace(old, new);
    }
    cleaned = RX_SLUG_REMOVE.replace_all(&cleaned, " ").into_owned();
    let base = RX_SLUG_WORDS
        .find_iter(&cleaned)
        .map(|word| word.as_str())
        .collect::<Vec<_>>()
        .join("-");
    let mut candidates = Vec::new();
    if base.starts_with("james-bond-blood-stone") {
        candidates.push("james-bond-007-blood-stone".to_owned());
    }
    candidates.push(base.clone());
    if let Some(without_game) = base.strip_suffix("-game") {
        candidates.push(without_game.to_owned());
    }
    let mut seen = HashSet::new();
    candidates.retain(|candidate| !candidate.is_empty() && seen.insert(candidate.clone()));
    candidates
}

fn attributes_to_people(values: &Value) -> Vec<Value> {
    array(values)
        .iter()
        .filter_map(|value| {
            let value = value.as_object()?;
            let name = truthy_string(value.get("name").unwrap_or(&Value::Null));
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            let slug = truthy_string(value.get("slug").unwrap_or(&Value::Null));
            let slug = slug.trim();
            let url = if slug.is_empty() {
                String::new()
            } else {
                format!("{IGN_BASE_URL}/games/producer/{slug}")
            };
            Some(json!({"name": name, "url": url}))
        })
        .collect()
}

fn attributes_to_names(values: &Value) -> Vec<String> {
    array(values)
        .iter()
        .filter_map(Value::as_object)
        .filter_map(|value| value.get("name"))
        .filter(|name| matching::py_truthy(name))
        .map(matching::py_string)
        .map(|name| name.trim().to_owned())
        .filter(|name| !name.is_empty())
        .collect()
}

/// Return the earliest valid date across every regional release entry.
pub fn first_release_date(regions: &[Value]) -> Option<String> {
    let mut earliest: Option<String> = None;
    for region in regions.iter().filter_map(Value::as_object) {
        let Some(releases) = region.get("releases").and_then(Value::as_array) else { continue };
        for date in releases.iter()
            .filter_map(Value::as_object)
            .filter_map(|release| release.get("date"))
            .filter_map(matching::normalize_release_date)
        {
            if earliest.as_ref().is_none_or(|current| date.as_str() < current.as_str()) {
                earliest = Some(date);
            }
        }
    }
    earliest
}

/// Collect unique IGN platform slugs (or names when a slug is absent) in source order.
pub fn ign_platforms(game: &Value) -> Vec<String> {
    let mut platforms = Vec::new();
    for region in array(&game["objectRegions"]) {
        for release in array(&region["releases"]) {
            for attribute in array(&release["platformAttributes"]) {
                let Some(attribute) = attribute.as_object() else { continue };
                let source = truthy(attribute.get("slug").unwrap_or(&Value::Null), attribute.get("name").unwrap_or(&Value::Null));
                let platform = truthy_string(source).trim().to_lowercase();
                if !platform.is_empty() && !platforms.contains(&platform) {
                    platforms.push(platform);
                }
            }
        }
    }
    platforms
}

/// Infer Steam store categories from the textual IGN genres/features/descriptions.
pub fn infer_store_categories(text: &str) -> Vec<i64> {
    let haystack = casefold(text);
    let category = |name: &str| STORE_CATEGORY.iter().find(|(key, _)| *key == name).unwrap().1;
    let mut categories = Vec::new();
    if RX_MMO_WORD.is_match(&haystack) || haystack.contains("massively multiplayer") {
        categories.push(category("mmo"));
    }
    if haystack.contains("multiplayer") || haystack.contains("multi-player") {
        categories.extend([category("multiplayer"), category("online_multiplayer")]);
    }
    if haystack.contains("co-op") || haystack.contains("coop") || haystack.contains("cooperative") {
        categories.extend([category("co_op"), category("online_co_op")]);
    }
    if haystack.contains("split-screen") || haystack.contains("split screen") {
        categories.push(category("split_screen"));
    }
    if haystack.contains("controller") || haystack.contains("steam deck verified") {
        categories.push(category("full_controller"));
    }
    if !categories.contains(&category("multiplayer")) && !categories.contains(&category("mmo")) {
        categories.insert(0, category("single_player"));
    }
    let mut seen = HashSet::new();
    categories.retain(|value| seen.insert(*value));
    categories
}


/// Convert published, landscape IGN images to screenshot records.
pub fn ign_images_to_screenshots(game: &Value) -> Vec<Value> {
    let primary_id = truthy_string(&game["primaryImage"]["id"]);
    let mut images = Vec::new();
    for edge in array(&game["images"]["edges"]).iter().take(30) {
        let node = &edge["node"];
        if !node.is_object() {
            continue;
        }
        let url = truthy_string(&node["url"]);
        let url = url.trim();
        if url.is_empty() {
            continue;
        }
        let width = matching::as_number(&node["width"], 0.0).trunc() as i64;
        let height = matching::as_number(&node["height"], 0.0).trunc() as i64;
        if matching::py_truthy(&node["state"]) && casefold(&matching::py_string(&node["state"])) != "published" {
            continue;
        }
        if width != 0 && height != 0 && width < height {
            continue;
        }
        if !primary_id.is_empty() && matching::py_string(&node["id"]) == primary_id && width <= height {
            continue;
        }
        let id = if matching::py_truthy(&node["id"]) {
            matching::py_string(&node["id"])
        } else {
            url.to_owned()
        };
        images.push(json!({
            "id": id,
            "url": matching::https_url(url),
            "caption": matching::clean_html_text(&truthy_string(&node["caption"])),
            "width": width,
            "height": height,
        }));
        if images.len() == 30 {
            break;
        }
    }
    images
}

/// Map one IGN GraphQL game object into the provider's metadata shape.
pub fn game_to_metadata(game: &Value) -> Value {
    let metadata = &game["metadata"];
    let names = &metadata["names"];
    let descriptions = &metadata["descriptions"];
    let empty_title = Value::String(String::new());
    let title = truthy(names.get("name").unwrap_or(&Value::Null), truthy(names.get("short").unwrap_or(&Value::Null), truthy(game.get("slug").unwrap_or(&Value::Null), &empty_title)));
    let short_desc = matching::description_html_to_text(&truthy_string(&descriptions["short"]));
    let long_desc = matching::description_html_to_text(&truthy_string(&descriptions["long"]));
    let description = if !short_desc.is_empty() { &short_desc } else { &long_desc };
    let producers = attributes_to_people(&game["producers"]);
    let publishers = attributes_to_people(&game["publishers"]);
    let genres = attributes_to_names(&game["genres"]);
    let features = attributes_to_names(&game["features"]);
    let rating = matching::rating_to_percent(&game["primaryReview"]["score"])
        .map(Value::from)
        .unwrap_or(Value::Null);
    let release_date = first_release_date(array(&game["objectRegions"]));
    let category_text = [
        matching::py_string(title),
        if !long_desc.is_empty() { long_desc.clone() } else { short_desc.clone() },
        genres.join(" "),
        features.join(" "),
    ].join(" ");
    json!({
        "title": title,
        "id": truthy(game.get("id").unwrap_or(&Value::Null), truthy(game.get("slug").unwrap_or(&Value::Null), &Value::String(matching::py_string(title)))),
        "source": "IGN",
        "source_url": absolute_ign_url(Some(&truthy_string(truthy(game.get("url").unwrap_or(&Value::Null), game.get("slug").unwrap_or(&Value::Null))))),
        "description": description,
        "short_description": description,
        "developers": producers,
        "publishers": publishers,
        "release_date": release_date,
        "rating": rating,
        "store_categories": infer_store_categories(&category_text),
        "genres": genres,
        "features": features,
        "screenshots": ign_images_to_screenshots(game),
        "platforms": ign_platforms(game),
    })
}

fn parse_python_integer(value: &str) -> Option<i128> {
    let bytes = value.trim().as_bytes();
    let mut index = 0;
    let negative = match bytes.first() {
        Some(b'+') => {
            index = 1;
            false
        }
        Some(b'-') => {
            index = 1;
            true
        }
        _ => false,
    };
    let mut number = 0_i128;
    let mut digits = false;
    let mut previous_digit = false;
    while index < bytes.len() {
        match bytes[index] {
            digit @ b'0'..=b'9' => {
                number = number.saturating_mul(10).saturating_add(i128::from(digit - b'0'));
                digits = true;
                previous_digit = true;
            }
            b'_' if previous_digit && bytes.get(index + 1).is_some_and(u8::is_ascii_digit) => {
                previous_digit = false;
            }
            _ => return None,
        }
        index += 1;
    }
    if !digits || !previous_digit {
        return None;
    }
    Some(if negative { -number } else { number })
}

fn search_count(value: &Value) -> Result<i64, String> {
    let value = if matching::py_truthy(value) { value } else { return Ok(8) };
    let number = match value {
        Value::Bool(value) => i64::from(*value),
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                value
            } else if value.as_u64().is_some() {
                12
            } else if let Some(value) = value.as_f64().filter(|value| value.is_finite()) {
                if value > i64::MAX as f64 { 12 } else if value < i64::MIN as f64 { 1 } else { value.trunc() as i64 }
            } else {
                return Err("invalid IGN search limit".into());
            }
        }
        Value::String(value) => parse_python_integer(value)
            .map(|number| number.clamp(i64::MIN as i128, i64::MAX as i128) as i64)
            .ok_or_else(|| "invalid IGN search limit".to_owned())?,
        _ => return Err("invalid IGN search limit".into()),
    };
    Ok(number.clamp(1, 12))
}

async fn graphql(http: &Http, query: &str, variables: Value) -> Result<Value, String> {
    let response = http
        .request_with_error_limit(
            Method::POST,
            IGN_GRAPHQL_URL,
            &[
                ("Content-Type", "application/json"),
                ("Accept", "application/json"),
                ("Origin", IGN_BASE_URL),
                ("Referer", "https://www.ign.com/"),
                ("User-Agent", "DeckyMetadata/0.1 (+Decky Loader)"),
            ],
            Some(json!({"query": query, "variables": variables})),
            Duration::from_secs(20),
            IGN_GRAPHQL_MAX_BYTES,
            IGN_GRAPHQL_ERROR_MAX_BYTES,
            Redirects::Default,
        )
        .await?;
    if !(200..300).contains(&response.status) {
        return Err(format!("IGN request failed: {} {}", response.status, response.text()));
    }
    let payload=response.json()?;
    if !payload.is_object() {
        return Err("IGN GraphQL response is not a JSON object".into());
    }
    if matching::py_truthy(&payload["errors"]) {
        return Err(format!("IGN GraphQL error: {}", matching::py_string(&payload["errors"])));
    }
    Ok(payload)
}

/// Search IGN games and return its raw, mapped search-result envelope.
pub async fn search_metadata(http: &Http, query: &Value, limit: &Value) -> Result<Vec<Value>, String> {
    let cleaned = matching::clean_game_title(&truthy_string(query));
    if cleaned.is_empty() {
        return Ok(Vec::new());
    }
    let count = search_count(limit)?;
    let gql = r#"
    query SearchObjectsByName($name: String!, $count: Int!, $type: ObjectType!) {
      searchObjectsByName(name: $name, count: $count, type: $type) {
        edges {
          node {
            id
            slug
            url
            type
            metadata {
              names { name short }
              descriptions { short }
            }
            primaryReview { score }
          }
        }
      }
    }
    "#;
    let payload = graphql(
        http,
        gql,
        json!({"name": cleaned, "count": count, "type": "Game"}),
    )
    .await?;
    let mut results = Vec::new();
    for edge in array(&payload["data"]["searchObjectsByName"]["edges"]) {
        let node = &edge["node"];
        let names = &node["metadata"]["names"];
        let title = truthy(names.get("name").unwrap_or(&Value::Null), truthy(names.get("short").unwrap_or(&Value::Null), node.get("slug").unwrap_or(&Value::Null)));
        if !matching::py_truthy(title) {
            continue;
        }
        results.push(json!({
            "id": node.get("id").cloned().unwrap_or(Value::Null),
            "slug": node.get("slug").cloned().unwrap_or(Value::Null),
            "url": absolute_ign_url(Some(&truthy_string(truthy(node.get("url").unwrap_or(&Value::Null), node.get("slug").unwrap_or(&Value::Null))))),
            "title": title,
            "description": matching::description_html_to_text(&truthy_string(&node["metadata"]["descriptions"]["short"])),
            "rating": matching::rating_to_percent(&node["primaryReview"]["score"]).map(Value::from).unwrap_or(Value::Null),
        }));
    }
    Ok(results)
}

/// Fetch complete IGN metadata from a slug or IGN game URL; parent code sanitizes the result.
pub async fn fetch_metadata(http: &Http, slug_or_url: &str) -> Result<Option<Value>, String> {
    let slug = slug_from_ign_value(slug_or_url);
    if slug.is_empty() {
        return Ok(None);
    }
    let variables = json!({"slug": slug, "objectType": "Game", "state": "Published"});
    let gql = r#"
    query ObjectSelectByTypeAndSlug($objectType: ObjectType!, $slug: String!, $state: State) {
      objectSelectByTypeAndSlug(type: $objectType, slug: $slug, state: $state) {
        id
        slug
        url
        type
        metadata {
          names { name short alt }
          descriptions { short long }
        }
        producers { name slug }
        publishers { name slug }
        genres { name slug }
        features { name slug }
        primaryImage { id url caption state height width }
        images {
          edges {
            node { id url caption state height width }
          }
        }
        primaryReview { score scoreText scoreSummary }
        objectRegions {
          region
          releases {
            date
            platformAttributes { name slug }
          }
        }
      }
    }
    "#;
    let payload = graphql(http, gql, variables).await?;
    let game = &payload["data"]["objectSelectByTypeAndSlug"];
    Ok(game.as_object().map(|_| game_to_metadata(game)))
}

/// Fetch a game's page and validate its identity before using any trailer listings.
pub async fn auto_fetch_metadata(http: &Http, title: &str) -> Result<Option<Value>, String> {
    let cleaned = matching::clean_game_title(title);
    if cleaned.is_empty() {
        return Ok(None);
    }
    let mut fallback = None;
    for slug in slug_candidates(&cleaned) {
        if http.cancel.is_cancelled() {
            return Err("backend stopping".into());
        }
        let metadata = match fetch_metadata(http, &slug).await {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if let Some(metadata) = consider_metadata(&cleaned, metadata, &mut fallback) {
            return Ok(Some(metadata));
        }
    }
    let results = search_metadata(http, &Value::String(cleaned.clone()), &json!(5)).await?;
    let mut ranked = results;
    ranked.sort_by_key(|candidate| matching::console_title_suffix(candidate.get("title").and_then(Value::as_str).unwrap_or("")).is_some());
    for candidate in ranked.iter().take(4) {
        if http.cancel.is_cancelled() {
            return Err("backend stopping".into());
        }
        let slug = truthy(candidate.get("slug").unwrap_or(&Value::Null), candidate.get("url").unwrap_or(&Value::Null));
        let slug = truthy_string(slug);
        let metadata = match fetch_metadata(http, &slug).await {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if let Some(metadata) = consider_metadata(&cleaned, metadata, &mut fallback) {
            return Ok(Some(metadata));
        }
    }
    Ok(fallback)
}

fn consider_metadata(query: &str, metadata: Option<Value>, fallback: &mut Option<Value>) -> Option<Value> {
    let metadata = metadata?;
    let candidate_title = metadata["title"].as_str().unwrap_or("");
    if !matching::ign_title_acceptable(query, candidate_title) {
        return None;
    }
    let platforms = metadata["platforms"].as_array();
    let has_pc = platforms.map(|platforms| {
        let platforms = platforms.iter().filter_map(Value::as_str).map(str::to_owned).collect::<Vec<_>>();
        matching::has_pc_platform(&platforms)
    }).unwrap_or(false);
    if platforms.is_none_or(Vec::is_empty) || has_pc {
        return Some(metadata);
    }
    if fallback.is_none() {
        *fallback = Some(metadata);
    }
    None
}

#[derive(Clone, Debug)]
struct ParsedUrl<'a> {
    scheme: Option<&'a str>,
    authority: Option<&'a str>,
    path: &'a str,
    query: Option<&'a str>,
    fragment: Option<&'a str>,
}

fn split_url(value: &str) -> Option<ParsedUrl<'_>> {
    let (without_fragment, fragment) = match value.split_once('#') {
        Some((before, after)) => (before, Some(after)),
        None => (value, None),
    };
    let (before_query, query) = match without_fragment.split_once('?') {
        Some((before, after)) => (before, Some(after)),
        None => (without_fragment, None),
    };
    if let Some((scheme, rest)) = before_query.split_once("://") {
        if scheme.is_empty()
            || !scheme.as_bytes()[0].is_ascii_alphabetic()
            || !scheme.as_bytes()[1..].iter().all(|byte| byte.is_ascii_alphanumeric() || matches!(*byte, b'+' | b'.' | b'-'))
        {
            return None;
        }
        let authority_end = rest.find('/').unwrap_or(rest.len());
        let authority = &rest[..authority_end];
        let path = &rest[authority_end..];
        Some(ParsedUrl { scheme: Some(scheme), authority: Some(authority), path, query, fragment })
    } else if let Some((scheme, path)) = before_query.split_once(':') {
        if scheme.is_empty()
            || !scheme.as_bytes()[0].is_ascii_alphabetic()
            || !scheme.as_bytes()[1..].iter().all(|byte| byte.is_ascii_alphanumeric() || matches!(*byte, b'+' | b'.' | b'-'))
        {
            return Some(ParsedUrl { scheme: None, authority: None, path: before_query, query, fragment });
        }
        Some(ParsedUrl { scheme: Some(scheme), authority: None, path, query, fragment })
    } else {
        Some(ParsedUrl {scheme:None,authority:None,path:before_query,query,fragment})
    }
}

fn canonical_origin(authority: &str, host: &str) -> bool {
    if authority.contains('@') || authority.is_empty() {
        return false;
    }
    let (authority_host, port) = match authority.rsplit_once(':') {
        Some((host, port)) if !host.contains(':') => (host, Some(port)),
        Some(_) => return false,
        None => (authority, None),
    };
    authority_host.eq_ignore_ascii_case(host)
        && match port {
            None | Some("") => true,
            Some(port) => port.parse::<u16>().is_ok_and(|port| port == 443),
        }
}

/// Return whether a URL uses IGN's canonical HTTPS web origin, without normalizing paths.
pub fn is_ign_page_url(value: &str) -> bool {
    let Some(parsed) = split_url(value) else { return false };
    parsed.scheme.is_some_and(|scheme| scheme.eq_ignore_ascii_case("https"))
        && parsed.authority.is_some_and(|authority| canonical_origin(authority, "www.ign.com"))
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2])) {
                decoded.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

fn hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

/// Return a validated canonical game slug from a relative slug or IGN game URL.
pub fn canonical_game_slug(value: Option<&str>) -> String {
    let raw = value.unwrap_or_default().trim();
    if raw.is_empty() {
        return String::new();
    }
    let slug = if raw.contains("://") || raw.starts_with("//") {
        if !is_ign_page_url(raw) {
            return String::new();
        }
        let Some(parsed) = split_url(raw) else { return String::new() };
        if parsed.query.is_some_and(|query| !query.is_empty()) || parsed.fragment.is_some_and(|fragment| !fragment.is_empty()) {
            return String::new();
        }
        let Some(slug) = parsed.path.strip_prefix("/games/") else { return String::new() };
        let slug = slug.strip_suffix('/').unwrap_or(slug);
        if slug.is_empty() || slug.contains('/') {
            return String::new();
        }
        slug
    } else {
        let slug = raw.trim_matches('/');
        let slug = slug.strip_prefix("games/").unwrap_or(slug);
        if slug.contains('/') { return String::new() }
        slug
    };
    let slug = casefold(&percent_decode(slug));
    if RX_IGN_SLUG.is_match(&slug) { slug } else { String::new() }
}

fn title_tokens(value: &str) -> Vec<String> {
    let decoded = matching::decode_html_entities(value).into_owned();
    let folded = casefold(&decoded).replace('&', " and ");
    let mut tokens = RX_ASCII_TITLE_WORDS
        .find_iter(&folded)
        .map(|matched| matched.as_str().to_owned())
        .collect::<Vec<_>>();
    while tokens.first().is_some_and(|word| matches!(word.as_str(), "a" | "an" | "the")) {
        tokens.remove(0);
    }
    tokens
}

fn title_without_platform_suffix(value: &str) -> String {
    if matching::console_title_suffix(value).is_some() {
        RX_CONSOLE_SUFFIX.replace(value, "").into_owned()
    } else {
        value.to_owned()
    }
}

fn same_game_title(left: &str, right: &str) -> bool {
    let left = title_tokens(&title_without_platform_suffix(left));
    !left.is_empty() && left == title_tokens(&title_without_platform_suffix(right))
}

fn game_titles(game: &Value) -> Vec<String> {
    let names = &game["metadata"]["names"];
    let values: Vec<&Value> = if names.is_object() {
        [names.get("name"), names.get("short"), names.get("alt")]
            .into_iter()
            .flatten()
            .collect()
    } else if let Some(values) = names.as_array() {
        values.iter().map(|value| value.as_object().and_then(|object| object.get("name")).unwrap_or(value)).collect()
    } else {
        Vec::new()
    };
    values.into_iter().filter_map(Value::as_str).map(str::trim).filter(|value| !value.is_empty()).map(str::to_owned).collect()
}

#[derive(Clone, Debug)]
struct GameIdentity {
    id: String,
    slug: String,
    title: String,
}

fn game_identity(game: &Value, requested_slug: &str, title: &str) -> Option<GameIdentity> {
    if !game.is_object() || casefold(&truthy_string(&game["type"])) != "game" {
        return None;
    }
    let game_id = match &game["id"] {
        Value::String(value) => value.clone(),
        Value::Number(value) => {
            let value = value.to_string();
            if value == "0" || !value.bytes().all(|byte| byte.is_ascii_digit()) {
                return None;
            }
            value
        }
        _ => return None,
    };
    let id = game_id.trim().to_owned();
    if !RX_IGN_GAME_ID.is_match(&id) {
        return None;
    }
    let raw_slug = truthy_string(&game["slug"]);
    let slug = canonical_game_slug(Some(&raw_slug));
    if slug.is_empty() || slug != requested_slug {
        return None;
    }
    if matching::py_truthy(&game["url"]) {
        let url_slug = canonical_game_slug(Some(&matching::py_string(&game["url"])));
        if url_slug.is_empty() || url_slug != slug {
            return None;
        }
    }
    let titles = game_titles(game);
    if titles.is_empty() || (!title.is_empty() && !titles.iter().any(|candidate| same_game_title(title, candidate))) {
        return None;
    }
    Some(GameIdentity {
        id,
        slug,
        title: title_without_platform_suffix(&titles[0]),
    })
}

async fn fetch_game_by_slug(http: &Http, slug: &str, title: &str) -> Result<Option<GameIdentity>, String> {
    if !RX_IGN_SLUG.is_match(slug) {
        return Ok(None);
    }
    let query = r#"
    query ObjectSelectByTypeAndSlug($objectType: ObjectType!, $slug: String!, $state: State) {
      objectSelectByTypeAndSlug(type: $objectType, slug: $slug, state: $state) {
        id
        slug
        url
        type
        metadata { names { name short alt } }
      }
    }
    "#;
    let payload = graphql(http, query, json!({"slug": slug, "objectType": "Game", "state": "Published"})).await?;
    Ok(game_identity(&payload["data"]["objectSelectByTypeAndSlug"], slug, title))
}

async fn resolve_game_identity(http: &Http, title: &str, game_url: Option<&str>) -> Result<Option<GameIdentity>, String> {
    let cleaned = matching::clean_game_title(title);
    if cleaned.is_empty() || cleaned.chars().count() > 200 {
        return Ok(None);
    }
    let game_url = game_url.filter(|url| !url.is_empty());
    let saved_slug = game_url.map(|url| canonical_game_slug(Some(url))).unwrap_or_default();
    if let Some(url) = game_url {
        if !is_ign_page_url(url) || saved_slug.is_empty() {
            return Ok(None);
        }
    }
    if !saved_slug.is_empty() {
        return fetch_game_by_slug(http, &saved_slug, "").await;
    }
    let results = search_metadata(http, &Value::String(cleaned.clone()), &json!(12)).await?;
    let exact = results.into_iter().filter(|result| {
        same_game_title(&cleaned, result.get("title").and_then(Value::as_str).unwrap_or(""))
    });
    let mut found: HashMap<String, GameIdentity> = HashMap::new();
    let mut seen_slugs = HashSet::new();
    for result in exact {
        if http.cancel.is_cancelled() {
            return Err("backend stopping".into());
        }
        let result_slug = truthy(result.get("slug").unwrap_or(&Value::Null), result.get("url").unwrap_or(&Value::Null));
        let slug = canonical_game_slug(Some(&truthy_string(result_slug)));
        if slug.is_empty() || !seen_slugs.insert(slug.clone()) {
            continue;
        }
        let Some(identity) = fetch_game_by_slug(http, &slug, &cleaned).await? else {
            continue;
        };
        if result.get("id").is_some_and(|id| !id.is_null()) && matching::py_string(&result["id"]).trim() != identity.id {
            continue;
        }
        found.insert(identity.id.clone(), identity);
    }
    if found.len() == 1 {
        Ok(found.into_values().next())
    } else {
        Ok(None)
    }
}

fn html_attributes(tag: &str) -> HashMap<String, String> {
    RX_HTML_ATTRIBUTES
        .captures_iter(tag)
        .filter_map(|captures| {
            let key = captures.get(1)?.as_str().to_lowercase();
            let value = captures.get(2).or_else(|| captures.get(3))?.as_str();
            Some((key, matching::decode_html_entities(value).into_owned()))
        })
        .collect()
}

pub fn canonical_video_page_url(value: &str) -> String {
    let raw = value.trim();
    if raw.is_empty() {
        return String::new();
    }
    let absolute = if raw.contains("://") || raw.starts_with("//") {
        raw.to_owned()
    } else if raw.starts_with('/') {
        format!("{IGN_BASE_URL}{raw}")
    } else {
        return String::new();
    };
    if !is_ign_page_url(&absolute) {
        return String::new();
    }
    let Some(parsed) = split_url(&absolute) else { return String::new() };
    if parsed.query.is_some_and(|query| !query.is_empty())
        || parsed.fragment.is_some_and(|fragment| !fragment.is_empty())
        || !RX_IGN_VIDEO_PATH.is_match(parsed.path)
    {
        return String::new();
    }
    format!("https://www.ign.com{}", parsed.path)
}

/// Parse labelled video links only from bounded IGN trailer-card containers.
pub fn parse_trailer_listing(document: &str) -> Vec<Value> {
    let mut items = Vec::new();
    let mut item_id = String::new();
    let mut depth = 0usize;
    let mut found = false;
    for token in RX_HTML_TAG.find_iter(document) {
        let tag_text = token.as_str();
        let captures = RX_HTML_TAG.captures(tag_text).expect("tag matched by same fixed regex");
        let tag = captures.get(1).unwrap().as_str().to_ascii_lowercase();
        let closing = tag_text.starts_with("</");
        if tag == "div" {
            if closing {
                if depth != 0 {
                    depth -= 1;
                    if depth == 0 {
                        item_id.clear();
                    }
                }
            } else {
                if tag_text.contains("content-item") {
                    let attributes = html_attributes(tag_text);
                    if attributes.get("data-cy").is_some_and(|value| value == "content-item") {
                        let candidate = attributes.get("data-id").map(String::as_str).unwrap_or_default();
                        item_id = if RX_IGN_ID.is_match(candidate) { candidate.to_owned() } else { String::new() };
                        depth = 1;
                        found = false;
                        continue;
                    }
                }
                if depth != 0 {
                    depth += 1;
                }
            }
        } else if tag == "a" && !closing && !item_id.is_empty() && !found {
            let attributes = html_attributes(tag_text);
            let url = canonical_video_page_url(attributes.get("href").map(String::as_str).unwrap_or_default());
            let label = attributes.get("aria-label").map(String::as_str).unwrap_or_default().trim();
            if !url.is_empty() && !label.is_empty() {
                items.push(json!({"id": item_id, "url": url, "label": label}));
                found = true;
                if items.len() >= TRAILER_LISTING_MAX_ITEMS {
                    break;
                }
            }
        }
    }
    items
}

/// Parse the bounded `page` object from an IGN `__NEXT_DATA__` script.
pub fn next_data_page(document: &str) -> Option<Value> {
    for script in RX_NEXT_SCRIPT.find_iter(document) {
        let attributes = html_attributes(script.as_str());
        if attributes.get("id").map(String::as_str) != Some("__NEXT_DATA__") {
            continue;
        }
        let end = RX_SCRIPT_CLOSE.find_at(document, script.end())?;
        let data = &document[script.end()..end.start()];
        if data.len() > TRAILER_HTML_MAX_BYTES {
            return None;
        }
        let payload: Value = serde_json::from_str(data).ok()?;
        let page = &payload["props"]["pageProps"]["page"];
        return page.as_object().map(|_| page.clone());
    }
    None
}

/// Score a video title only when its game identity and trailer-specific wording are exact.
pub fn trailer_title_score(game_title: &str, video_title: &str) -> Option<i32> {
    let game_words = title_tokens(game_title);
    let mut video_words = title_tokens(video_title);
    if game_words.is_empty() || video_words.is_empty() {
        return None;
    }
    if video_words.last().is_some_and(|word| word == "ign") {
        video_words.pop();
    }
    let start = video_words
        .windows(game_words.len())
        .position(|window| window == game_words.as_slice())?;
    let before = &video_words[..start];
    let after = &video_words[start + game_words.len()..];
    let surrounding = before.iter().chain(after.iter()).map(String::as_str).collect::<Vec<_>>();
    if surrounding.is_empty() || surrounding.iter().any(|word| TRAILER_REJECT_TITLE_WORDS.contains(word)) {
        return None;
    }
    if before.iter().any(|word| !TRAILER_ALLOWED_TITLE_WORDS.contains(&word.as_str())) {
        return None;
    }
    if !surrounding.iter().any(|word| matches!(*word, "trailer" | "teaser")) {
        return None;
    }
    for (index, word) in surrounding.iter().enumerate() {
        if !word.bytes().all(|byte| byte.is_ascii_digit()) {
            continue;
        }
        let previous = index.checked_sub(1).map(|index| surrounding[index]).unwrap_or("");
        if *word == "360" && previous == "xbox" {
            continue;
        }
        if previous == "part" || (previous.starts_with('v') && previous[1..].bytes().all(|byte| byte.is_ascii_digit()) && previous.len() > 1) {
            continue;
        }
        return None;
    }
    let mut score = if surrounding.contains(&"trailer") { 50 } else { 35 };
    score += if surrounding.contains(&"official") { 20 } else { 0 };
    score += if surrounding.contains(&"launch") { 20 } else { 0 };
    score += if surrounding.contains(&"gameplay") { 15 } else { 0 };
    score += if surrounding.contains(&"story") { 12 } else { 0 };
    score += if surrounding.contains(&"reveal") { 10 } else { 0 };
    score += if surrounding.contains(&"cinematic") { 5 } else { 0 };
    Some(score)
}

/// Validate and canonicalize an allowed HTTPS IGN MP4 asset URL for host diagnostics.
pub fn canonical_mp4_url(value: &str) -> Option<String> {
    let raw = value.trim();
    let parsed = split_url(raw)?;
    if !parsed.scheme.is_some_and(|scheme| scheme.eq_ignore_ascii_case("https")) {
        return None;
    }
    let authority = parsed.authority?;
    let host = authority_host(authority)?;
    if !canonical_origin(authority, host)
        || !RX_IGN_ASSET_HOST.is_match(host)
        || !parsed.path.to_ascii_lowercase().ends_with(".mp4")
        || parsed.fragment.is_some_and(|fragment| !fragment.is_empty())
        || parsed.query.is_some_and(|query| query.chars().count() > 2048)
    {
        return None;
    }
    let query = parsed.query.filter(|query| !query.is_empty())
        .map(|query| format!("?{query}")).unwrap_or_default();
    Some(format!("https://{authority}{}{query}", parsed.path))
}

fn authority_host(authority: &str) -> Option<&str> {
    if authority.contains('@') || authority.is_empty() {
        return None;
    }
    match authority.rsplit_once(':') {
        Some((host, port)) if !host.contains(':') => {
            if !port.is_empty() && port.parse::<u16>().is_err() {
                return None;
            }
            Some(host)
        }
        Some(_) => None,
        None => Some(authority),
    }
}

/// Filter, deduplicate, rank and bound direct MP4 video assets.
pub fn page_assets(assets: &Value) -> Vec<Value> {
    let Some(assets) = assets.as_array() else { return Vec::new() };
    let mut candidates: Vec<(i64, Value)> = Vec::new();
    let mut seen = HashSet::new();
    for asset in assets {
        if !asset.is_object() {
            continue;
        }
        let url = canonical_mp4_url(&truthy_string(&asset["url"]));
        let Some(url) = url else { continue };
        let Some(height) = asset["height"].as_i64() else { continue };
        let format = casefold(&truthy_string(&asset["format"]));
        if !(360..=4320).contains(&height) || (!format.is_empty() && !format.contains("mp4")) {
            continue;
        }
        if !seen.insert(url.clone()) {
            continue;
        }
        candidates.push((height, json!({"format": "mp4", "url": url, "height": height})));
    }
    candidates.sort_by(|left, right| right.0.cmp(&left.0));
    candidates.into_iter().take(TRAILER_VIDEO_MAX_ASSETS).map(|(_, candidate)| candidate).collect()
}

async fn trailer_html(http: &Http, url: &str) -> Result<String, String> {
    let response = http
        .request_with_error_limit(
            Method::GET,
            url,
            &[("Accept", "text/html,application/xhtml+xml")],
            None,
            Duration::from_secs(12),
            TRAILER_HTML_MAX_BYTES,
            TRAILER_HTML_MAX_BYTES,
            Redirects::Ign,
        )
        .await?;
    if !(200..300).contains(&response.status) {
        return Err(format!("HTTP {}", response.status));
    }
    if !is_ign_page_url(&response.url) {
        return Err("IGN trailer response left the canonical HTTPS host".into());
    }
    if let Some(length) = response.headers.get(CONTENT_LENGTH) {
        let length = length.to_str().map_err(|_| "IGN trailer response has an invalid length")?;
        let length = length.parse::<i128>().map_err(|_| "IGN trailer response has an invalid length")?;
        if length > TRAILER_HTML_MAX_BYTES as i128 {
            return Err("IGN trailer response exceeds bounded read limit".into());
        }
    }
    if response.body.len() > TRAILER_HTML_MAX_BYTES {
        return Err("IGN trailer response exceeds bounded read limit".into());
    }
    Ok(response.text())
}

fn truncate_chars(value: &str, count: usize) -> String {
    value.chars().take(count).collect()
}

/// Find a verified trailer; provider/network errors and misses intentionally return `None`.
pub async fn find_trailer(http: &Http, title: &str, game_url: Option<&str>) -> Option<Value> {
    if http.cancel.is_cancelled() {
        return None;
    }
    let result = async {
        let cleaned_title = matching::clean_game_title(title);
        let game = resolve_game_identity(http, &cleaned_title, game_url).await.ok()??;
        let listing_url = format!("{IGN_BASE_URL}/games/{}/trailers", game.slug);
        let listing_html = trailer_html(http, &listing_url).await.ok()?;
        if listing_html.len() > TRAILER_HTML_MAX_BYTES {
            return None;
        }
        let entries = parse_trailer_listing(&listing_html);
        let mut ranked: Vec<(i32, usize, String, Vec<Value>)> = Vec::new();
        let mut attempted_pages = 0;
        for (index, entry) in entries.iter().enumerate() {
            if http.cancel.is_cancelled() {
                return None;
            }
            let listed_score = trailer_title_score(&game.title, entry["label"].as_str().unwrap_or(""));
            let Some(listed_score) = listed_score else { continue };
            if attempted_pages >= TRAILER_VIDEO_MAX_PAGES {
                break;
            }
            attempted_pages += 1;
            let Some(video_html) = trailer_html(http, entry["url"].as_str().unwrap_or_default()).await.ok() else { continue };
            if video_html.len() > TRAILER_HTML_MAX_BYTES {
                continue;
            }
            let Some(page) = next_data_page(&video_html) else { continue };
            let page_id = truthy_string(&page["objectId"]);
            if page_id.is_empty() || !page_id.eq_ignore_ascii_case(&game.id) {
                continue;
            }
            if casefold(&truthy_string(&page["category"]).trim()) != "trailer" {
                continue;
            }
            let video = &page["video"];
            let content = &video["content"];
            if !content.is_object() || !truthy_string(&content["id"]).eq_ignore_ascii_case(entry["id"].as_str().unwrap_or_default()) {
                continue;
            }
            let primary = &content["primaryObject"];
            if !primary.is_object()
                || casefold(&truthy_string(&primary["type"])) != "game"
                || !truthy_string(&primary["id"]).eq_ignore_ascii_case(&game.id)
            {
                continue;
            }
            let page_title = truthy_string(&page["pageTitle"]);
            let page_score = trailer_title_score(&game.title, page_title.trim());
            let Some(page_score) = page_score else { continue };
            let candidates = page_assets(&video["assets"]);
            if candidates.is_empty() {
                continue;
            }
            let decoded_title = matching::decode_html_entities(page_title.trim()).into_owned();
            let mut name = RX_TRAILING_IGN.replace(&decoded_title, "").trim().to_owned();
            if name.is_empty() {
                name = truncate_chars(entry["label"].as_str().unwrap_or(""), 200);
            }
            ranked.push((listed_score.min(page_score), index, truncate_chars(&name, 200), candidates));
        }
        if http.cancel.is_cancelled() {
            return None;
        }
        let best = ranked.into_iter().max_by_key(|(score, index, _, _)| (*score, std::cmp::Reverse(*index)))?;
        Some(json!({"name": best.2, "candidates": best.3}))
    }.await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Fixture, Response};
    use reqwest::header::{HeaderMap, HeaderValue};

    fn graphql_fixture(status: u16, body: Vec<u8>) -> Fixture {
        graphql_fixture_with_length(status, body, None)
    }

    fn graphql_fixture_with_length(status: u16, body: Vec<u8>, content_length: Option<&str>) -> Fixture {
        let mut headers = HeaderMap::new();
        if let Some(content_length) = content_length {
            headers.insert(CONTENT_LENGTH, HeaderValue::from_str(content_length).unwrap());
        }
        Fixture {
            method: Method::POST,
            url: IGN_GRAPHQL_URL.to_owned(),
            result: Ok(Response { status, headers, body, url: IGN_GRAPHQL_URL.to_owned() }),
        }
    }

    fn graphql_json(body: Value) -> Fixture {
        graphql_fixture(200, serde_json::to_vec(&body).unwrap())
    }

    fn graphql_error(body: Vec<u8>) -> Fixture {
        graphql_fixture(503, body)
    }

    fn search_node(title: &str, slug: &str, id: &str) -> Value {
        json!({
            "id": id,
            "slug": slug,
            "url": format!("/games/{slug}"),
            "type": "Game",
            "metadata": {"names": {"name": title}, "descriptions": {"short": "<p>Provider description</p>"}},
            "primaryReview": {"score": 8.5}
        })
    }

    fn search_reply(nodes: Vec<Value>) -> Value {
        json!({"data": {"searchObjectsByName": {"edges": nodes.into_iter().map(|node| json!({"node": node})).collect::<Vec<_>>()}}})
    }

    fn game_reply(id: &str, slug: &str, title: &str, platform: &str) -> Value {
        json!({"data": {"objectSelectByTypeAndSlug": {
            "id": id,
            "slug": slug,
            "url": format!("https://www.ign.com/games/{slug}"),
            "type": "Game",
            "metadata": {"names": {"name": title, "short": title, "alt": []}, "descriptions": {"short": "<p>Short</p>", "long": "<p>Long</p>"}},
            "producers": [{"name": "Studio", "slug": "studio"}],
            "publishers": [{"name": "Publisher", "slug": "publisher"}],
            "genres": [{"name": "Action"}],
            "features": [{"name": "Single player"}],
            "primaryReview": {"score": 8.5},
            "objectRegions": [
                {"region": "North America", "releases": [{"date": "Nov 12, 2024", "platformAttributes": [{"slug": platform}]}]},
                {"region": "Europe", "releases": [{"date": "2024-10-03", "platformAttributes": [{"name": "PC"}]}]}
            ]
        }}})
    }

    fn verified_game(id: &str, slug: &str, title: &str) -> Value {
        json!({
            "id": id,
            "slug": slug,
            "url": format!("https://www.ign.com/games/{slug}"),
            "type": "Game",
            "metadata": {"names": {"name": title, "short": title}}
        })
    }

    fn video_page(game_id: &str, video_id: &str, title: &str, assets: Value) -> String {
        let payload = json!({"props": {"pageProps": {"page": {
            "objectId": game_id,
            "pageTitle": title,
            "category": "Trailer",
            "video": {
                "content": {"id": video_id, "primaryObject": {"type": "Game", "id": game_id}},
                "assets": assets
            }
        }}}})
        .to_string();
        format!("<script id=\"__NEXT_DATA__\">{payload}</script>")
    }

    #[tokio::test]
    async fn ign_search_maps_results_and_caps_requested_count() {
        let http = Http::fixtures(vec![graphql_json(search_reply(vec![
            search_node("Deadpool", "deadpool", "game-deadpool"),
            json!({"slug": "ignored-without-a-title", "metadata": {"names": {}}}),
        ]))]);
        let results = search_metadata(&http, &json!("Deadpool"), &json!(500)).await.unwrap();
        http.assert_drained();
        assert_eq!(results, vec![json!({
            "id": "game-deadpool", "slug": "deadpool", "url": "https://www.ign.com/games/deadpool",
            "title": "Deadpool", "description": "Provider description", "rating": 85
        }),json!({"id":null,"slug":"ignored-without-a-title","url":"https://www.ign.com/games/ignored-without-a-title",
            "title":"ignored-without-a-title","description":"","rating":null})]);
        assert!(slug_candidates("James Bond Blood Stone").starts_with(&["james-bond-007-blood-stone".into()]));
        assert_eq!(slug_candidates("The Sample Game of the Year"), vec!["sample"]);
        assert_eq!(search_count(&json!("1_0")).unwrap(), 10);
        assert_eq!(search_count(&json!("900719925474099312345")).unwrap(), 12);
        assert_eq!(search_count(&json!("not a number")).unwrap_err(), "invalid IGN search limit");
    }

    #[tokio::test]
    async fn ign_graphql_enforces_success_and_error_body_limits_on_consumer_calls() {
        let valid_json = br#"{"data":{"searchObjectsByName":{"edges":[]}}}"#;
        let mut exactly_two_mib = valid_json.to_vec();
        exactly_two_mib.resize(IGN_GRAPHQL_MAX_BYTES, b' ');
        let mut invalid_utf8_success = valid_json.to_vec();
        invalid_utf8_success.push(0xff);
        let oversized_success = vec![b' '; IGN_GRAPHQL_MAX_BYTES + 1];
        let oversized_success_declared = valid_json.to_vec();
        let mut exactly_eight_kib_error = vec![b'x'; IGN_GRAPHQL_ERROR_MAX_BYTES];
        exactly_eight_kib_error[4096] = 0xff;
        let oversized_error = vec![b'x'; IGN_GRAPHQL_ERROR_MAX_BYTES + 1];
        let http = Http::fixtures(vec![
            graphql_fixture_with_length(200, exactly_two_mib, Some("2097152")),
            graphql_fixture(200, invalid_utf8_success),
            graphql_fixture(200, oversized_success),
            graphql_fixture_with_length(200, oversized_success_declared, Some("2097153")),
            graphql_fixture_with_length(503, exactly_eight_kib_error, Some("8192")),
            graphql_error(oversized_error),
            graphql_fixture(200, b"[]".to_vec()),
            graphql_fixture(200, b"not-json".to_vec()),
            graphql_json(json!({"errors": [{"message": "bad"}]})),
        ]);
        assert!(search_metadata(&http, &json!("Game"), &json!(8)).await.unwrap().is_empty());
        assert!(search_metadata(&http, &json!("Game"), &json!(8)).await.unwrap().is_empty());
        assert!(search_metadata(&http, &json!("Game"), &json!(8)).await.is_err());
        assert!(search_metadata(&http, &json!("Game"), &json!(8)).await.is_err());
        let error = search_metadata(&http, &json!("Game"), &json!(8)).await.unwrap_err();
        assert_eq!(error, format!("IGN request failed: 503 {}", "x".repeat(IGN_GRAPHQL_ERROR_MAX_BYTES - 1)));
        assert!(search_metadata(&http, &json!("Game"), &json!(8)).await.is_err());
        assert_eq!(search_metadata(&http, &json!("Game"), &json!(8)).await.unwrap_err(), "IGN GraphQL response is not a JSON object");
        assert!(search_metadata(&http, &json!("Game"), &json!(8)).await.is_err());
        assert_eq!(search_metadata(&http, &json!("Game"), &json!(8)).await.unwrap_err(), "IGN GraphQL error: [{'message': 'bad'}]");
        http.assert_drained();
    }

    #[tokio::test]
    async fn ign_fetch_maps_earliest_release_and_pc_platforms() {
        let http = Http::fixtures(vec![graphql_json(game_reply("game-example", "example-game", "Example Game", "windows-pc"))]);
        let result = fetch_metadata(&http, "https://www.ign.com/games/example-game").await.unwrap().unwrap();
        http.assert_drained();
        assert_eq!(result["release_date"], "2024-10-03");
        assert_eq!(result["platforms"], json!(["windows-pc", "pc"]));
        assert_eq!(result["description"], "Short");
        assert_eq!(result["rating"], 85);
        assert_eq!(result["developers"], json!([{"name": "Studio", "url": "https://www.ign.com/games/producer/studio"}]));
        let empty = game_to_metadata(&json!({}));
        assert_eq!(empty["title"], "");
        assert_eq!(empty["id"], "");
        assert!(fetch_metadata(&Http::fixtures(Vec::new()), "").await.unwrap().is_none());
    }

    #[test]
    fn ign_metadata_mapping_uses_cleaned_description_fallbacks_and_short_text_categories() {
        let fallback = game_to_metadata(&json!({
            "metadata": {"names": {"name": "Game"}, "descriptions": {"short": "<br>", "long": "<div>Fallback</div>"}}
        }));
        assert_eq!(fallback["description"], "Fallback");
        let empty = game_to_metadata(&json!({
            "metadata": {"names": {"name": "Game"}, "descriptions": {"short": "<p></p>", "long": "<div></div>"}}
        }));
        assert_eq!(empty["description"], "");
        let short_only = game_to_metadata(&json!({
            "metadata": {"names": {"name": "Game"}, "descriptions": {"short": "A multiplayer co-op game"}},
            "producers": [{"name": " Studio ", "slug": " studio "}]
        }));
        assert_eq!(short_only["description"], "A multiplayer co-op game");
        assert_eq!(short_only["store_categories"], json!([1, 36, 9, 38]));
        assert_eq!(short_only["developers"], json!([{"name": "Studio", "url": "https://www.ign.com/games/producer/studio"}]));
    }

    #[tokio::test]
    async fn ign_auto_fetch_prefers_searched_pc_candidate_over_console_variant() {
        let pc = game_reply("game-pc", "example-game-pc", "Example Game", "windows-pc");
        let http = Http::fixtures(vec![
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": null}})),
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": null}})),
            graphql_json(search_reply(vec![
                search_node("Example Game [DS]", "example-game-ds", "game-console"),
                search_node("Example Game", "example-game-pc", "game-pc"),
            ])),
            graphql_json(pc),
        ]);
        let result = auto_fetch_metadata(&http, "Example Game").await.unwrap().unwrap();
        http.assert_drained();
        assert_eq!(result["title"], "Example Game");
        assert_eq!(result["platforms"], json!(["windows-pc", "pc"]));
    }

    #[tokio::test]
    async fn ign_auto_fetch_uses_direct_pc_candidate_and_keeps_console_fallback() {
        let mut pc = game_reply("game-pc", "example-game", "Example Game", "windows-pc");
        pc["data"]["objectSelectByTypeAndSlug"]["objectRegions"] = json!([]);
        let http = Http::fixtures(vec![graphql_json(pc)]);
        let result = auto_fetch_metadata(&http, "Example Game").await.unwrap().unwrap();
        http.assert_drained();
        assert_eq!(result["platforms"], json!([]));

        let mut console = game_reply("game-console", "example-game", "Example Game [DS]", "nintendo-ds");
        console["data"]["objectSelectByTypeAndSlug"]["objectRegions"] = json!([
            {"region": "Japan", "releases": [{"date": "2024-01-01", "platformAttributes": [{"slug": "nintendo-ds"}]}]}
        ]);
        let http = Http::fixtures(vec![
            graphql_json(console),
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": null}})),
            graphql_json(search_reply(Vec::new())),
        ]);
        let result = auto_fetch_metadata(&http, "Example Game").await.unwrap().unwrap();
        http.assert_drained();
        assert_eq!(result["title"], "Example Game [DS]");
        assert_eq!(result["platforms"], json!(["nintendo-ds"]));
    }

    #[tokio::test]
    async fn ign_trailer_consumer_verifies_identity_and_returns_sorted_direct_mp4s() {
        let video_id = "11111111-1111-4111-8111-111111111111";
        let listing = format!("<div data-cy=\"content-item\" data-id=\"{video_id}\"><a href=\"/videos/deadpool-official-launch-trailer\" aria-label=\"Deadpool Official Launch Trailer\"><div><a href=\"/games/deadpool\">Deadpool</a></div></a></div>");
        let assets = json!([
            {"url": "https://assets14.ign.com/video/deadpool-720.mp4", "height": 720, "format": "video/mp4"},
            {"url": "https://assets14.ign.com/video/deadpool-1080.mp4", "height": 1080, "format": "mp4"},
        ]);
        let page = video_page("game-deadpool", video_id, "Deadpool Official Launch Trailer - IGN", assets);
        let http = Http::fixtures(vec![
            graphql_json(search_reply(vec![search_node("Deadpool", "deadpool", "game-deadpool")])),
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": verified_game("game-deadpool", "deadpool", "Deadpool")}})),
            Fixture::text("https://www.ign.com/games/deadpool/trailers", &listing),
            Fixture::text("https://www.ign.com/videos/deadpool-official-launch-trailer", &page),
        ]);
        let result = find_trailer(&http, "Deadpool", None).await.unwrap();
        http.assert_drained();
        assert_eq!(result["name"], "Deadpool Official Launch Trailer");
        assert_eq!(result["candidates"][0], json!({"format": "mp4", "url": "https://assets14.ign.com/video/deadpool-1080.mp4", "height": 1080}));
    }

    #[tokio::test]
    async fn ign_trailer_consumer_rejects_untrusted_asset_query_and_mismatched_identity() {
        let video_id = "11111111-1111-4111-8111-111111111111";
        let listing = format!("<div data-cy=\"content-item\" data-id=\"{video_id}\"><a href=\"/videos/deadpool-trailer\" aria-label=\"Deadpool Official Trailer\"></a></div>");
        let long_query = "x".repeat(2049);
        let page = video_page("game-deadpool", video_id, "Deadpool Official Trailer", json!([
            {"url": format!("https://assets14.ign.com/trailer.mp4?{long_query}"), "height": 1080, "format": "mp4"},
            {"url": "https://evil.example/trailer.mp4", "height": 720, "format": "mp4"},
        ]));
        let http = Http::fixtures(vec![
            graphql_json(search_reply(vec![search_node("Deadpool", "deadpool", "game-deadpool")])),
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": verified_game("game-deadpool", "deadpool", "Deadpool")}})),
            Fixture::text("https://www.ign.com/games/deadpool/trailers", &listing),
            Fixture::text("https://www.ign.com/videos/deadpool-trailer", &page),
        ]);
        assert!(find_trailer(&http, "Deadpool", None).await.is_none());
        http.assert_drained();

        let http = Http::fixtures(vec![graphql_json(search_reply(vec![search_node("Deadpool", "deadpool", "game-deadpool")])),
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": verified_game("game-other", "deadpool", "Deadpool")}}))]);
        assert!(find_trailer(&http, "Deadpool", None).await.is_none());
        http.assert_drained();
    }

    #[tokio::test]
    async fn ign_trailer_consumer_skips_unrelated_and_invalid_pages_before_a_valid_trailer() {
        let mut cards = String::new();
        for index in 0..TRAILER_VIDEO_MAX_PAGES {
            cards.push_str(&format!("<div data-cy=\"content-item\" data-id=\"unrelated-{index}\"><a href=\"/videos/unrelated-{index}\" aria-label=\"Publisher sale announcement\"></a></div>"));
        }
        for id in ["video-malformed", "video-mismatch", "video-valid"] {
            cards.push_str(&format!("<div data-cy=\"content-item\" data-id=\"{id}\"><a href=\"/videos/{id}\" aria-label=\"Deadpool Official Trailer\"></a></div>"));
        }
        let assets = json!([{"url": "https://assets14.ign.com/deadpool.mp4", "height": 720, "format": "mp4"}]);
        let http = Http::fixtures(vec![
            graphql_json(search_reply(vec![search_node("Deadpool", "deadpool", "game-deadpool")])),
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": verified_game("game-deadpool", "deadpool", "Deadpool")}})),
            Fixture::text("https://www.ign.com/games/deadpool/trailers", &cards),
            Fixture::text("https://www.ign.com/videos/video-malformed", r#"<script id="__NEXT_DATA__">{broken}</script>"#),
            Fixture::text("https://www.ign.com/videos/video-mismatch", &video_page("game-other", "video-mismatch", "Deadpool Official Trailer", assets.clone())),
            Fixture::text("https://www.ign.com/videos/video-valid", &video_page("game-deadpool", "video-valid", "Deadpool Official Trailer", assets)),
        ]);
        let result = find_trailer(&http, "Deadpool", None).await.unwrap();
        http.assert_drained();
        assert_eq!(result["name"], "Deadpool Official Trailer");
    }

    #[tokio::test]
    async fn ign_trailer_video_page_limit_and_asset_candidate_limit_are_enforced() {
        let game_id = "game-deadpool";
        let mut cards = String::new();
        let mut fixtures = vec![
            graphql_json(search_reply(vec![search_node("Deadpool", "deadpool", game_id)])),
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": verified_game(game_id, "deadpool", "Deadpool")}})),
        ];
        for index in 0..=TRAILER_VIDEO_MAX_PAGES {
            let id = format!("video-{index}");
            cards.push_str(&format!("<div data-cy=\"content-item\" data-id=\"{id}\"><a href=\"/videos/deadpool-trailer-{index}\" aria-label=\"Deadpool Official Trailer\"></a></div>"));
        }
        fixtures.push(Fixture::text("https://www.ign.com/games/deadpool/trailers", &cards));
        for index in 0..TRAILER_VIDEO_MAX_PAGES {
            let id = format!("video-{index}");
            let url = format!("https://www.ign.com/videos/deadpool-trailer-{index}");
            fixtures.push(Fixture::text(&url, &video_page(game_id, &id, "Deadpool Official Trailer", json!([]))));
        }
        let http = Http::fixtures(fixtures);
        assert!(find_trailer(&http, "Deadpool", None).await.is_none());
        http.assert_drained();

        let mut assets = Vec::new();
        for height in 360..370 {
            assets.push(json!({"url": format!("https://assets14.ign.com/{height}.mp4"), "height": height, "format": "mp4"}));
        }
        let filtered = page_assets(&Value::Array(assets));
        assert_eq!(filtered.len(), TRAILER_VIDEO_MAX_ASSETS);
        assert_eq!(filtered[0]["height"], 369);
        let duplicate_url = "https://assets14.ign.com/duplicate.mp4";
        let duplicate = page_assets(&json!([
            {"url": duplicate_url, "height": 359, "format": "mp4"},
            {"url": duplicate_url, "height": 720, "format": "mp4"}
        ]));
        assert_eq!(duplicate.len(), 1);
        assert_eq!(duplicate[0]["height"], 720);
        let boundaries = page_assets(&json!([
            {"url": "https://assets14.ign.com/low.mp4", "height": 360, "format": "mp4"},
            {"url": "https://assets14.ign.com/high.mp4", "height": 4320, "format": "mp4"},
            {"url": "https://assets14.ign.com/too-low.mp4", "height": 359, "format": "mp4"},
            {"url": "https://assets14.ign.com/too-high.mp4", "height": 4321, "format": "mp4"},
            {"url": "https://assets14.ign.com/bool.mp4", "height": true, "format": "mp4"},
            {"url": "https://assets14.ign.com/float.mp4", "height": 720.0, "format": "mp4"}
        ]));
        assert_eq!(boundaries.iter().map(|asset| asset["height"].as_i64().unwrap()).collect::<Vec<_>>(), vec![4320, 360]);
    }
    #[tokio::test]
    async fn ign_trailer_lookup_uses_saved_game_identity_after_shortcut_rename() {
        let video_id = "33333333-3333-4333-8333-333333333333";
        let listing = format!("<div data-cy=\"content-item\" data-id=\"{video_id}\"><a href=\"/videos/bloodborne-story-trailer\" aria-label=\"Bloodborne Story Trailer\"></a></div>");
        let page = video_page("game-bloodborne", video_id, "Bloodborne Story Trailer", json!([
            {"url": "https://assets14.ign.com/bloodborne.mp4", "height": 720, "format": "mp4"}
        ]));
        let http = Http::fixtures(vec![
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": verified_game("game-bloodborne", "bloodborne", "Bloodborne")}})),
            Fixture::text("https://www.ign.com/games/bloodborne/trailers", &listing),
            Fixture::text("https://www.ign.com/videos/bloodborne-story-trailer", &page),
        ]);
        let result = find_trailer(&http, "A custom shortcut name", Some("https://www.ign.com/games/bloodborne")).await.unwrap();
        http.assert_drained();
        assert_eq!(result["name"], "Bloodborne Story Trailer");
    }

    #[tokio::test]
    async fn ign_trailer_network_errors_and_empty_listing_return_null() {
        let http = Http::fixtures(vec![Fixture {
            method: Method::POST,
            url: IGN_GRAPHQL_URL.to_owned(),
            result: Err("connection failed".into()),
        }]);
        assert!(find_trailer(&http, "Deadpool", None).await.is_none());
        http.assert_drained();

        let listing_url = "https://www.ign.com/games/deadpool/trailers";
        let identity = || vec![
            graphql_json(search_reply(vec![search_node("Deadpool", "deadpool", "game-deadpool")])),
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": verified_game("game-deadpool", "deadpool", "Deadpool")}})),
        ];
        let mut fixtures = identity();
        fixtures.push(Fixture::text(listing_url, ""));
        let http = Http::fixtures(fixtures);
        assert!(find_trailer(&http, "Deadpool", None).await.is_none());
        http.assert_drained();

        let mut fixtures = identity();
        fixtures.push(Fixture::failure(listing_url));
        let http = Http::fixtures(fixtures);
        assert!(find_trailer(&http, "Deadpool", None).await.is_none());
        http.assert_drained();
    }

    #[tokio::test]
    async fn ign_trailer_lookup_treats_empty_saved_url_as_missing() {
        let http = Http::fixtures(vec![graphql_json(search_reply(Vec::new()))]);
        assert!(find_trailer(&http, "Deadpool", Some("")).await.is_none());
        http.assert_drained();
    }

    #[tokio::test]
    async fn ign_trailer_consumer_enforces_html_body_bounds_and_final_origin() {
        let video_id = "11111111-1111-4111-8111-111111111111";
        let listing_url = "https://www.ign.com/games/deadpool/trailers";
        let video_url = "https://www.ign.com/videos/deadpool-trailer";
        let card = format!("<div data-cy=\"content-item\" data-id=\"{video_id}\"><a href=\"/videos/deadpool-trailer\" aria-label=\"Deadpool Official Trailer\"></a></div>");
        let page = video_page("game-deadpool", video_id, "Deadpool Official Trailer", json!([
            {"url": "https://assets14.ign.com/deadpool.mp4", "height": 720, "format": "mp4"}
        ]));
        let graphql_fixtures = || vec![
            graphql_json(search_reply(vec![search_node("Deadpool", "deadpool", "game-deadpool")])),
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": verified_game("game-deadpool", "deadpool", "Deadpool")}})),
        ];

        let mut exact_listing = card.as_bytes().to_vec();
        exact_listing.resize(TRAILER_HTML_MAX_BYTES, b' ');
        let exact_listing = String::from_utf8(exact_listing).unwrap();
        let mut exact_page = page.as_bytes().to_vec();
        exact_page.resize(TRAILER_HTML_MAX_BYTES, b' ');
        let exact_page = String::from_utf8(exact_page).unwrap();
        let mut fixtures = graphql_fixtures();
        fixtures.push(Fixture::text(listing_url, &exact_listing));
        fixtures.push(Fixture::text(video_url, &exact_page));
        let http = Http::fixtures(fixtures);
        assert!(find_trailer(&http, "Deadpool", None).await.is_some());
        http.assert_drained();

        let mut oversized_listing = card.as_bytes().to_vec();
        oversized_listing.resize(TRAILER_HTML_MAX_BYTES + 1, b' ');
        let oversized_listing = String::from_utf8(oversized_listing).unwrap();
        let mut fixtures = graphql_fixtures();
        fixtures.push(Fixture::text(listing_url, &oversized_listing));
        let http = Http::fixtures(fixtures);
        assert!(find_trailer(&http, "Deadpool", None).await.is_none());
        http.assert_drained();

        let mut oversized_page = page.as_bytes().to_vec();
        oversized_page.resize(TRAILER_HTML_MAX_BYTES + 1, b' ');
        let oversized_page = String::from_utf8(oversized_page).unwrap();
        let mut fixtures = graphql_fixtures();
        fixtures.push(Fixture::text(listing_url, &card));
        fixtures.push(Fixture::text(video_url, &oversized_page));
        let http = Http::fixtures(fixtures);
        assert!(find_trailer(&http, "Deadpool", None).await.is_none());
        http.assert_drained();

        let mut fixtures = graphql_fixtures();
        fixtures.push(Fixture {
            method: Method::GET,
            url: listing_url.to_owned(),
            result: Ok(Response {
                status: 200,
                headers: HeaderMap::new(),
                body: card.into_bytes(),
                url: "https://evil.example/games/deadpool/trailers".into(),
            }),
        });
        let http = Http::fixtures(fixtures);
        assert!(find_trailer(&http, "Deadpool", None).await.is_none());
        http.assert_drained();
    }
    #[tokio::test]
    async fn ign_trailer_text_ignores_invalid_utf8_before_trust_parsing() {
        let video_id = "11111111-1111-4111-8111-111111111111";
        let listing_url = "https://www.ign.com/games/deadpool/trailers";
        let video_url = "https://www.ign.com/videos/deadpool-trailer";
        let listing = format!("<div data-cy=\"content-item\" data-id=\"{video_id}\"><a href=\"/videos/deadpool-trailer\" aria-label=\"Deadpool Official Trailer\"></a></div>");
        let invalid_at = listing.rfind("Deadpool").unwrap() + 4;
        let mut listing_bytes = listing.into_bytes();
        listing_bytes.insert(invalid_at, 0xff);
        let page = video_page("game-deadpool", video_id, "Deadpool Official Trailer", json!([
            {"url": "https://assets14.ign.com/deadpool.mp4", "height": 720, "format": "mp4"}
        ]));
        let http = Http::fixtures(vec![
            graphql_json(json!({"data": {"objectSelectByTypeAndSlug": verified_game("game-deadpool", "deadpool", "Deadpool")}})),
            Fixture {
                method: Method::GET,
                url: listing_url.to_owned(),
                result: Ok(Response {
                    status: 200,
                    headers: HeaderMap::new(),
                    body: listing_bytes,
                    url: listing_url.to_owned(),
                }),
            },
            Fixture::text(video_url, &page),
        ]);
        assert!(find_trailer(&http, "A renamed shortcut", Some("https://www.ign.com/games/deadpool")).await.is_some());
        http.assert_drained();
    }


    #[test]
    fn ign_trailer_html_parsers_keep_nested_card_links_and_bound_listing_entries() {
        let nested = "<div data-cy=\"content-item\" data-id=\"video-id\"><a href=\"/videos/deadpool-trailer\" aria-label=\"Deadpool Official Trailer\"><div><a href=\"/games/deadpool\">Deadpool</a></div></a></div>";
        let items = parse_trailer_listing(nested);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["url"], "https://www.ign.com/videos/deadpool-trailer");
        let page = next_data_page("<script id=\"__NEXT_DATA__\">{\"props\":{\"pageProps\":{\"page\":{\"objectId\":\"game-id\"}}}}</script>").unwrap();
        assert_eq!(page, json!({"objectId": "game-id"}));
        assert_eq!(canonical_video_page_url("/videos/deadpool-trailer"), "https://www.ign.com/videos/deadpool-trailer");
        assert!(canonical_video_page_url("https://evil.example/videos/deadpool-trailer").is_empty());
        let mut exact_data = r#"{"props":{"pageProps":{"page":{"objectId":"game-id"}}}}"#.to_owned();
        exact_data.push_str(&" ".repeat(TRAILER_HTML_MAX_BYTES - exact_data.len()));
        let exact_script = format!(r#"<script id="__NEXT_DATA__">{exact_data}</script>"#);
        assert!(next_data_page(&exact_script).is_some());
        exact_data.push(' ');
        let oversized_script = format!(r#"<script id="__NEXT_DATA__">{exact_data}</script>"#);
        assert!(next_data_page(&oversized_script).is_none());
        let external = "<div data-cy=\"content-item\" data-id=\"video-id\"><a href=\"https://evil.example/videos/trailer\" aria-label=\"Deadpool Official Trailer\"></a></div>";
        assert!(parse_trailer_listing(external).is_empty());
        let cards = (0..TRAILER_LISTING_MAX_ITEMS + 1).map(|i| format!("<div data-cy=\"content-item\" data-id=\"video-{i}\"><a href=\"/videos/video-{i}\" aria-label=\"Game Trailer\"></a></div>")).collect::<String>();
        assert_eq!(parse_trailer_listing(&cards).len(), TRAILER_LISTING_MAX_ITEMS);
    }

    #[test]
    fn ign_canonical_page_and_asset_validators_reject_untrusted_origins_and_limits() {
        for url in [
            "http://www.ign.com/games/deadpool",
            "https://www.ign.com.evil.example/games/deadpool",
            "https://user@www.ign.com/games/deadpool",
            "https://www.ign.com:444/games/deadpool",
        ] {
            assert!(!is_ign_page_url(url));
            assert!(canonical_game_slug(Some(url)).is_empty());
        }
        assert_eq!(canonical_game_slug(Some("https://www.ign.com/games/deadpool")), "deadpool");
        assert!(canonical_game_slug(Some("https://www.ign.com/games/deadpool/../bloodborne")).is_empty());
        assert!(canonical_game_slug(Some("https://www.ign.com/games/deadpool?redirect=elsewhere")).is_empty());
        assert_eq!(canonical_mp4_url("https://assets14.ign.com/video/a.mp4?x=1").as_deref(), Some("https://assets14.ign.com/video/a.mp4?x=1"));
        assert_eq!(canonical_mp4_url(&format!("https://assets14.ign.com/a.mp4?{}", "x".repeat(2048))).is_some(), true);
        assert_eq!(canonical_mp4_url(&format!("https://assets14.ign.com/a.mp4?{}", "x".repeat(2049))), None);
        assert_eq!(canonical_mp4_url("https://user@assets14.ign.com/a.mp4"), None);
        assert_eq!(canonical_mp4_url("https://assets14.ign.com:444/a.mp4"), None);
    }

    #[test]
    fn ign_slug_candidates_and_title_scores_preserve_known_provider_rules() {
        assert_eq!(slug_candidates("James Bond Blood Stone"), vec!["james-bond-007-blood-stone", "james-bond-blood-stone"]);
        assert_eq!(slug_candidates("The Sample Game of the Year"), vec!["sample"]);
        assert_eq!(slug_candidates("Released as The Old Game"), vec!["released-as-old-game", "released-as-old"]);
        assert!(slug_candidates("The Game of the Year Edition").is_empty());
        assert!(trailer_title_score("Sonic Unleashed", "Sonic Unleashed Xbox 360 Trailer - New Sonic").is_some());
        assert!(trailer_title_score("Hades", "Hades - v1.0 Launch Trailer").is_some());
        assert!(trailer_title_score("Deadpool", "Deadpool Pinball Trailer").is_none());
        assert!(trailer_title_score("Metroid Prime Remastered", "Metroid Prime Remastered Reveal Trailer").is_some());
        assert!(trailer_title_score("Metroid Prime", "Metroid Prime 4 Reveal Trailer").is_none());
    }
}
