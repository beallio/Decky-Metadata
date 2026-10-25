use crate::matching::{
    self, as_number, casefold, clean_game_title, clean_html_text, https_url,
    normalize_description_text, py_string, py_truthy, safe_int,
};
use serde_json::{Map, Value, json};

pub fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

/// Root map of app IDs whose metadata the user removed (issue #3). Automatic matching — the
/// page-view IGN fetch, the passive news refresh and the missing-metadata scan — skips them
/// until the user picks metadata again or clears the cache.
pub const REMOVED: &str = "removed_metadata";

pub fn removed_by_user(data: &Value, key: &str) -> bool {
    data[REMOVED].get(key).is_some()
}

pub async fn remove(state: &crate::state::AppState, app_id: &Value) -> Result<Value, String> {
    let key = py_string(app_id);
    state
        .change(|transaction| {
            transaction.remove(&["metadata", &key])?;
            transaction.set(&[REMOVED, &key], now().into())?;
            Ok(transaction
                .get(&["metadata"])
                .cloned()
                .unwrap_or_else(|| json!({})))
        })
        .await
}

pub fn integer(value: &Value) -> Option<i64> {
    match value {
        Value::Bool(value) => Some(i64::from(*value)),
        Value::Number(value) => value.as_i64().or_else(|| {
            value
                .as_f64()
                .filter(|n| n.is_finite() && *n >= i64::MIN as f64 && *n < i64::MAX as f64)
                .map(|n| n as i64)
        }),
        Value::String(value) => {
            crate::storage::parse_python_integer(value).and_then(|value| i64::try_from(value).ok())
        }
        _ => None,
    }
}

fn number_integer(value: &Value, fallback: f64) -> Result<Value, String> {
    let number = as_number(value, fallback).trunc();
    if !number.is_finite() {
        return Err("cannot convert non-finite number to integer".into());
    }
    if number >= i64::MIN as f64 && number < i64::MAX as f64 {
        return Ok(json!(number as i64));
    }
    serde_json::from_str(&format!("{number:.0}")).map_err(|error| error.to_string())
}

pub fn text(value: &Value) -> String {
    if py_truthy(value) {
        py_string(value)
    } else {
        String::new()
    }
}

fn each(value: &Value, mut visit: impl FnMut(&Value)) -> Result<(), String> {
    if !py_truthy(value) {
        return Ok(());
    }
    match value {
        Value::Array(items) => items.iter().for_each(visit),
        Value::Object(items) => items
            .keys()
            .for_each(|key| visit(&Value::String(key.clone()))),
        Value::String(text) => text
            .chars()
            .for_each(|c| visit(&Value::String(c.to_string()))),
        _ => return Err("metadata list field is not iterable".into()),
    }
    Ok(())
}

fn names(value: &Value) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    each(value, |item| {
        let name = py_string(item).trim().to_owned();
        if !name.is_empty() {
            names.push(name);
        }
    })?;
    Ok(names)
}

fn people(value: &Value) -> Vec<Value> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let (name, url) = match item {
                Value::String(name) => (name.trim().to_owned(), String::new()),
                Value::Object(_) => (
                    text(&item["name"]).trim().to_owned(),
                    text(&item["url"]).trim().to_owned(),
                ),
                _ => return None,
            };
            (!name.is_empty()).then(|| json!({"name":name,"url":url}))
        })
        .collect()
}

pub fn screenshots(value: &Value) -> Result<Vec<Value>, String> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for item in value
        .as_array()
        .into_iter()
        .flatten()
        .filter(|item| item.is_object())
    {
        let url = https_url(text(&item["url"]).trim());
        if url.is_empty() || !seen.insert(url.clone()) {
            continue;
        }
        let mut row = json!({"id":if py_truthy(&item["id"]) {text(&item["id"])} else {url.clone()},
            "url":url,"caption":clean_html_text(&text(&item["caption"])),
            "width":number_integer(&item["width"],0.0)?,"height":number_integer(&item["height"],0.0)?});
        let author = clean_html_text(&text(&item["author"]));
        if !author.is_empty() {
            row["author"] = author.into();
        }
        let link = https_url(text(&item["link"]).trim());
        if !link.is_empty() {
            row["link"] = link.into();
        }
        result.push(row);
        if result.len() == 30 {
            break;
        }
    }
    Ok(result)
}

pub fn is_delisted(index: &Value, appid: i64) -> bool {
    index["apps"].as_array().into_iter().flatten().any(|row| {
        row.as_array()
            .and_then(|row| row.first())
            .and_then(safe_int)
            == Some(appid)
    })
}

pub fn sanitize(value: &Value, index: &Value) -> Result<Value, String> {
    if !value.is_object() {
        return Err("metadata must be an object".into());
    }
    let mut categories = Vec::new();
    each(&value["store_categories"], |item| {
        if let Some(category) = integer(item) {
            if !categories.contains(&category) {
                categories.push(category);
            }
        }
    })?;
    let mut dlc = Vec::new();
    for item in value["steam_dlc_appids"].as_array().into_iter().flatten() {
        if !item.is_i64() && !item.is_u64() && !item.is_string() {
            continue;
        }
        if let Some(appid) = integer(item).filter(|n| *n > 0) {
            if !dlc.contains(&appid) {
                dlc.push(appid);
            }
        }
    }
    let has_points_shop = value["has_points_shop"]
        .as_bool()
        .unwrap_or_else(|| categories.contains(&29));
    let rating = (!value["rating"].is_null())
        .then(|| as_number(&value["rating"], f64::NAN))
        .filter(|n| n.is_finite())
        .map(|n| n.round_ties_even().clamp(0.0, 100.0) as i64);
    let release = matching::normalize_release_date(&value["release_date"]);
    if !value["release_date"].is_null()
        && (!value["release_date"].is_string()
            || value["release_date"].as_str() != release.as_deref())
    {
        return Err("release_date must be a YYYY-MM-DD calendar date or null".into());
    }
    let category = integer(&value["deck_compat_category"]).filter(|n| (0..=3).contains(n));
    let compat_override = if value["deck_compat_override"] == "valve" {
        json!("valve")
    } else {
        json!(integer(&value["deck_compat_override"]).filter(|n| (0..=3).contains(n)))
    };
    let title = clean_game_title(&text(&value["title"]));
    let description = normalize_description_text(&text(&value["description"]));
    let short = normalize_description_text(&text(&value["short_description"]));
    let appid = safe_int(&value["steam_appid"]);
    let name = value["steam_store_name"]
        .as_str()
        .filter(|name| !name.is_empty() && !name.contains('\0') && name.chars().count() <= 512)
        .map(clean_game_title)
        .unwrap_or_default();
    let state = text(&value["steam_store_state"]).trim().to_lowercase();
    let state = if ["available", "delisted", "unknown"].contains(&state.as_str()) {
        state
    } else {
        "unknown".into()
    };
    let state = if state == "unknown" && appid.is_some_and(|id| id != 0 && is_delisted(index, id)) {
        "delisted".to_owned()
    } else {
        state
    };
    let mut result = json!({
        "title":title,"id":if py_truthy(&value["id"]) {value["id"].clone()} else {json!(title)},
        "source":if py_truthy(&value["source"]) {value["source"].clone()} else {json!("Manual")},
        "source_url":text(&value["source_url"]),"description":description,
        "short_description":if short.is_empty() {description} else {short},
        "developers":people(&value["developers"]),"publishers":people(&value["publishers"]),
        "rating":rating,"deck_compat_category":category,"deck_compat_override":compat_override,
        "store_categories":categories,"genres":names(&value["genres"])?,"features":names(&value["features"])?,
        "screenshots":screenshots(&value["screenshots"])?,"steam_appid":appid,
        "steam_store_name":name,"steam_dlc_appids":dlc,"has_points_shop":has_points_shop,
        "steam_store_state":state,"steam_store_url":https_url(&text(&value["steam_store_url"])),
        "steam_news":sanitize_news(&value["steam_news"])?,
        "steam_news_enriched_at":number_integer(&value["steam_news_enriched_at"],0.0)?
    });
    if value.get("release_date").is_some() {
        result["release_date"] = json!(release);
    }
    Ok(result)
}

pub fn complete(value: &Value) -> bool {
    if !value.is_object() {
        return false;
    }
    let title = clean_game_title(&text(&value["title"]));
    let source = text(&value["source"]).trim().to_lowercase();
    let description = ["short_description", "description"].iter().any(|field| {
        !normalize_description_text(&text(&value[*field]))
            .trim()
            .is_empty()
    });
    !title.is_empty() && ((!source.is_empty() && source != "manual") || description)
}

pub fn merge_fetched(existing: &Value, fetched: Value) -> Value {
    let mut merged = fetched;
    if let Some(choice) = existing.get("deck_compat_override") {
        merged["deck_compat_override"] = choice.clone();
    }
    if safe_int(&existing["steam_appid"]).is_some_and(|id| id > 0) {
        for key in [
            "steam_appid",
            "steam_store_name",
            "steam_store_url",
            "steam_store_state",
            "deck_compat_category",
            "steam_news",
            "steam_news_enriched_at",
        ] {
            if let Some(value) = existing.get(key) {
                merged[key] = value.clone();
            }
        }
    }
    merged
}

pub fn prepare_save(
    existing: &Value,
    mut value: Value,
    preserve_override: bool,
    trusted_appid: Option<i64>,
    index: &Value,
) -> Result<Value, String> {
    if !value.is_object() {
        return Err("metadata must be an object".into());
    }
    if preserve_override || value.get("deck_compat_override").is_none() {
        if let Some(choice) = existing.get("deck_compat_override") {
            value["deck_compat_override"] = choice.clone();
        }
    }
    let previous = safe_int(&existing["steam_appid"]);
    let next = safe_int(&value["steam_appid"]);
    let trusted = trusted_appid.is_some_and(|id| id > 0 && Some(id) == next);
    if previous.is_some_and(|id| id != 0) && previous != next && !trusted {
        value["deck_compat_category"] = Value::Null;
        // Data fetched for the old Steam app must not describe the new match. The store
        // URL and name stay: the editor sends them for the new ID and enrichment refills them.
        if let Some(object) = value.as_object_mut() {
            for key in [
                "steam_store_state",
                "steam_news",
                "steam_news_enriched_at",
                "steam_dlc_appids",
                "has_points_shop",
            ] {
                object.remove(key);
            }
        }
    }
    Ok(stamp_updated(existing, sanitize(&value, index)?))
}

/// Sets `updated_at`, but returns the existing record unchanged when nothing else
/// differs, so re-saving the same data skips the settings-file write.
fn stamp_updated(existing: &Value, mut result: Value) -> Value {
    if let Some(previous) = existing.get("updated_at") {
        result["updated_at"] = previous.clone();
        if &result == existing {
            return result;
        }
    }
    result["updated_at"] = now().into();
    result
}

pub fn sanitize_news(value: &Value) -> Result<Vec<Value>, String> {
    use crate::providers::steam;
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for item in value
        .as_array()
        .into_iter()
        .flatten()
        .filter(|item| item.is_object())
    {
        let first_text = |keys: &[&str]| -> String {
            keys.iter()
                .find_map(|key| py_truthy(&item[*key]).then(|| text(&item[*key])))
                .unwrap_or_default()
        };
        let gid = first_text(&["gid", "news_id", "announcement_gid", "event_gid"])
            .trim()
            .to_owned();
        let raw_id = first_text(&[
            "id",
            "gid",
            "news_id",
            "announcement_gid",
            "event_gid",
            "url",
        ])
        .trim()
        .to_owned();
        let title = steam::clean_steam_news_text(&text(&item["title"]));
        let url = https_url(text(&item["url"]).trim());
        if title.is_empty() || url.is_empty() {
            continue;
        }
        let event = if py_truthy(&item["event_type"]) {
            &item["event_type"]
        } else {
            &item["type"]
        };
        let event_type = number_integer(event, 28.0)?;
        let body_source = first_text(&["raw_body", "body", "description", "contents"]);
        let raw_body = steam::steam_news_raw_body(&body_source);
        let canonical = casefold(url.split(['?', '#']).next().unwrap_or_default());
        let summary = if event_type == 12 {
            String::new()
        } else {
            steam::clean_steam_news_text(&first_text(&[
                "summary",
                "contents",
                "raw_body",
                "body",
                "description",
            ]))
        };
        let summary_end = summary
            .char_indices()
            .nth(180)
            .map_or(summary.len(), |(offset, _)| offset);
        let summary_key = casefold(&summary[..summary_end]);
        let key = format!("{}|{}|{}", casefold(&title), canonical, summary_key);
        if !seen.insert(key) {
            continue;
        }
        let mut sources = Vec::new();
        for source in item["image_sources"]
            .as_array()
            .into_iter()
            .flatten()
            .chain([
                &item["image"],
                &item["image_url"],
                &item["preview_image_url"],
            ])
        {
            let raw = text(source);
            let image = steam::steam_partner_asset_url(&raw, "");
            let image = if image.is_empty() {
                https_url(raw.trim())
            } else {
                image
            };
            if !image.is_empty() && !sources.contains(&image) {
                sources.push(image);
            }
        }
        if sources.is_empty() {
            sources = steam::steam_news_image_candidates(&body_source, 0);
        }
        let body = steam::clean_steam_news_text(if body_source.is_empty() {
            &summary
        } else {
            &body_source
        });
        let feed = first_text(&["feedLabel", "feedlabel", "feedname"]);
        result.push(json!({"id":if raw_id.is_empty() {url.clone()} else {raw_id},"gid":gid,"news_id":gid,
            "announcement_gid":if py_truthy(&item["announcement_gid"]) {text(&item["announcement_gid"]).trim().to_owned()} else {gid.clone()},
            "event_gid":if py_truthy(&item["event_gid"]) {text(&item["event_gid"]).trim().to_owned()} else {gid.clone()},
            "event_type":event_type,"type":event_type,"title":title,"url":url,
            "summary":summary.chars().take(900).collect::<String>(),"body":body.chars().take(4000).collect::<String>(),
            "raw_body":raw_body,"image":sources.first().cloned().unwrap_or_default(),"image_sources":sources,
            "author":clean_html_text(&text(&item["author"])),"feedLabel":clean_html_text(if feed.is_empty() {"Steam News"} else {&feed}),
            "date":number_integer(&item["date"],0.0)?}));
        if result.len() == 12 {
            break;
        }
    }
    Ok(result)
}

pub async fn sanitize_for(state: &crate::state::AppState, value: &Value) -> Result<Value, String> {
    let index = state.delisted.lock().await;
    sanitize(value, index.as_deref().unwrap_or(&Value::Null))
}

fn metadata_mapping(value: Value) -> Result<Value, String> {
    let entries = match value {
        Value::Array(entries) => entries,
        Value::Object(object) => return Ok(Value::Object(object)),
        _ => return Err("metadata must be an object".into()),
    };
    let mut result = Map::new();
    for entry in entries {
        let Some(pair) = entry.as_array().filter(|pair| pair.len() == 2) else {
            return Err("metadata must be an object".into());
        };
        let key = match &pair[0] {
            Value::Null => "None".to_owned(),
            Value::Bool(value) => {
                if *value {
                    "True".to_owned()
                } else {
                    "False".to_owned()
                }
            }
            Value::Number(value) => value.to_string(),
            Value::String(value) => value.clone(),
            _ => return Err("metadata must be an object".into()),
        };
        result.insert(key, pair[1].clone());
    }
    Ok(Value::Object(result))
}

pub async fn save(
    state: &crate::state::AppState,
    app_id: &Value,
    value: Value,
    preserve_override: bool,
    trusted_appid: Option<i64>,
) -> Result<Value, String> {
    save_guarded(state, app_id, value, preserve_override, trusted_appid, None)
        .await
        .map(|saved| saved.expect("an unguarded save always commits"))
}

/// With `expected`, a background result commits only while the stored record (`Null` when
/// absent) still equals the copy it was computed from; otherwise it returns `None`.
pub async fn save_guarded(
    state: &crate::state::AppState,
    app_id: &Value,
    value: Value,
    preserve_override: bool,
    trusted_appid: Option<i64>,
    expected: Option<&Value>,
) -> Result<Option<Value>, String> {
    let value = metadata_mapping(value)?;
    let key = py_string(app_id);
    let mut storage = state.store().await?;
    if state.cancel.is_cancelled() {
        return Err("backend stopping".into());
    }
    let index = state.delisted.lock().await.clone();
    storage
        .transaction(|transaction| {
            let existing = transaction.get(&["metadata", &key]).unwrap_or(&Value::Null);
            if expected.is_some_and(|expected| expected != existing) {
                return Ok(None);
            }
            // Guarded saves are automatic (scan, screenshot enrichment); a removal can leave the
            // record unchanged (absent), so the marker itself must also reject them.
            if expected.is_some() && transaction.get(&[REMOVED, &key]).is_some() {
                return Ok(None);
            }
            let cleaned = prepare_save(
                existing,
                value,
                preserve_override,
                trusted_appid,
                index.as_deref().unwrap_or(&Value::Null),
            )?;
            transaction.set(&["metadata", &key], cleaned.clone())?;
            if expected.is_none() && safe_int(&cleaned["steam_appid"]).is_some_and(|id| id > 0) {
                // Only the user's own save of a Steam match lets automatic matching resume.
                transaction.remove(&[REMOVED, &key])?;
            }
            Ok(Some(cleaned))
        })
        .await
}

pub async fn fetch(state: &crate::state::AppState, slug: &str) -> Result<Option<Value>, String> {
    match crate::providers::ign::fetch_metadata(&state.http, slug).await? {
        Some(value) => Ok(Some(sanitize_for(state, &value).await?)),
        None => Ok(None),
    }
}

pub async fn auto_fetch(
    state: &crate::state::AppState,
    title: &str,
) -> Result<Option<Value>, String> {
    match crate::providers::ign::auto_fetch_metadata(&state.http, title).await? {
        Some(value) => Ok(Some(sanitize_for(state, &value).await?)),
        None => Ok(None),
    }
}

async fn save_fetched(
    state: &crate::state::AppState,
    app_id: &Value,
    fetched: Value,
    picked: bool,
) -> Result<Option<Value>, String> {
    let key = py_string(app_id);
    let index = state.delisted.lock().await.clone();
    state
        .change(move |transaction| {
            if transaction.get(&[REMOVED, &key]).is_some() {
                if !picked {
                    return Ok(None);
                }
                transaction.remove(&[REMOVED, &key])?;
            }
            let existing = transaction
                .get(&["metadata", &key])
                .cloned()
                .unwrap_or(Value::Null);
            let merged = merge_fetched(&existing, fetched);
            let cleaned = prepare_save(
                &existing,
                merged,
                false,
                None,
                index.as_deref().unwrap_or(&Value::Null),
            )?;
            transaction.set(&["metadata", &key], cleaned.clone())?;
            Ok(Some(cleaned))
        })
        .await
}

pub async fn apply_fetched(
    state: &crate::state::AppState,
    app_id: &Value,
    slug: &str,
) -> Result<Option<Value>, String> {
    let Some(fetched) = fetch(state, slug).await? else {
        return Ok(None);
    };
    save_fetched(state, app_id, fetched, true).await
}

pub async fn apply_auto_fetched(
    state: &crate::state::AppState,
    app_id: &Value,
    title: &str,
) -> Result<Option<Value>, String> {
    if removed_by_user(state.store().await?.data(), &py_string(app_id)) {
        return Ok(None);
    }
    let Some(fetched) = auto_fetch(state, title).await? else {
        return Ok(None);
    };
    save_fetched(state, app_id, fetched, false).await
}

pub async fn with_steam_news(
    state: &crate::state::AppState,
    mut value: Value,
    title: &str,
    limit: i64,
    include_details: bool,
) -> Result<Value, String> {
    use crate::providers::steam;
    if !value.is_object() {
        return Ok(value);
    }
    let clean_title = clean_game_title(if title.is_empty() {
        value["title"].as_str().unwrap_or_default()
    } else {
        title
    });
    if clean_title.is_empty() {
        return sanitize_for(state, &value).await;
    }
    let mut appid = safe_int(&value["steam_appid"]).filter(|id| *id != 0);
    let mut store_url = https_url(&text(&value["steam_store_url"]));
    if appid.is_none() {
        (appid, store_url) =
            steam::resolve_steam_appid_for_title(&state.http, &clean_title, Some(&value)).await;
    }
    let news = if let Some(id) = appid {
        steam::steam_news_for_appid(&state.http, id, &clean_title, limit).await?
    } else {
        Vec::new()
    };
    if let Some(id) = appid {
        let previous_id = safe_int(&value["steam_appid"]);
        let previous_category = safe_int(&value["deck_compat_category"]);
        value["steam_appid"] = id.into();
        if include_details {
            let lookup = steam::steam_deck_compat_lookup_for_appid(&state.http, id).await;
            value["deck_compat_category"] = match lookup.status.as_str() {
                "available" => json!(lookup.category),
                "unavailable" => Value::Null,
                _ if previous_id == Some(id)
                    && previous_category.is_some_and(|category| (0..=3).contains(&category)) =>
                {
                    json!(previous_category)
                }
                _ => Value::Null,
            };
            if let Some(mut details) = steam::steam_appdetails_for_appid(&state.http, id).await {
                if let Some(object) = details.as_object_mut() {
                    let shots = screenshots(&object.remove("screenshots").unwrap_or(Value::Null))?;
                    if !shots.is_empty() {
                        object.insert("screenshots".into(), json!(shots));
                    }
                    for (key, field) in object {
                        if key == "steam_dlc_appids" || key == "has_points_shop" || py_truthy(field)
                        {
                            value[key.as_str()] = field.clone();
                        }
                    }
                }
                value["source"] = "Steam".into();
                if text(&value["steam_store_state"]).trim().to_lowercase() != "delisted" {
                    value["steam_store_state"] = "available".into();
                }
            }
        }
        if store_url.is_empty() {
            store_url = format!("https://store.steampowered.com/app/{id}/");
        }
    }
    if !store_url.is_empty() {
        value["steam_store_url"] = store_url.into();
    }
    if !news.is_empty() {
        value["steam_news"] = json!(news);
        value["steam_news_enriched_at"] = now().into();
    } else {
        value["steam_news"] = json!(sanitize_news(&value["steam_news"])?);
        value["steam_news_enriched_at"] = number_integer(&value["steam_news_enriched_at"], 0.0)?;
    }
    sanitize_for(state, &value).await
}

pub async fn enrich_steam(
    state: &crate::state::AppState,
    app_id: &Value,
    mode: &str,
) -> Result<Option<Value>, String> {
    use crate::providers::steam;
    if mode != "metadata" && mode != "steam-name" {
        return Err("Invalid Steam enrichment mode".into());
    }
    let key = py_string(app_id);
    let snapshot = state.store().await?.data()["metadata"][&key].clone();
    if !snapshot.is_object() {
        return Ok(None);
    }
    let enriched = if mode == "steam-name" {
        let Some(appid) = safe_int(&snapshot["steam_appid"]).filter(|id| *id > 0) else {
            return Ok(None);
        };
        let Some(details) = steam::steam_appdetails_for_appid(&state.http, appid).await else {
            return Ok(None);
        };
        let name = clean_game_title(&text(&details["steam_store_name"]));
        if name.is_empty() {
            return Ok(None);
        }
        let mut value = snapshot.clone();
        value["steam_store_name"] = name.into();
        value
    } else {
        let enriched =
            with_steam_news(state, snapshot.clone(), &text(&snapshot["title"]), 6, true).await?;
        sanitize_for(state, &enriched).await?
    };
    let enriched = stamp_updated(&snapshot, enriched);
    state
        .change(|transaction| {
            if transaction.get(&["metadata", &key]) != Some(&snapshot) {
                crate::logging::event(
                    "metadata",
                    "steam enrichment discarded",
                    json!({"app_id":app_id,"outcome":"stale"}),
                    log::Level::Info,
                );
                return Ok(None);
            }
            transaction.set(&["metadata", &key], enriched.clone())?;
            Ok(Some(enriched))
        })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn news_deduplication_folds_modern_case_pairs_and_keeps_the_first_item() {
        let news = sanitize_news(&json!([
            {"id":"first","title":"ᲛᲔᲢᲠᲝ","url":"https://example.com/news","body":"Same story"},
            {"id":"second","title":"მეტრო","url":"https://example.com/news","body":"Same story"}
        ]))
        .unwrap();
        assert_eq!(
            news.iter()
                .map(|item| item["id"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec!["first"]
        );
    }
    #[test]
    fn resaving_identical_data_keeps_the_stored_record_and_timestamp() {
        let input = json!({"title":"Same","source":"Manual","description":"Text"});
        let mut stored = prepare_save(&json!({}), input.clone(), false, None, &Value::Null).unwrap();
        stored["updated_at"] = json!(1);
        assert_eq!(prepare_save(&stored, input, false, None, &Value::Null).unwrap(), stored);
        let changed = json!({"title":"Different","source":"Manual","description":"Text"});
        assert_ne!(prepare_save(&stored, changed, false, None, &Value::Null).unwrap()["updated_at"], json!(1));
    }

    #[test]
    fn saves_keep_explicit_choice_and_clear_changed_match_rating() {
        let old = json!({"deck_compat_override":0,"steam_appid":10,"deck_compat_category":3});
        let kept = prepare_save(
            &old,
            json!({"title":"Game","steam_appid":11,"deck_compat_category":3}),
            false,
            None,
            &Value::Null,
        )
        .unwrap();
        assert_eq!(kept["deck_compat_override"], 0);
        assert_eq!(kept["deck_compat_category"], Value::Null);
        let automatic = prepare_save(&old,json!({"title":"Game","steam_appid":11,"deck_compat_override":null,"deck_compat_category":2}),false,Some(11),&Value::Null).unwrap();
        assert_eq!(automatic["deck_compat_override"], Value::Null);
        assert_eq!(automatic["deck_compat_category"], 2);
    }
    #[test]
    fn a_changed_steam_match_drops_the_old_apps_store_state_and_news() {
        let news = json!([{"id":"a","title":"Old game news","url":"https://example.com/a","body":"Body"}]);
        let old = json!({
            "title":"Game","steam_appid":10,"steam_store_state":"delisted",
            "steam_store_url":"https://store.steampowered.com/app/10/","steam_store_name":"Old Game",
            "steam_news":news,"steam_news_enriched_at":5,"steam_dlc_appids":[12],"has_points_shop":true,
        });
        let mut rematch = old.clone();
        rematch["steam_appid"] = json!(11);
        let saved = prepare_save(&old, rematch.clone(), false, None, &Value::Null).unwrap();
        assert_eq!(saved["steam_store_state"], "unknown");
        assert_eq!(saved["steam_news"], json!([]));
        assert_eq!(saved["steam_news_enriched_at"], 0);
        assert_eq!(saved["steam_dlc_appids"], json!([]));
        assert_eq!(saved["has_points_shop"], false);
        // Data the provider fetched for the new ID itself is kept.
        let trusted = prepare_save(&old, rematch, false, Some(11), &Value::Null).unwrap();
        assert_eq!(trusted["steam_store_state"], "delisted");
        assert_eq!(trusted["steam_news"][0]["id"], "a");
    }
    #[test]
    fn dates_preserve_absence_null_and_literal_manual_description() {
        let input = json!({"title":"A","description":"&amp; <b>literal</b>\r\nline"});
        let saved = sanitize(&input, &Value::Null).unwrap();
        assert!(saved.get("release_date").is_none());
        assert_eq!(saved["description"], "&amp; <b>literal</b>\nline");
        assert_eq!(
            sanitize(&json!({"release_date":null}), &Value::Null).unwrap()["release_date"],
            Value::Null
        );
        assert!(sanitize(&json!({"release_date":"2023-02-29"}), &Value::Null).is_err());
        assert!(
            sanitize(
                &json!({"release_date":"2024-01-01T00:00:00Z"}),
                &Value::Null
            )
            .is_err()
        );
        assert!(sanitize(&json!({"release_date": 123}), &Value::Null).is_err());
    }

    #[test]
    fn shell_completeness_and_provider_pinning() {
        assert!(!complete(&json!({"title":"A","source":"Manual"})));
        assert!(complete(
            &json!({"title":"A","source":"Manual","description":"text"})
        ));
        assert!(complete(&json!({"title":"A","source":"IGN"})));
        let merged = merge_fetched(
            &json!({"steam_appid":7,"steam_news":[],"deck_compat_override":"valve"}),
            json!({"steam_appid":8,"title":"new","steam_news":[{}]}),
        );
        assert_eq!(merged["steam_appid"], 7);
        assert_eq!(merged["steam_news"], json!([]));
        assert_eq!(merged["deck_compat_override"], "valve");
    }
    #[test]
    fn sanitizer_matches_original_python_records() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../tests/fixtures/sanitizer-python.json")).unwrap();
        for case in cases {
            assert_eq!(
                sanitize(&case["input"], &Value::Null).unwrap(),
                case["output"],
                "input: {}",
                case["input"]
            );
        }
    }

    #[test]
    fn malformed_numeric_fields_reject_instead_of_becoming_zero() {
        assert!(
            sanitize(
                &json!({"screenshots":[{"url":"https://example.test/image","width":"NaN"}]}),
                &Value::Null
            )
            .is_err()
        );
        assert!(sanitize(&json!({"steam_news_enriched_at":"Infinity"}), &Value::Null).is_err());
        let legacy = sanitize(
            &json!({"store_categories":"29","genres":{"Action":1},"features":[" Co-op ",null]}),
            &Value::Null,
        )
        .unwrap();
        assert_eq!(legacy["store_categories"], json!([2, 9]));
        assert_eq!(legacy["genres"], json!(["Action"]));
        assert_eq!(legacy["features"], json!(["Co-op", "None"]));
        let underscored = sanitize(
            &json!({"store_categories":["2_9","2.9","__29"]}),
            &Value::Null,
        )
        .unwrap();
        assert_eq!(underscored["store_categories"], json!([29]));
    }

    struct TestDirectory(std::path::PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            use std::os::unix::fs::PermissionsExt;
            static ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let root = std::env::var_os("TMPDIR")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| "/var/tmp/omp-1000".into());
            let path = root.join(format!(
                "metadata-enrichment-test-{}-{}",
                std::process::id(),
                ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&path).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
            Self(path)
        }
        fn env(&self) -> decky_plugin::Env {
            decky_plugin::Env {
                plugin_settings_dir: self.0.join("settings"),
                plugin_runtime_dir: self.0.join("runtime"),
                plugin_log_dir: self.0.join("logs"),
                plugin_version: "0.5.5".into(),
                ..Default::default()
            }
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[tokio::test]
    async fn save_accepts_dict_style_empty_and_pair_arrays() {
        let directory = TestDirectory::new();
        let state = crate::state::AppState::new(directory.env()).unwrap();
        state.initialize().await.unwrap();

        let empty = save(&state, &json!(31), json!([]), false, None)
            .await
            .unwrap();
        assert_eq!(empty["title"], "");
        let pairs = save(
            &state,
            &json!(32),
            json!([["title", "Pair Game"], ["description", "Pair description"]]),
            false,
            None,
        )
        .await
        .unwrap();
        assert_eq!(pairs["title"], "Pair Game");
        assert_eq!(pairs["description"], "Pair description");
        assert!(
            save(&state, &json!(33), json!([["title"]]), false, None)
                .await
                .is_err()
        );
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn apply_fetched_merges_under_the_storage_transaction() {
        use crate::{
            http::{Fixture, Http},
            providers::ign::IGN_GRAPHQL_URL,
            state::AppState,
        };
        use reqwest::{Method, header::HeaderMap};
        use std::sync::Arc;

        let payload = json!({"data":{"objectSelectByTypeAndSlug":{
            "id":"fetched","slug":"fetched","url":"https://www.ign.com/games/fetched",
            "type":"Game","metadata":{"names":{"name":"Fetched Game","short":"Fetched Game"},
                "descriptions":{"short":"Description","long":""}},"objectRegions":[]
        }}});
        let mut http = Http::fixtures(vec![Fixture {
            method: Method::POST,
            url: IGN_GRAPHQL_URL.to_owned(),
            result: Ok(crate::http::Response {
                status: 200,
                headers: HeaderMap::new(),
                body: serde_json::to_vec(&payload).unwrap(),
                url: IGN_GRAPHQL_URL.to_owned(),
            }),
        }]);
        let gate = http.gate_next_request();
        let directory = TestDirectory::new();
        let mut state = AppState::new(directory.env()).unwrap();
        let inner = Arc::get_mut(&mut state).unwrap();
        inner.cancel = http.cancel.clone();
        inner.http = http;
        state.initialize().await.unwrap();
        save(
            &state,
            &json!(42),
            json!({"title":"Original","deck_compat_override":0}),
            false,
            None,
        )
        .await
        .unwrap();

        let applying = Arc::clone(&state);
        let task =
            tokio::spawn(async move { apply_fetched(&applying, &json!(42), "fetched").await });
        tokio::time::timeout(std::time::Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();
        let blocker = state.store().await.unwrap();
        gate.resume.notify_one();
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        let editing = Arc::clone(&state);
        let edit = tokio::spawn(async move {
            editing
                .change(|transaction| {
                    transaction.set(&["metadata", "42", "deck_compat_override"], json!("valve"))?;
                    Ok(())
                })
                .await
        });
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        drop(blocker);

        assert!(task.await.unwrap().unwrap().is_some());
        edit.await.unwrap().unwrap();
        assert_eq!(
            state.store().await.unwrap().data()["metadata"]["42"]["deck_compat_override"],
            "valve"
        );
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn removal_blocks_ign_auto_fetch_until_the_user_picks_a_result() {
        use crate::{
            http::{Fixture, Http},
            providers::ign::IGN_GRAPHQL_URL,
            state::AppState,
        };
        use reqwest::{Method, header::HeaderMap};
        use std::sync::Arc;

        let payload = json!({"data":{"objectSelectByTypeAndSlug":{
            "id":"dolphin","slug":"dolphin","url":"https://www.ign.com/games/dolphin",
            "type":"Game","metadata":{"names":{"name":"Dolphin","short":"Dolphin"},
                "descriptions":{"short":"Description","long":""}},"objectRegions":[]
        }}});
        // Only the explicit pick may reach IGN.
        let http = Http::fixtures(vec![Fixture {
            method: Method::POST,
            url: IGN_GRAPHQL_URL.to_owned(),
            result: Ok(crate::http::Response {
                status: 200,
                headers: HeaderMap::new(),
                body: serde_json::to_vec(&payload).unwrap(),
                url: IGN_GRAPHQL_URL.to_owned(),
            }),
        }]);
        let directory = TestDirectory::new();
        let mut state = AppState::new(directory.env()).unwrap();
        let inner = Arc::get_mut(&mut state).unwrap();
        inner.cancel = http.cancel.clone();
        inner.http = http;
        state.initialize().await.unwrap();
        save(&state, &json!(42), json!({"title":"Dolphin"}), false, None).await.unwrap();
        remove(&state, &json!(42)).await.unwrap();

        assert_eq!(apply_auto_fetched(&state, &json!(42), "Dolphin").await.unwrap(), None);
        assert!(state.store().await.unwrap().data()["metadata"].get("42").is_none());
        let picked = apply_fetched(&state, &json!(42), "dolphin").await.unwrap().unwrap();
        assert_eq!(picked["title"], "Dolphin");
        let data = state.store().await.unwrap().data().clone();
        assert_eq!(data["metadata"]["42"], picked);
        assert!(!removed_by_user(&data, "42"));
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    fn enrichment_responses(mode: &str) -> Vec<crate::http::Fixture> {
        use crate::http::Fixture;
        let details = Fixture::json(
            "https://store.steampowered.com/api/appdetails?appids=7&l=english",
            json!({"7":{"success":true,"data":{"name":"Old Steam title","short_description":"old remote description"}}}),
        );
        if mode == "steam-name" {
            return vec![details];
        }
        vec![
            Fixture::json(
                "https://store.steampowered.com/events/ajaxgetpartnereventspageable/?appid=7&offset=0&count=30&l=english&origin=https%3A%2F%2Fstore.steampowered.com",
                json!({"events":[{"event_type":28,"gid":"event","announcement_body":{"gid":"announcement","headline":"News","body":"Body","posttime":1}}]}),
            ),
            Fixture::json(
                "https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=7&l=english",
                json!({"results":{"resolved_category":3}}),
            ),
            details,
        ]
    }

    #[tokio::test]
    async fn delayed_enrichment_cannot_resurrect_or_replace_newer_metadata() {
        use crate::{http::Http, state::AppState};
        use std::sync::Arc;
        for mode in ["metadata", "steam-name"] {
            for remove in [false, true] {
                let directory = TestDirectory::new();
                let mut http = Http::fixtures(enrichment_responses(mode));
                let gate = http.gate_next_request();
                let mut state = AppState::new(directory.env()).unwrap();
                let inner = Arc::get_mut(&mut state).unwrap();
                inner.cancel = http.cancel.clone();
                inner.http = http;
                state.initialize().await.unwrap();
                save(
                    &state,
                    &json!(42),
                    json!({"title":"Old","steam_appid":7,"description":"manual"}),
                    false,
                    None,
                )
                .await
                .unwrap();
                let pending = Arc::clone(&state);
                let task =
                    tokio::spawn(async move { enrich_steam(&pending, &json!(42), mode).await });
                tokio::time::timeout(std::time::Duration::from_secs(2), gate.started.notified())
                    .await
                    .unwrap();
                let expected = if remove {
                    state
                        .change(|tx| {
                            tx.remove(&["metadata", "42"])?;
                            Ok(())
                        })
                        .await
                        .unwrap();
                    Value::Null
                } else {
                    save(
                        &state,
                        &json!(42),
                        json!({"title":"New manual match","steam_appid":9,"description":"new"}),
                        false,
                        None,
                    )
                    .await
                    .unwrap()
                };
                gate.resume.notify_one();
                assert_eq!(task.await.unwrap().unwrap(), None);
                assert_eq!(
                    state.store().await.unwrap().data()["metadata"]["42"],
                    expected
                );
                state.http.assert_drained();
                state.shutdown().await.unwrap();
            }
        }
    }

    #[tokio::test]
    async fn cancelled_enrichment_cannot_publish_after_unload() {
        use crate::{http::Http, state::AppState};
        use std::sync::Arc;
        let directory = TestDirectory::new();
        let mut http = Http::fixtures(enrichment_responses("steam-name"));
        let gate = http.gate_next_request();
        let mut state = AppState::new(directory.env()).unwrap();
        let inner = Arc::get_mut(&mut state).unwrap();
        inner.cancel = http.cancel.clone();
        inner.http = http;
        state.initialize().await.unwrap();
        let before = save(
            &state,
            &json!(42),
            json!({"title":"Original","steam_appid":7}),
            false,
            None,
        )
        .await
        .unwrap();
        let pending = Arc::clone(&state);
        let task =
            tokio::spawn(async move { enrich_steam(&pending, &json!(42), "steam-name").await });
        gate.started.notified().await;
        state.shutdown().await.unwrap();
        gate.resume.notify_one();
        let _ = task.await.unwrap();
        assert_eq!(
            state.store().await.unwrap().data()["metadata"]["42"],
            before
        );
    }
}
