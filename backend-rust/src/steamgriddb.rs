use crate::{
    artwork::{self, ArtworkSlot},
    http::Redirects,
    logging,
    state::AppState,
    storage,
};
use reqwest::Method;
use serde_json::{Map, Value, json};
use std::{fs, path::Path, time::Duration};

const SGDB_API_BASE: &str = "https://www.steamgriddb.com/api/v2";
const SGDB_API_TIMEOUT: Duration = Duration::from_secs(15);
const SGDB_ASSET_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_API_BYTES: usize = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

/// Optional compile-time API key injected by CI (`DECKY_SGDB_API_KEY`).
/// Never hardcode any third-party plugin's private key here.
pub const BUILT_IN_API_KEY: Option<&str> = option_env!("DECKY_SGDB_API_KEY");

/// Valid 1x1 RGBA transparent PNG (67 bytes).
pub const TRANSPARENT_PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
    0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
    0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
    0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

pub fn resolve_api_key_with_builtin(
    user_key: Option<&str>,
    built_in: Option<&str>,
) -> Option<String> {
    if let Some(trimmed) = user_key.map(str::trim).filter(|key| !key.is_empty()) {
        return Some(trimmed.to_owned());
    }
    built_in
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(str::to_owned)
}

pub fn key_status_with_builtin(user_key: Option<&str>, built_in: Option<&str>) -> Value {
    let has_user = user_key.is_some_and(|key| !key.trim().is_empty());
    let has_built_in = built_in.is_some_and(|key| !key.trim().is_empty());
    json!({
        "hasUserKey": has_user,
        "hasBuiltInKey": has_built_in,
        "configured": has_user || has_built_in,
    })
}

async fn resolve_state_api_key(state: &AppState) -> Result<Option<String>, String> {
    let store = state.store().await?;
    let settings = storage::normalize_artwork_settings(&store.data()["settings"]["steam_artwork"]);
    let user_key = settings.get("sgdbApiKey").and_then(Value::as_str);
    Ok(resolve_api_key_with_builtin(user_key, BUILT_IN_API_KEY))
}

pub async fn get_sgdb_key_status(state: &AppState) -> Result<Value, String> {
    let store = state.store().await?;
    let settings = storage::normalize_artwork_settings(&store.data()["settings"]["steam_artwork"]);
    let user_key = settings.get("sgdbApiKey").and_then(Value::as_str);
    Ok(key_status_with_builtin(user_key, BUILT_IN_API_KEY))
}

pub fn is_allowed_sgdb_url(raw: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(raw) else {
        return false;
    };
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    if url.port_or_known_default() != Some(443) {
        return false;
    }
    let Some(host) = url.host_str().map(str::to_ascii_lowercase) else {
        return false;
    };
    host == "steamgriddb.com" || host.ends_with(".steamgriddb.com")
}

fn slot_endpoint(slot: ArtworkSlot) -> &'static str {
    match slot {
        ArtworkSlot::Cover | ArtworkSlot::Wide => "grids",
        ArtworkSlot::Hero => "heroes",
        ArtworkSlot::Logo => "logos",
        ArtworkSlot::Icon => "icons",
    }
}

fn percent_encode_segment(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            other => {
                use std::fmt::Write;
                let _ = write!(encoded, "%{other:02X}");
            }
        }
    }
    encoded
}

fn join_string_array(value: Option<&Value>, allowed: &[&str]) -> Option<String> {
    let items: Vec<&str> = value?
        .as_array()?
        .iter()
        .filter_map(Value::as_str)
        .filter(|entry| allowed.is_empty() || allowed.contains(entry))
        .collect();
    (!items.is_empty()).then(|| items.join(","))
}

pub fn build_assets_url(
    sgdb_game_id: u64,
    slot: ArtworkSlot,
    filters: &Value,
    page: u32,
) -> Result<String, String> {
    let endpoint = slot_endpoint(slot);
    let mut url = reqwest::Url::parse(&format!("{SGDB_API_BASE}/{endpoint}/game/{sgdb_game_id}"))
        .map_err(|_| "sgdb_invalid_url".to_owned())?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("page", &page.to_string());

        let allowed_dims = storage::allowed_sgdb_dimensions(slot.as_str());
        if !allowed_dims.is_empty() {
            if let Some(dims) = join_string_array(filters.get("dimensions"), allowed_dims) {
                pairs.append_pair("dimensions", &dims);
            }
        }
        let allowed_styles = storage::allowed_sgdb_styles(slot.as_str());
        if let Some(styles) = join_string_array(filters.get("styles"), allowed_styles) {
            pairs.append_pair("styles", &styles);
        }
        let allowed_mimes = storage::allowed_sgdb_mimes(slot.as_str());
        if let Some(mimes) = join_string_array(filters.get("mimes"), allowed_mimes) {
            pairs.append_pair("mimes", &mimes);
        }
        if let Some(types) = join_string_array(filters.get("types"), &["static", "animated"]) {
            pairs.append_pair("types", &types);
        }

        // Boolean content filters: true allows them ("any"), false excludes them ("false").
        let nsfw = filters
            .get("nsfw")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        pairs.append_pair("nsfw", if nsfw { "any" } else { "false" });

        let humor = filters
            .get("humor")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        pairs.append_pair("humor", if humor { "any" } else { "false" });

        let epilepsy = filters
            .get("epilepsy")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        pairs.append_pair("epilepsy", if epilepsy { "any" } else { "false" });
    }
    Ok(url.into())
}

async fn sgdb_get_json(state: &AppState, url: &str, api_key: &str) -> Result<Value, String> {
    if !is_allowed_sgdb_url(url) {
        return Err("sgdb_invalid_url".to_owned());
    }
    let auth_header = format!("Bearer {api_key}");
    let response = state
        .http
        .request(
            Method::GET,
            url,
            &[("Authorization", auth_header.as_str())],
            None,
            SGDB_API_TIMEOUT,
            MAX_API_BYTES,
            Redirects::Default,
        )
        .await
        .map_err(|error| {
            logging::event(
                "artwork",
                "SteamGridDB request failed",
                json!({"error": error}),
                log::Level::Warn,
            );
            "sgdb_request_failed".to_owned()
        })?;
    match response.status {
        200..=299 => response
            .json()
            .map_err(|_| "sgdb_invalid_response".to_owned()),
        401 | 403 => Err("sgdb_invalid_api_key".to_owned()),
        404 => Ok(json!({ "success": false, "data": [] })),
        429 => Err("sgdb_rate_limited".to_owned()),
        status => {
            logging::event(
                "artwork",
                "SteamGridDB returned non-OK status",
                json!({"status": status}),
                log::Level::Warn,
            );
            Err("sgdb_request_failed".to_owned())
        }
    }
}

pub fn parse_search_games_payload(payload: &Value) -> Vec<Value> {
    let Some(items) = payload.get("data").and_then(Value::as_array) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let id = item.get("id").and_then(Value::as_u64).filter(|id| *id > 0)?;
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|name| !name.is_empty())?;
            let types: Vec<Value> = item
                .get("types")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .map(|t| Value::String(t.to_owned()))
                        .collect()
                })
                .unwrap_or_default();
            let verified = item
                .get("verified")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let release_date = item.get("release_date").and_then(Value::as_i64);
            Some(json!({
                "id": id,
                "name": name,
                "types": types,
                "verified": verified,
                "release_date": release_date,
            }))
        })
        .collect()
}

pub fn parse_assets_payload(payload: &Value, requested_page: u32) -> Value {
    let page = payload
        .get("page")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(requested_page);
    let total = payload
        .get("total")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let limit = payload
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(50)
        .max(1);
    let items: Vec<Value> = payload
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item.get("id").and_then(Value::as_u64).filter(|id| *id > 0)?;
            let url = item.get("url").and_then(Value::as_str)?;
            if !is_allowed_sgdb_url(url) {
                return None;
            }
            let thumb = item
                .get("thumb")
                .and_then(Value::as_str)
                .filter(|candidate| is_allowed_sgdb_url(candidate))
                .unwrap_or(url);
            let mime = item
                .get("mime")
                .and_then(Value::as_str)
                .unwrap_or("image/png");
            let width = item.get("width").and_then(Value::as_u64).unwrap_or(0);
            let height = item.get("height").and_then(Value::as_u64).unwrap_or(0);
            let style = item.get("style").and_then(Value::as_str).unwrap_or("");
            let animated = item
                .get("animated")
                .and_then(Value::as_bool)
                .unwrap_or(mime == "image/webp");
            let nsfw = item.get("nsfw").and_then(Value::as_bool).unwrap_or(false);
            let humor = item.get("humor").and_then(Value::as_bool).unwrap_or(false);
            let epilepsy = item
                .get("epilepsy")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let notes = item
                .get("notes")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|note| !note.is_empty())
                .map(str::to_owned);
            let author_obj = item.get("author").and_then(Value::as_object);
            let author_name = author_obj
                .and_then(|author| author.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let author_steam64 = author_obj
                .and_then(|author| author.get("steam64"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let author_avatar = author_obj
                .and_then(|author| author.get("avatar"))
                .and_then(Value::as_str)
                .unwrap_or("");
            Some(json!({
                "id": id,
                "url": url,
                "thumb": thumb,
                "width": width,
                "height": height,
                "mime": mime,
                "style": style,
                "animated": animated,
                "nsfw": nsfw,
                "humor": humor,
                "epilepsy": epilepsy,
                "notes": notes,
                "author": {
                    "name": author_name,
                    "steam64": author_steam64,
                    "avatar": author_avatar,
                },
            }))
        })
        .collect();
    let returned = items.len() as u64;
    let has_more = if total > 0 {
        (u64::from(page) + 1).saturating_mul(limit) < total && returned > 0
    } else {
        returned >= limit
    };
    json!({
        "items": items,
        "page": page,
        "total": total,
        "has_more": has_more,
    })
}

pub async fn sgdb_search_games(state: &AppState, query_arg: &Value) -> Result<Value, String> {
    let query = query_arg
        .as_str()
        .map(str::trim)
        .filter(|q| !q.is_empty())
        .ok_or("sgdb_empty_query")?;
    let api_key = resolve_state_api_key(state)
        .await?
        .ok_or("sgdb_missing_api_key")?;
    let encoded = percent_encode_segment(query);
    let url = format!("{SGDB_API_BASE}/search/autocomplete/{encoded}");
    let payload = sgdb_get_json(state, &url, &api_key).await?;
    Ok(Value::Array(parse_search_games_payload(&payload)))
}

pub async fn sgdb_resolve_game(
    state: &AppState,
    app_id_arg: &Value,
    steam_appid_arg: &Value,
    game_name_arg: &Value,
) -> Result<Value, String> {
    let app_id =
        storage::positive_shortcut_app_id(app_id_arg).ok_or("invalid_shortcut_app_id")?;
    let key = app_id.to_string();

    // 1. Persisted user override takes precedence.
    let existing_override = {
        let store = state.store().await?;
        store.data()["sgdb_game_overrides"].get(&key).cloned()
    };
    if let Some(override_entry) = existing_override.and_then(|val| val.as_object().cloned()) {
        if let (Some(id), Some(name)) = (
            override_entry.get("sgdb_game_id").and_then(Value::as_u64),
            override_entry.get("name").and_then(Value::as_str),
        ) {
            return Ok(json!({
                "game": {
                    "id": id,
                    "name": name,
                    "source": "override",
                },
                "override": true,
            }));
        }
    }

    let Some(api_key) = resolve_state_api_key(state).await? else {
        return Err("sgdb_missing_api_key".to_owned());
    };

    // 2. Try Steam AppID lookup if available.
    if let Some(steam_appid) = storage::positive_steam_app_id(steam_appid_arg) {
        let url = format!("{SGDB_API_BASE}/games/steam/{steam_appid}");
        if let Ok(payload) = sgdb_get_json(state, &url, &api_key).await {
            if let Some(data) = payload.get("data").and_then(Value::as_object) {
                if let (Some(id), Some(name)) = (
                    data.get("id").and_then(Value::as_u64).filter(|id| *id > 0),
                    data.get("name").and_then(Value::as_str),
                ) {
                    return Ok(json!({
                        "game": {
                            "id": id,
                            "name": name,
                            "verified": data.get("verified").and_then(Value::as_bool).unwrap_or(false),
                            "source": "steam",
                        },
                        "override": false,
                    }));
                }
            }
        }
    }

    // 3. Auto-search by game name (covers unmatched non-Steam shortcuts & emulators).
    if let Some(name) = game_name_arg
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        let encoded = percent_encode_segment(name);
        let url = format!("{SGDB_API_BASE}/search/autocomplete/{encoded}");
        let payload = sgdb_get_json(state, &url, &api_key).await?;
        let matches = parse_search_games_payload(&payload);
        if let Some(first) = matches.into_iter().next() {
            let mut game = first.as_object().cloned().unwrap_or_else(Map::new);
            game.insert("source".to_owned(), Value::String("search".to_owned()));
            return Ok(json!({
                "game": Value::Object(game),
                "override": false,
            }));
        }
    }

    Ok(json!({
        "game": Value::Null,
        "override": false,
    }))
}

pub async fn sgdb_list_assets(
    state: &AppState,
    sgdb_game_id_arg: &Value,
    slot_arg: &Value,
    filters_arg: &Value,
    page_arg: &Value,
) -> Result<Value, String> {
    let sgdb_game_id = sgdb_game_id_arg
        .as_u64()
        .filter(|id| *id > 0)
        .ok_or("sgdb_invalid_game_id")?;
    let slot = slot_arg
        .as_str()
        .and_then(ArtworkSlot::parse)
        .ok_or("artwork_invalid_slot")?;
    let page = page_arg
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(0);
    let api_key = resolve_state_api_key(state)
        .await?
        .ok_or("sgdb_missing_api_key")?;
    let url = build_assets_url(sgdb_game_id, slot, filters_arg, page)?;
    let payload = sgdb_get_json(state, &url, &api_key).await?;
    Ok(parse_assets_payload(&payload, page))
}

async fn package_image_bytes(
    state: &AppState,
    app_id: u32,
    slot: ArtworkSlot,
    bytes: Vec<u8>,
) -> Result<Value, String> {
    let (ext, mime) = artwork::sniff_image_format(&bytes).ok_or("artwork_invalid_image")?;
    let base64 = artwork::encode_base64(&bytes);
    let file_path = if slot == ArtworkSlot::Icon {
        let shortcuts = state.local_shortcuts().await?;
        let ext_owned = ext.to_owned();
        tokio::task::spawn_blocking(move || {
            artwork::save_local_icon_bytes(app_id, &shortcuts, &ext_owned, &bytes)
        })
        .await
        .map_err(|error| error.to_string())??
    } else {
        None
    };
    Ok(json!({
        "slot": slot.as_str(),
        "base64": base64,
        "ext": ext,
        "mime": mime,
        "file_path": file_path,
    }))
}

pub async fn sgdb_fetch_asset(
    state: &AppState,
    app_id_arg: &Value,
    slot_arg: &Value,
    url_arg: &Value,
) -> Result<Value, String> {
    let app_id =
        storage::positive_shortcut_app_id(app_id_arg).ok_or("invalid_shortcut_app_id")?;
    let slot = slot_arg
        .as_str()
        .and_then(ArtworkSlot::parse)
        .ok_or("artwork_invalid_slot")?;
    let url = url_arg
        .as_str()
        .map(str::trim)
        .filter(|raw| is_allowed_sgdb_url(raw))
        .ok_or("artwork_invalid_url")?;

    let response = state
        .http
        .request(
            Method::GET,
            url,
            &[],
            None,
            SGDB_ASSET_TIMEOUT,
            MAX_IMAGE_BYTES,
            Redirects::Default,
        )
        .await
        .map_err(|_| "artwork_download_failed".to_owned())?;
    if !(200..300).contains(&response.status) {
        return Err("artwork_download_failed".to_owned());
    }
    package_image_bytes(state, app_id, slot, response.body).await
}

pub async fn read_local_artwork_file(
    state: &AppState,
    app_id_arg: &Value,
    slot_arg: &Value,
    file_path_arg: &Value,
) -> Result<Value, String> {
    let app_id =
        storage::positive_shortcut_app_id(app_id_arg).ok_or("invalid_shortcut_app_id")?;
    let slot = slot_arg
        .as_str()
        .and_then(ArtworkSlot::parse)
        .ok_or("artwork_invalid_slot")?;
    let raw_path = file_path_arg
        .as_str()
        .map(str::trim)
        .filter(|path| !path.is_empty() && !path.contains('\0'))
        .ok_or("artwork_invalid_file")?
        .to_owned();

    let bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let path = Path::new(&raw_path);
        let metadata = fs::metadata(path).map_err(|_| "artwork_file_unreadable".to_owned())?;
        if !metadata.is_file() {
            return Err("artwork_invalid_file".to_owned());
        }
        if metadata.len() == 0 || metadata.len() > MAX_IMAGE_BYTES as u64 {
            return Err("artwork_file_too_large".to_owned());
        }
        fs::read(path).map_err(|_| "artwork_file_unreadable".to_owned())
    })
    .await
    .map_err(|error| error.to_string())??;

    package_image_bytes(state, app_id, slot, bytes).await
}

pub async fn get_transparent_artwork_asset(
    state: &AppState,
    app_id_arg: &Value,
    slot_arg: &Value,
) -> Result<Value, String> {
    let app_id =
        storage::positive_shortcut_app_id(app_id_arg).ok_or("invalid_shortcut_app_id")?;
    let slot = slot_arg
        .as_str()
        .and_then(ArtworkSlot::parse)
        .ok_or("artwork_invalid_slot")?;
    package_image_bytes(state, app_id, slot, TRANSPARENT_PNG.to_vec()).await
}

pub async fn get_sgdb_game_override(state: &AppState, app_id_arg: &Value) -> Result<Value, String> {
    let Some(app_id) = storage::positive_shortcut_app_id(app_id_arg) else {
        return Ok(Value::Null);
    };
    let store = state.store().await?;
    Ok(store.data()["sgdb_game_overrides"]
        .get(app_id.to_string())
        .cloned()
        .unwrap_or(Value::Null))
}

pub async fn set_sgdb_game_override(
    state: &AppState,
    app_id_arg: &Value,
    sgdb_game_id_arg: &Value,
    name_arg: &Value,
) -> Result<Value, String> {
    let app_id =
        storage::positive_shortcut_app_id(app_id_arg).ok_or("invalid_shortcut_app_id")?;
    let entry = storage::validate_sgdb_game_override(&json!({
        "sgdb_game_id": sgdb_game_id_arg,
        "name": name_arg,
    }))?;
    let key = app_id.to_string();
    state
        .change(|transaction| {
            transaction.set(&["sgdb_game_overrides", &key], entry.clone())?;
            Ok(entry)
        })
        .await
}

pub async fn clear_sgdb_game_override(
    state: &AppState,
    app_id_arg: &Value,
) -> Result<Value, String> {
    let app_id =
        storage::positive_shortcut_app_id(app_id_arg).ok_or("invalid_shortcut_app_id")?;
    let key = app_id.to_string();
    state
        .change(|transaction| {
            transaction.remove(&["sgdb_game_overrides", &key])?;
            Ok(json!({ "ok": true }))
        })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_user_key_before_built_in_and_trims() {
        assert_eq!(
            resolve_api_key_with_builtin(Some("  user-key  "), Some("built-in")),
            Some("user-key".to_owned())
        );
        assert_eq!(
            resolve_api_key_with_builtin(Some("   "), Some("  built-in  ")),
            Some("built-in".to_owned())
        );
        assert_eq!(resolve_api_key_with_builtin(None, Some("")), None);
        assert_eq!(
            key_status_with_builtin(Some(""), Some("built-in")),
            json!({ "hasUserKey": false, "hasBuiltInKey": true, "configured": true })
        );
        assert_eq!(
            key_status_with_builtin(None, None),
            json!({ "hasUserKey": false, "hasBuiltInKey": false, "configured": false })
        );
    }

    #[test]
    fn allows_only_https_steamgriddb_hosts() {
        assert!(is_allowed_sgdb_url(
            "https://www.steamgriddb.com/api/v2/grids/game/5258006"
        ));
        assert!(is_allowed_sgdb_url(
            "https://cdn2.steamgriddb.com/grid/abc123.png"
        ));
        assert!(is_allowed_sgdb_url(
            "https://steamgriddb.com/grid/abc123.webp"
        ));
        assert!(!is_allowed_sgdb_url(
            "http://cdn2.steamgriddb.com/grid/abc123.png"
        ));
        assert!(!is_allowed_sgdb_url(
            "https://evilsteamgriddb.com/grid/abc123.png"
        ));
        assert!(!is_allowed_sgdb_url(
            "https://user:pass@cdn2.steamgriddb.com/grid/abc123.png"
        ));
        assert!(!is_allowed_sgdb_url(
            "https://cdn2.steamgriddb.com:8443/grid/abc123.png"
        ));
    }

    #[test]
    fn builds_assets_url_with_sanitized_filters() {
        let filters = json!({
            "dimensions": ["600x900", "342x482", "9999x9999"],
            "styles": ["alternate", "not_a_style"],
            "mimes": ["image/png", "image/webp"],
            "types": ["static", "animated"],
            "nsfw": false,
            "humor": true,
            "epilepsy": true,
        });
        let url = build_assets_url(5258006, ArtworkSlot::Cover, &filters, 2).unwrap();
        assert!(url.starts_with("https://www.steamgriddb.com/api/v2/grids/game/5258006?"));
        assert!(url.contains("page=2"));
        assert!(url.contains("dimensions=600x900%2C342x482"));
        assert!(!url.contains("9999x9999"));
        assert!(url.contains("styles=alternate"));
        assert!(!url.contains("not_a_style"));
        assert!(url.contains("mimes=image%2Fpng%2Cimage%2Fwebp"));
        assert!(url.contains("types=static%2Canimated"));
        assert!(url.contains("nsfw=false"));
        assert!(url.contains("humor=any"));
        assert!(url.contains("epilepsy=any"));
    }

    #[test]
    fn parses_assets_payload_and_filters_disallowed_urls() {
        let payload = json!({
            "success": true,
            "page": 0,
            "limit": 50,
            "total": 75,
            "data": [
                {
                    "id": 101,
                    "url": "https://cdn2.steamgriddb.com/grid/ok.png",
                    "thumb": "https://cdn2.steamgriddb.com/thumb/ok.jpg",
                    "width": 600,
                    "height": 900,
                    "mime": "image/png",
                    "style": "alternate",
                    "nsfw": false,
                    "humor": false,
                    "epilepsy": false,
                    "notes": "Clean poster",
                    "author": { "name": "artist1", "steam64": "76561198", "avatar": "" }
                },
                {
                    "id": 102,
                    "url": "https://evil.example/bad.png",
                    "thumb": "https://evil.example/bad.jpg",
                    "width": 600,
                    "height": 900,
                    "mime": "image/png"
                }
            ]
        });
        let parsed = parse_assets_payload(&payload, 0);
        let items = parsed["items"].as_array().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], 101);
        assert_eq!(items[0]["animated"], false);
        assert_eq!(items[0]["author"]["name"], "artist1");
        assert_eq!(parsed["total"], 75);
        assert_eq!(parsed["has_more"], true);
    }

    #[test]
    fn transparent_png_is_valid_png() {
        assert_eq!(
            artwork::sniff_image_format(TRANSPARENT_PNG),
            Some(("png", "image/png"))
        );
    }
}
