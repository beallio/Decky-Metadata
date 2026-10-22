use crate::{http::Http, logging, matching, metadata};
use regex::Regex;
use reqwest::Url;
use serde_json::{Value, json};
use std::{collections::HashSet, sync::LazyLock, time::Duration};

pub const MAX_PAGE: i64 = 100;
pub const PAGE_SIZE: usize = 20;
pub const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
const MAX_CARD_CHARS: usize = 50_000;

static RX_CARD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)class\s*=\s*["'][^"']*\bapphub_Card\b[^"']*["']"#)
        .expect("fixed Steam Community card regex")
});
static RX_IMAGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)https://images\.steamusercontent\.com/ugc/[^"'\s<>]+"#)
        .expect("fixed Steam Community image regex")
});
static RX_DATA_MODAL_URL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)data-modal-content-url\s*=\s*["']([^"']+)["']"#)
        .expect("fixed Steam Community modal URL regex")
});
static RX_SHARED_FILE_HREF: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)href\s*=\s*["']([^"']*sharedfiles/filedetails/\?id=\d+[^"']*)["']"#)
        .expect("fixed Steam Community shared-file URL regex")
});
static RX_AUTHOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)apphub_CardContentAuthorName[^>]*>\s*<a[^>]*>([^<]+)</a>"#)
        .expect("fixed Steam Community author regex")
});
static RX_CAPTION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)apphub_(?:CardContentTitle|CardTextContent)[^>]*>(.*?)</(?:div|a|span)>"#)
        .expect("fixed Steam Community caption regex")
});

pub fn clamp_page(value: &Value) -> i64 {
    let parsed = match value {
        Value::Bool(value) => Some(i64::from(*value)),
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                Some(value)
            } else if value.as_u64().is_some_and(|value| value > MAX_PAGE as u64) {
                Some(MAX_PAGE)
            } else {
                value.as_f64().filter(|value| value.is_finite()).map(f64::trunc).map(|value| {
                    if value > MAX_PAGE as f64 { MAX_PAGE }
                    else if value < 1.0 { 1 }
                    else { value as i64 }
                })
            }
        }
        Value::String(value) => parse_integer_string(value),
        _ => None,
    };
    parsed.unwrap_or(1).clamp(1, MAX_PAGE)
}

fn parse_integer_string(value: &str) -> Option<i64> {
    let value = value.trim();
    let (negative, digits) = match value.as_bytes().first() {
        Some(b'-') => (true, &value[1..]),
        Some(b'+') => (false, &value[1..]),
        _ => (false, value),
    };
    let bytes = digits.as_bytes();
    if bytes.is_empty()
        || !bytes.iter().enumerate().all(|(index, byte)| {
            byte.is_ascii_digit()
                || (*byte == b'_' && index > 0 && index + 1 < bytes.len()
                    && bytes[index - 1].is_ascii_digit() && bytes[index + 1].is_ascii_digit())
        })
    {
        return None;
    }
    let digits: String = digits.chars().filter(|character| *character != '_').collect();
    let significant = digits.trim_start_matches('0');
    if significant.is_empty() {
        return Some(0);
    }
    if negative {
        return Some(0);
    }
    if significant.len() > 3 || significant.parse::<u16>().is_ok_and(|number| number > MAX_PAGE as u16) {
        return Some(MAX_PAGE);
    }
    significant.parse::<i64>().ok()
}

pub fn community_url(appid: i64, page: i64) -> String {
    if appid <= 0 {
        return String::new();
    }
    let page = page.clamp(1, MAX_PAGE).to_string();
    let mut url = Url::parse(&format!("https://steamcommunity.com/app/{appid}/homecontent/"))
        .expect("fixed Steam Community URL");
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("userreviewsoffset", "0")
            .append_pair("p", &page)
            .append_pair("workshopitemspage", &page)
            .append_pair("readytouseitemspage", &page)
            .append_pair("mtxitemspage", &page)
            .append_pair("itemspage", &page)
            .append_pair("screenshotspage", &page)
            .append_pair("videospage", &page)
            .append_pair("artpage", &page)
            .append_pair("allguidepage", &page)
            .append_pair("webguidepage", &page)
            .append_pair("integratedguidepage", &page)
            .append_pair("discussionspage", &page)
            .append_pair("numperpage", "20")
            .append_pair("browsefilter", "trend")
            .append_pair("appHubSubSection", "1")
            .append_pair("l", "english")
            .append_pair("filterLanguage", "default")
            .append_pair("searchText", "")
            .append_pair("forceanon", "1");
    }
    url.to_string()
}

fn raw_url_prefix_path(value: &str) -> Option<(&str, &str)> {
    let scheme_end = value.find("://")?;
    let remainder = &value[scheme_end + 3..];
    let authority_end = remainder
        .find(|character| matches!(character, '/' | '?' | '#'))
        .unwrap_or(remainder.len());
    if authority_end == 0 { return None; }
    let suffix = &remainder[authority_end..];
    let path = if suffix.starts_with('/') {
        &suffix[..suffix.find(|character| matches!(character, '?' | '#')).unwrap_or(suffix.len())]
    } else {
        ""
    };
    Some((&value[..scheme_end + 3 + authority_end], path))
}

pub fn steam_image_url(value: &str) -> String {
    let decoded = matching::decode_html_entities(value.trim());
    if !decoded.to_ascii_lowercase().starts_with("https://") {
        return String::new();
    }
    let normalized = matching::https_url(&decoded);
    let Ok(mut parsed) = Url::parse(&normalized) else { return String::new() };
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("images.steamusercontent.com")
        || !raw_url_prefix_path(&normalized).is_some_and(|(_, path)| path.starts_with("/ugc/"))
    {
        return String::new();
    }
    let mut pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    let mut has_width = false;
    for (key, value) in &mut pairs {
        if key == "imw" {
            *value = "512".to_owned();
            has_width = true;
        }
    }
    if !has_width {
        pairs.push(("imw".to_owned(), "512".to_owned()));
    }
    parsed.set_query(None);
    {
        let mut query = parsed.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(&key, &value);
        }
    }
    let serialized = parsed.to_string();
    let suffix = serialized.find(|character| matches!(character, '?' | '#')).unwrap_or(serialized.len());
    let (prefix, path) = raw_url_prefix_path(&normalized).expect("parsed URL has an authority");
    let authority = prefix.split_once("://").expect("parsed URL has a scheme").1;
    format!("https://{authority}{path}{}", &serialized[suffix..])
}

pub fn sharedfile_id(value: &str) -> String {
    let Ok(parsed) = Url::parse(value) else { return String::new() };
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("steamcommunity.com")
        || !raw_url_prefix_path(value).is_some_and(|(_, path)| path.trim_end_matches('/') == "/sharedfiles/filedetails")
    {
        return String::new();
    }
    parsed
        .query_pairs()
        .find(|(key, value)| key == "id" && !value.is_empty())
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.is_empty() && value.chars().all(|character| character.is_ascii_digit()))
        .unwrap_or_default()
}

pub fn sharedfile_url(value: &str) -> String {
    let decoded = matching::decode_html_entities(value.trim());
    if decoded.is_empty() {
        return String::new();
    }
    let Ok(base) = Url::parse("https://steamcommunity.com/") else { return String::new() };
    let Ok(joined) = base.join(decoded.as_ref()) else { return String::new() };
    let normalized = matching::https_url(joined.as_str());
    if sharedfile_id(&normalized).is_empty() {
        String::new()
    } else {
        normalized
    }
}

fn truncate_chars(value: &str, limit: usize) -> &str {
    value.char_indices().nth(limit).map_or(value, |(index, _)| &value[..index])
}

pub fn parse_cards(html_text: &str, limit: usize) -> Vec<Value> {
    let cap = if limit == 0 { PAGE_SIZE } else { limit.clamp(1, PAGE_SIZE) };
    let mut cards = RX_CARD.find_iter(html_text).peekable();
    let mut seen = HashSet::new();
    let mut rows = Vec::new();
    while let Some(card) = cards.next() {
        let end = cards.peek().map_or(html_text.len(), |next| next.start());
        let block = truncate_chars(&html_text[card.start()..end], MAX_CARD_CHARS);
        let image_url = RX_IMAGE
            .find_iter(block)
            .map(|image| image.as_str().trim_end_matches(|character| matches!(character, ')' | ',' | '.' | ';')))
            .map(steam_image_url)
            .find(|image| !image.is_empty());
        let Some(image_url) = image_url else { continue };
        if seen.contains(&image_url) { continue; }
        let link = RX_DATA_MODAL_URL
            .captures_iter(block)
            .filter_map(|capture| capture.get(1))
            .map(|link| sharedfile_url(link.as_str()))
            .find(|link| !link.is_empty())
            .or_else(|| {
                RX_SHARED_FILE_HREF
                    .captures_iter(block)
                    .filter_map(|capture| capture.get(1))
                    .map(|link| sharedfile_url(link.as_str()))
                    .find(|link| !link.is_empty())
            });
        let Some(link) = link else { continue };
        let author = RX_AUTHOR
            .captures(block)
            .and_then(|capture| capture.get(1))
            .map(|text| matching::decode_html_entities(text.as_str()))
            .map(|text| matching::clean_html_text(&text))
            .unwrap_or_default();
        let caption = RX_CAPTION
            .captures(block)
            .and_then(|capture| capture.get(1))
            .map(|text| matching::decode_html_entities(text.as_str()))
            .map(|text| matching::clean_html_text(&text))
            .unwrap_or_default();
        let id = sharedfile_id(&link);
        seen.insert(image_url.clone());
        rows.push(json!({
            "id": id,
            "url": image_url,
            "caption": caption,
            "width": 0,
            "height": 0,
            "author": author,
            "link": link,
        }));
        if rows.len() >= cap { break; }
    }
    rows
}

pub fn steam_cards_to_fallback_items(cards: &Value) -> Vec<Value> {
    let mut items = Vec::new();
    for card in cards.as_array().into_iter().flatten().filter(|card| card.is_object()) {
        let image_url = steam_image_url(&metadata::text(&card["url"]));
        let link = sharedfile_url(&metadata::text(&card["link"]));
        let id = sharedfile_id(&link);
        if image_url.is_empty() || id.is_empty() { continue; }
        let caption = matching::clean_html_text(&metadata::text(&card["caption"]));
        items.push(json!({
            "id": id,
            "title": caption,
            "description": caption,
            "image_url": image_url,
            "link": link,
            "width": 0,
            "height": 0,
            "author": matching::clean_html_text(&metadata::text(&card["author"])),
        }));
        if items.len() >= PAGE_SIZE { break; }
    }
    items
}

fn valid_https_url(value: &str) -> Option<String> {
    let normalized = matching::https_url(value);
    let parsed = Url::parse(&normalized).ok()?;
    (parsed.scheme() == "https" && parsed.host_str().is_some()).then_some(normalized)
}

fn dimension(value: &Value) -> Value {
    let value = matching::as_number(value, 0.0);
    if !value.is_finite() { return json!(0); }
    let value = value.trunc().max(0.0);
    if value < i64::MAX as f64 {
        json!(value as i64)
    } else {
        serde_json::from_str(&format!("{value:.0}")).unwrap_or_else(|_| json!(i64::MAX))
    }
}

pub fn metadata_screenshots_to_fallback_items(
    screenshots: &Value,
    page: i64,
    source_url: &Value,
) -> Vec<Value> {
    let page = page.clamp(1, MAX_PAGE) as usize;
    let start = (page - 1) * PAGE_SIZE;
    let stop = start + PAGE_SIZE;
    let provider_url = valid_https_url(&metadata::text(source_url)).unwrap_or_default();
    let mut items = Vec::new();
    let mut accepted = 0;
    for (offset, screenshot) in screenshots.as_array().into_iter().flatten().enumerate() {
        if !screenshot.is_object() { continue; }
        let Some(image_url) = valid_https_url(&metadata::text(&screenshot["url"])) else { continue };
        let current = accepted;
        accepted += 1;
        if current < start { continue; }
        if current >= stop { break; }
        let caption = matching::clean_html_text(&metadata::text(&screenshot["caption"]));
        let id = if matching::py_truthy(&screenshot["id"]) {
            metadata::text(&screenshot["id"])
        } else {
            format!("metadata-{offset}")
        };
        items.push(json!({
            "id": id,
            "title": caption,
            "description": caption,
            "image_url": image_url,
            "link": if provider_url.is_empty() { image_url } else { provider_url.clone() },
            "width": dimension(&screenshot["width"]),
            "height": dimension(&screenshot["height"]),
            "author": "",
        }));
    }
    items
}

pub async fn fetch_steam_fallback_items(
    http: &Http,
    appid: i64,
    page: i64,
) -> Result<Vec<Value>, String> {
    let page = page.clamp(1, MAX_PAGE);
    let url = community_url(appid, page);
    if url.is_empty() { return Ok(Vec::new()); }
    let text = http
        .text(&url, Duration::from_secs(15), MAX_RESPONSE_BYTES)
        .await?;
    if text.len() > MAX_RESPONSE_BYTES {
        return Err("HTTP response exceeds bounded read limit".into());
    }
    let cards = Value::Array(parse_cards(&text, PAGE_SIZE));
    Ok(steam_cards_to_fallback_items(&cards))
}

fn log_selection(source: &str, steam_appid: i64, page: i64, count: usize) {
    logging::event(
        "community",
        "fallback selected",
        json!({"source": source, "steam_appid": steam_appid, "page": page, "count": count}),
        log::Level::Debug,
    );
}

pub async fn fallback_page(http: &Http, record: Option<&Value>, page: &Value) -> Value {
    let page = clamp_page(page);
    let Some(record) = record.filter(|record| record.is_object()) else {
        log_selection("none", 0, page, 0);
        return json!({"source": "none", "page": page, "items": []});
    };
    let steam_appid = matching::safe_int(&record["steam_appid"]).filter(|appid| *appid > 0);
    if let Some(steam_appid) = steam_appid {
        match fetch_steam_fallback_items(http, steam_appid, page).await {
            Ok(items) if !items.is_empty() => {
                log_selection("steam-scrape", steam_appid, page, items.len());
                return json!({"source": "steam-scrape", "page": page, "items": items});
            }
            Ok(_) => {}
            Err(error) => logging::event(
                "community",
                "scraper fallback failed",
                json!({"steam_appid": steam_appid, "page": page, "error": error}),
                log::Level::Debug,
            ),
        }
    }
    let mut items = metadata_screenshots_to_fallback_items(
        &record["screenshots"],
        page,
        &record["source_url"],
    );
    let source = if items.is_empty() { "none" } else { "metadata" };
    if !items.is_empty() {
        let author = {
            let author = metadata::text(&record["source"]);
            if author.trim().is_empty() { "Metadata".to_owned() } else { author.trim().to_owned() }
        };
        for item in &mut items { item["author"] = Value::String(author.clone()); }
    }
    log_selection(source, steam_appid.unwrap_or(0), page, items.len());
    json!({"source": source, "page": page, "items": items})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::Fixture;

    const COMMUNITY_CARD_FIXTURE: &str = r#"
<div class="apphub_Card" data-modal-content-url="https://steamcommunity.com/sharedfiles/filedetails/?id=111">
  <img src="https://images.steamusercontent.com/ugc/abc123?imw=128&amp;imh=72" />
  <div class="apphub_CardContentTitle">A &amp; B</div>
  <div class="apphub_CardContentAuthorName"><a>Player &amp; One</a></div>
</div>
"#;

    #[test]
    fn community_parser_keeps_safe_unique_cards_and_decodes_entities() {
        let rows = parse_cards(
            &format!("{COMMUNITY_CARD_FIXTURE}{COMMUNITY_CARD_FIXTURE}<div class=\"apphub_Card\"><img src=\"https://evil.example/ugc/no.jpg\"></div>"),
            PAGE_SIZE,
        );
        assert_eq!(rows, vec![json!({
            "id":"111",
            "url":"https://images.steamusercontent.com/ugc/abc123?imw=512&imh=72",
            "caption":"A & B",
            "width":0,
            "height":0,
            "author":"Player & One",
            "link":"https://steamcommunity.com/sharedfiles/filedetails/?id=111",
        })]);
    }

    #[test]
    fn community_parser_rejects_malformed_links_and_caps_results() {
        let unsafe_card = COMMUNITY_CARD_FIXTURE.replace(
            "steamcommunity.com/sharedfiles",
            "evil.example/sharedfiles",
        );
        assert!(parse_cards(&unsafe_card, PAGE_SIZE).is_empty());
        let many = (0..30)
            .map(|index| COMMUNITY_CARD_FIXTURE.replace("111", &index.to_string()).replace("abc123", &format!("abc{index}")))
            .collect::<String>();
        assert_eq!(parse_cards(&many, 99).len(), PAGE_SIZE);
    }

    #[test]
    fn community_card_limit_is_fifty_thousand_characters() {
        let card = format!(
            "<div class=\"apphub_Card\">{}<img src=\"https://images.steamusercontent.com/ugc/too-late\">{}</div>",
            "x".repeat(MAX_CARD_CHARS),
            "<a href=\"https://steamcommunity.com/sharedfiles/filedetails/?id=5\"></a>",
        );
        assert!(parse_cards(&card, PAGE_SIZE).is_empty());
    }

    #[tokio::test]
    async fn community_page_clamps_and_fetches_with_the_bounded_contract() {
        let url = community_url(55150, 100);
        let http = Http::fixtures(vec![Fixture::text(url.clone(), COMMUNITY_CARD_FIXTURE)]);
        let items = fetch_steam_fallback_items(&http, 55150, 999).await.unwrap();
        assert_eq!(items[0]["image_url"], "https://images.steamusercontent.com/ugc/abc123?imw=512&imh=72");
        assert_eq!(items[0]["link"], "https://steamcommunity.com/sharedfiles/filedetails/?id=111");
        assert!(url.contains("p=100"));
        assert!(community_url(0, 1).is_empty());
        assert_eq!(clamp_page(&json!(0)), 1);
        assert_eq!(clamp_page(&json!(999)), 100);
        assert_eq!(clamp_page(&json!("not a page")), 1);
        http.assert_drained();
    }

    #[tokio::test]
    async fn community_fetch_rejects_responses_over_four_mib() {
        let url = community_url(55150, 1);
        let body = "x".repeat(MAX_RESPONSE_BYTES + 1);
        let http = Http::fixtures(vec![Fixture::text(url, &body)]);
        assert!(fetch_steam_fallback_items(&http, 55150, 1).await.unwrap_err().contains("bounded"));
        http.assert_drained();
    }

    #[test]
    fn community_metadata_accepts_ign_images_and_uses_safe_source_links() {
        let image = "https://assets2.ignimgs.com/2009/05/04/x-men-origins-wolverine-shot.jpg";
        let source = json!("https://www.ign.com/games/x-men-origins-wolverine");
        let screenshots = json!([{"id":"ign-1","url":image,"caption":"","width":640,"height":340}]);
        assert_eq!(metadata_screenshots_to_fallback_items(&screenshots, 1, &source), vec![json!({
            "id":"ign-1","title":"","description":"","image_url":image,
            "width":640,"height":340,"author":"","link":source,
        })]);
        let steam_card = json!([{"url":image,"link":"https://steamcommunity.com/sharedfiles/filedetails/?id=1"}]);
        assert!(steam_cards_to_fallback_items(&steam_card).is_empty());
        let unsafe_source = json!("javascript:alert(1)");
        assert_eq!(metadata_screenshots_to_fallback_items(&screenshots, 1, &unsafe_source)[0]["link"], image);
    }

    #[test]
    fn community_metadata_pages_do_not_repeat_or_include_unsafe_images() {
        let mut screenshots: Vec<Value> = (0..25)
            .map(|index| json!({"id":index.to_string(),"url":format!("https://cdn.example/{index}.jpg")}))
            .collect();
        screenshots.insert(20, json!({"id":"bad","url":"javascript:alert(1)"}));
        screenshots.insert(20, json!({"id":"no-host","url":"https://"}));
        let screenshots = Value::Array(screenshots);
        assert_eq!(metadata_screenshots_to_fallback_items(&screenshots, 1, &Value::Null).len(), PAGE_SIZE);
        assert_eq!(metadata_screenshots_to_fallback_items(&screenshots, 2, &Value::Null)
            .iter().map(|item| item["id"].as_str().unwrap()).collect::<Vec<_>>(), vec!["20","21","22","23","24"]);
        let default_id = metadata_screenshots_to_fallback_items(
            &json!([null, {"url":"https://cdn.example/default-id.jpg"}]),
            1,
            &Value::Null,
        );
        assert_eq!(default_id[0]["id"], "metadata-1");
    }

    #[tokio::test]
    async fn community_fallback_prefers_scrape_then_metadata_and_none() {
        let scraped_http = Http::fixtures(vec![Fixture::text(community_url(55150, 1), COMMUNITY_CARD_FIXTURE)]);
        let scraped = fallback_page(&scraped_http, Some(&json!({"steam_appid":55150})), &json!(1)).await;
        assert_eq!(scraped["source"], "steam-scrape");
        assert_eq!(scraped["items"][0]["author"], "Player & One");
        scraped_http.assert_drained();

        let metadata_record = json!({
            "steam_appid":55150,
            "source":"IGN",
            "source_url":"https://www.ign.com/games/example",
            "screenshots":[{"id":"persisted-shot","url":"https://assets1.ignimgs.com/a.jpg","width":640,"height":340}],
        });
        let failed_http = Http::fixtures(vec![Fixture::failure(community_url(55150, 1))]);
        let metadata_page = fallback_page(&failed_http, Some(&metadata_record), &json!(1)).await;
        assert_eq!(metadata_page["source"], "metadata");
        assert_eq!(metadata_page["page"], 1);
        assert_eq!(metadata_page["items"][0]["id"], "persisted-shot");
        assert_eq!(metadata_page["items"][0]["author"], "IGN");
        assert_eq!(metadata_page["items"][0]["link"], "https://www.ign.com/games/example");
        assert!(metadata_page["items"][0].get("youtube_id").is_none());
        failed_http.assert_drained();
        let empty_http = Http::fixtures(vec![Fixture::text(community_url(55150, 1), "")]);
        let empty_page = fallback_page(&empty_http, Some(&metadata_record), &json!(1)).await;
        assert_eq!(empty_page["source"], "metadata");
        empty_http.assert_drained();


        let none_page = fallback_page(&Http::fixtures(vec![]), None, &json!(1)).await;
        assert_eq!(none_page, json!({"source":"none","page":1,"items":[]}));
    }

    #[tokio::test]
    async fn community_fallback_prioritizes_nonempty_steam_scrape() {
        let http = Http::fixtures(vec![Fixture::text(community_url(55150, 1), COMMUNITY_CARD_FIXTURE)]);
        let page = fallback_page(&http, Some(&json!({
            "steam_appid":55150,
            "screenshots":[{"id":"persisted","url":"https://cdn.example/a.jpg"}],
        })), &json!(1)).await;
        assert_eq!(page["source"], "steam-scrape");
        assert_eq!(page["items"].as_array().unwrap().len(), 1);
        http.assert_drained();
    }

    #[test]
    fn community_metadata_and_scraper_url_validators_keep_distinct_hosts() {
        assert!(steam_image_url("https://images.steamusercontent.com.evil/ugc/x").is_empty());
        assert!(steam_image_url("https://images.steamusercontent.com/not-ugc/x").is_empty());
        assert!(sharedfile_url("https://evil.example/sharedfiles/filedetails/?id=1").is_empty());
        assert_eq!(
            steam_image_url("https://images.steamusercontent.com/ugc/../shot.jpg"),
            "https://images.steamusercontent.com/ugc/../shot.jpg?imw=512",
        );
        assert!(sharedfile_id("https://steamcommunity.com/sharedfiles/filedetails/../filedetails/?id=1").is_empty());
        assert_eq!(sharedfile_url("/sharedfiles/filedetails/?id=123"), "https://steamcommunity.com/sharedfiles/filedetails/?id=123");
    }
}
