use crate::{
    http::{Http, Redirects},
    shortcuts_vdf::Shortcut,
    state::AppState,
    steam_paths,
    storage,
};
use reqwest::Method;
use serde_json::{Map, Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

const STORE_BROWSE_URL: &str = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const STORE_ASSET_CDN: &str = "https://shared.steamstatic.com/store_item_assets/";
const COMMUNITY_ICON_BASE: &str = "https://shared.steamstatic.com/community_assets/images/apps/";
const ASSET_CACHE_TTL: Duration = Duration::from_secs(600);
const ASSET_FETCH_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_PREVIEW_BYTES: u64 = 4 * 1024 * 1024;
const GRID_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "ico"];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum ArtworkSlot {
    Cover,
    Wide,
    Hero,
    Logo,
    Icon,
}

pub const ALL_SLOTS: [ArtworkSlot; 5] = [
    ArtworkSlot::Cover,
    ArtworkSlot::Wide,
    ArtworkSlot::Hero,
    ArtworkSlot::Logo,
    ArtworkSlot::Icon,
];

impl ArtworkSlot {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "cover" => Some(Self::Cover),
            "wide" => Some(Self::Wide),
            "hero" => Some(Self::Hero),
            "logo" => Some(Self::Logo),
            "icon" => Some(Self::Icon),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Cover => "cover",
            Self::Wide => "wide",
            Self::Hero => "hero",
            Self::Logo => "logo",
            Self::Icon => "icon",
        }
    }

    pub fn grid_stem(self, app_id: u32) -> String {
        match self {
            Self::Cover => format!("{app_id}p"),
            Self::Wide => format!("{app_id}"),
            Self::Hero => format!("{app_id}_hero"),
            Self::Logo => format!("{app_id}_logo"),
            Self::Icon => format!("{app_id}_icon"),
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ResolvedSteamAssets {
    pub cover: Option<String>,
    pub wide: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub icon: Option<String>,
}

impl ResolvedSteamAssets {
    pub fn get(&self, slot: ArtworkSlot) -> Option<&str> {
        match slot {
            ArtworkSlot::Cover => self.cover.as_deref(),
            ArtworkSlot::Wide => self.wide.as_deref(),
            ArtworkSlot::Hero => self.hero.as_deref(),
            ArtworkSlot::Logo => self.logo.as_deref(),
            ArtworkSlot::Icon => self.icon.as_deref(),
        }
    }
}

#[derive(Default)]
pub struct AssetCache {
    entries: HashMap<u32, (Instant, ResolvedSteamAssets)>,
}

impl AssetCache {
    pub fn get(&self, steam_appid: u32) -> Option<ResolvedSteamAssets> {
        let (stored_at, assets) = self.entries.get(&steam_appid)?;
        (stored_at.elapsed() < ASSET_CACHE_TTL).then(|| assets.clone())
    }

    pub fn insert(&mut self, steam_appid: u32, assets: ResolvedSteamAssets) {
        if self.entries.len() >= 512 {
            self.entries.retain(|_, (stored_at, _)| stored_at.elapsed() < ASSET_CACHE_TTL);
        }
        self.entries.insert(steam_appid, (Instant::now(), assets));
    }
}

pub fn is_allowed_steam_asset_url(raw: &str) -> bool {
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
    host == "steamstatic.com"
        || host.ends_with(".steamstatic.com")
        || host == "steamcdn-a.akamaihd.net"
        || host == "media.steampowered.com"
}

pub fn sniff_image_format(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.len() >= 8 && bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some(("png", "image/png"));
    }
    if bytes.len() >= 3 && bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some(("jpg", "image/jpeg"));
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some(("webp", "image/webp"));
    }
    if bytes.len() >= 4 && bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        return Some(("ico", "image/x-icon"));
    }
    None
}

pub fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        output.push(TABLE[(b0 >> 2) as usize] as char);
        output.push(TABLE[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(b2 & 0x3f) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}

fn is_community_icon_hash(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

fn format_store_asset_url(steam_appid: u32, format_template: Option<&str>, filename: &str) -> Option<String> {
    let filename = filename.trim();
    if filename.is_empty() {
        return None;
    }
    let url = if filename.starts_with("https://") {
        filename.to_owned()
    } else if let Some(template) = format_template.filter(|template| !template.trim().is_empty()) {
        let replaced = template.trim().replace("${FILENAME}", filename);
        if replaced.starts_with("https://") {
            replaced
        } else {
            format!("{STORE_ASSET_CDN}{}", replaced.trim_start_matches('/'))
        }
    } else {
        format!("{STORE_ASSET_CDN}steam/apps/{steam_appid}/{filename}")
    };
    is_allowed_steam_asset_url(&url).then_some(url)
}

pub fn parse_store_browse_assets(steam_appid: u32, payload: &Value) -> ResolvedSteamAssets {
    let Some(assets) = payload
        .get("response")
        .and_then(|response| response.get("store_items"))
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("assets"))
        .and_then(Value::as_object)
    else {
        return ResolvedSteamAssets::default();
    };
    let template = assets.get("asset_url_format").and_then(Value::as_str);
    let pick = |keys: &[&str]| -> Option<String> {
        keys.iter()
            .filter_map(|key| assets.get(*key).and_then(Value::as_str))
            .find_map(|filename| format_store_asset_url(steam_appid, template, filename))
    };
    let icon = assets
        .get("community_icon")
        .and_then(Value::as_str)
        .filter(|hash| is_community_icon_hash(hash))
        .map(|hash| format!("{COMMUNITY_ICON_BASE}{steam_appid}/{hash}.jpg"));
    ResolvedSteamAssets {
        cover: pick(&["library_capsule_2x", "library_capsule"]),
        wide: pick(&["header_2x", "header"]),
        hero: pick(&["library_hero_2x", "library_hero"]),
        // IStoreBrowseService sends no logo key; resolve_steam_assets probes the CDN for it.
        logo: None,
        icon,
    }
}

async fn probe_url_exists(http: &Http, url: &str) -> bool {
    if !is_allowed_steam_asset_url(url) {
        return false;
    }
    match http
        .request(
            Method::HEAD,
            url,
            &[],
            None,
            Duration::from_secs(8),
            8 * 1024,
            Redirects::Default,
        )
        .await
    {
        Ok(response) => (200..300).contains(&response.status),
        Err(_) => false,
    }
}

async fn first_existing_cdn(http: &Http, steam_appid: u32, candidates: &[&str]) -> Option<String> {
    for filename in candidates {
        let url = format!("{STORE_ASSET_CDN}steam/apps/{steam_appid}/{filename}");
        if probe_url_exists(http, &url).await {
            return Some(url);
        }
    }
    None
}

pub async fn resolve_steam_assets(
    http: &Http,
    cache: &Mutex<AssetCache>,
    steam_appid: u32,
) -> ResolvedSteamAssets {
    if let Some(cached) = cache.lock().await.get(steam_appid) {
        return cached;
    }
    let input = json!({
        "ids": [{"appid": steam_appid}],
        "context": {"language": "english", "country_code": "US"},
        "data_request": {"include_assets": true},
    });
    let mut url = reqwest::Url::parse(STORE_BROWSE_URL).expect("fixed Steam browse URL");
    url.query_pairs_mut()
        .append_pair("input_json", &input.to_string());
    let browse = http
        .json(url.as_str(), Duration::from_secs(12), 512 * 1024)
        .await;
    let browse_ok = browse.is_ok();
    let mut resolved = browse
        .map(|payload| parse_store_browse_assets(steam_appid, &payload))
        .unwrap_or_default();
    // Delisted or hidden titles often omit IStoreBrowseService assets; fall back to standard CDN paths.
    if resolved.cover.is_none() {
        resolved.cover = first_existing_cdn(
            http,
            steam_appid,
            &["library_600x900_2x.jpg", "library_600x900.jpg"],
        )
        .await;
    }
    if resolved.wide.is_none() {
        resolved.wide = first_existing_cdn(http, steam_appid, &["header.jpg"]).await;
    }
    if resolved.hero.is_none() {
        resolved.hero = first_existing_cdn(http, steam_appid, &["library_hero.jpg"]).await;
    }
    if resolved.logo.is_none() {
        resolved.logo = first_existing_cdn(http, steam_appid, &["logo_2x.png", "logo.png"]).await;
    }
    // A network failure must not hide the game's artwork for the whole TTL.
    if browse_ok || resolved != ResolvedSteamAssets::default() {
        cache.lock().await.insert(steam_appid, resolved.clone());
    }
    resolved
}

fn first_user_grid_dir() -> Option<PathBuf> {
    steam_paths::detect_steam_installs(&steam_paths::discover_steam_roots())
        .into_iter()
        .find_map(|install| install.userdata_dirs.into_iter().next())
        .map(|user| user.join("config/grid"))
}

fn grid_dir_of(shortcut: Option<&Shortcut>) -> Option<PathBuf> {
    shortcut
        .and_then(|shortcut| shortcut.shortcut_file.parent())
        .map(|config_dir| config_dir.join("grid"))
}

fn shortcut_grid_dir(app_id: u32, shortcuts: &[Shortcut]) -> Option<PathBuf> {
    grid_dir_of(shortcuts.iter().find(|shortcut| shortcut.app_id == app_id))
        .or_else(first_user_grid_dir)
}

fn find_grid_file(grid_dir: &Path, stem: &str) -> Option<PathBuf> {
    for ext in GRID_EXTENSIONS {
        let candidate = grid_dir.join(format!("{stem}.{ext}"));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

pub fn local_slot_file(
    app_id: u32,
    slot: ArtworkSlot,
    grid_dir: Option<&Path>,
    shortcut_icon: Option<&str>,
) -> Option<PathBuf> {
    if slot == ArtworkSlot::Icon {
        if let Some(icon) = shortcut_icon.map(str::trim).filter(|icon| !icon.is_empty()) {
            let path = PathBuf::from(icon);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    let grid_dir = grid_dir?;
    find_grid_file(grid_dir, &slot.grid_stem(app_id))
}

fn file_preview_data_url(path: &Path) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    if metadata.len() == 0 || metadata.len() > MAX_PREVIEW_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let (_, mime) = sniff_image_format(&bytes)?;
    Some(format!("data:{mime};base64,{}", encode_base64(&bytes)))
}

pub fn enabled_slots_from_settings(settings: &Value) -> [bool; 5] {
    let slots = &settings["slots"];
    [
        slots["cover"].as_bool().unwrap_or(true),
        slots["wide"].as_bool().unwrap_or(true),
        slots["hero"].as_bool().unwrap_or(true),
        slots["logo"].as_bool().unwrap_or(true),
        slots["icon"].as_bool().unwrap_or(true),
    ]
}

fn game_ids_from_value(games: &Value) -> Vec<u32> {
    games
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("appid").and_then(storage::positive_shortcut_app_id))
        .collect()
}

pub fn summarize_artwork_sync(
    game_ids: &[u32],
    metadata: &Value,
    locks: &Value,
    settings: &Value,
    shortcuts: &[Shortcut],
    fallback_grid_dir: Option<&Path>,
) -> Value {
    let enabled = enabled_slots_from_settings(settings);
    let enabled_indices: Vec<usize> = enabled
        .iter()
        .enumerate()
        .filter_map(|(idx, on)| on.then_some(idx))
        .collect();
    let mut matched = 0usize;
    let mut complete = 0usize;
    let mut missing_games = 0usize;
    let mut missing_slots = 0usize;
    let mut existing_enabled_slots = 0usize;
    let mut locked_games = 0usize;

    for &app_id in game_ids {
        let key = app_id.to_string();
        let Some(record) = metadata.get(&key) else {
            continue;
        };
        if storage::positive_steam_app_id(&record["steam_appid"]).is_none() {
            continue;
        }
        matched += 1;
        let locked = locks.get(&key).and_then(Value::as_bool).unwrap_or(false);
        if locked {
            locked_games += 1;
        }
        let shortcut = shortcuts.iter().find(|item| item.app_id == app_id);
        let grid_dir =
            grid_dir_of(shortcut).or_else(|| fallback_grid_dir.map(Path::to_path_buf));
        let shortcut_icon = shortcut.map(|item| item.icon.as_str());
        let mut game_missing = 0usize;
        for &idx in &enabled_indices {
            let present =
                local_slot_file(app_id, ALL_SLOTS[idx], grid_dir.as_deref(), shortcut_icon)
                    .is_some();
            if present {
                if !locked {
                    existing_enabled_slots += 1;
                }
            } else {
                game_missing += 1;
                if !locked {
                    missing_slots += 1;
                }
            }
        }
        if game_missing == 0 {
            complete += 1;
        } else {
            missing_games += 1;
        }
    }

    json!({
        "matched": matched,
        "complete": complete,
        "missing_games": missing_games,
        "missing_slots": missing_slots,
        "existing_enabled_slots": existing_enabled_slots,
        "locked_games": locked_games,
    })
}

pub async fn get_artwork_summary(state: &AppState, games: &Value) -> Result<Value, String> {
    let game_ids = game_ids_from_value(games);
    let (metadata, locks, settings) = {
        let store = state.store().await?;
        let data = store.data();
        (
            data["metadata"].clone(),
            data["artwork_locks"].clone(),
            storage::normalize_artwork_settings(&data["settings"]["steam_artwork"]),
        )
    };
    let shortcuts = state.local_shortcuts().await?;
    tokio::task::spawn_blocking(move || {
        let fallback_grid = first_user_grid_dir();
        summarize_artwork_sync(
            &game_ids,
            &metadata,
            &locks,
            &settings,
            &shortcuts,
            fallback_grid.as_deref(),
        )
    })
    .await
    .map_err(|error| error.to_string())
}

pub async fn get_game_artwork_state(
    state: &AppState,
    app_id_arg: &Value,
    steam_appid_arg: &Value,
) -> Result<Value, String> {
    let app_id =
        storage::positive_shortcut_app_id(app_id_arg).ok_or("invalid_shortcut_app_id")?;
    let steam_appid = storage::positive_steam_app_id(steam_appid_arg);
    let locked = {
        let store = state.store().await?;
        store.data()["artwork_locks"]
            .get(app_id.to_string())
            .and_then(Value::as_bool)
            .unwrap_or(false)
    };
    let shortcuts = state.local_shortcuts().await?;
    let steam_assets = match steam_appid {
        Some(id) => resolve_steam_assets(&state.http, &state.artwork_asset_cache, id).await,
        None => ResolvedSteamAssets::default(),
    };
    let local_slots = tokio::task::spawn_blocking(move || {
        let grid_dir = shortcut_grid_dir(app_id, &shortcuts);
        let shortcut_icon = shortcuts
            .iter()
            .find(|item| item.app_id == app_id)
            .map(|item| item.icon.as_str());
        let mut map = Map::new();
        for slot in ALL_SLOTS {
            let file = local_slot_file(app_id, slot, grid_dir.as_deref(), shortcut_icon);
            let preview = file.as_deref().and_then(file_preview_data_url);
            map.insert(
                slot.as_str().to_owned(),
                json!({
                    "present": file.is_some(),
                    "preview_data_url": preview,
                }),
            );
        }
        map
    })
    .await
    .map_err(|error| error.to_string())?;

    let mut slots = Map::new();
    for slot in ALL_SLOTS {
        let key = slot.as_str();
        let local = &local_slots[key];
        let steam_url = steam_assets.get(slot);
        slots.insert(
            key.to_owned(),
            json!({
                "present": local["present"],
                "preview_data_url": local["preview_data_url"],
                "steam_url": steam_url,
                "available": steam_url.is_some(),
            }),
        );
    }

    Ok(json!({
        "app_id": app_id,
        "steam_appid": steam_appid,
        "locked": locked,
        "slots": Value::Object(slots),
    }))
}

/// Only non-Steam shortcuts need a local icon file (`SetShortcutIcon` takes a path); native Steam
/// games get their icon through `SetCustomArtworkForApp`, so nothing is written for them.
pub(crate) fn should_save_local_icon(slot: ArtworkSlot, app_id: u32) -> bool {
    slot == ArtworkSlot::Icon && app_id >= 0x8000_0000
}

pub(crate) fn save_local_icon_bytes(
    app_id: u32,
    shortcuts: &[Shortcut],
    ext: &str,
    bytes: &[u8],
) -> Result<Option<String>, String> {
    let Some(grid_dir) = shortcut_grid_dir(app_id, shortcuts) else {
        return Ok(None);
    };
    fs::create_dir_all(&grid_dir).map_err(|_| "artwork_write_failed".to_owned())?;
    let stem = ArtworkSlot::Icon.grid_stem(app_id);
    for old_ext in GRID_EXTENSIONS {
        let old = grid_dir.join(format!("{stem}.{old_ext}"));
        if old.is_file() {
            let _ = fs::remove_file(old);
        }
    }
    let target = grid_dir.join(format!("{stem}.{ext}"));
    let tmp = grid_dir.join(format!(".{stem}.{ext}.tmp"));
    fs::write(&tmp, bytes).map_err(|_| "artwork_write_failed".to_owned())?;
    fs::rename(&tmp, &target).map_err(|_| "artwork_write_failed".to_owned())?;
    Ok(Some(target.to_string_lossy().into_owned()))
}

pub async fn fetch_steam_artwork_asset(
    state: &AppState,
    app_id_arg: &Value,
    steam_appid_arg: &Value,
    slot_arg: &Value,
) -> Result<Value, String> {
    let app_id =
        storage::positive_shortcut_app_id(app_id_arg).ok_or("invalid_shortcut_app_id")?;
    let steam_appid =
        storage::positive_steam_app_id(steam_appid_arg).ok_or("invalid_steam_app_id")?;
    let slot = slot_arg
        .as_str()
        .and_then(ArtworkSlot::parse)
        .ok_or("artwork_invalid_slot")?;

    let assets = resolve_steam_assets(&state.http, &state.artwork_asset_cache, steam_appid).await;
    let url = assets
        .get(slot)
        .ok_or("artwork_asset_unavailable")?
        .to_owned();
    if !is_allowed_steam_asset_url(&url) {
        return Err("artwork_invalid_url".to_owned());
    }
    let response = state
        .http
        .request(
            Method::GET,
            &url,
            &[],
            None,
            ASSET_FETCH_TIMEOUT,
            MAX_IMAGE_BYTES,
            Redirects::Default,
        )
        .await
        .map_err(|_| "artwork_download_failed".to_owned())?;
    if !(200..300).contains(&response.status) {
        return Err("artwork_download_failed".to_owned());
    }
    let (ext, mime) =
        sniff_image_format(&response.body).ok_or("artwork_invalid_image")?;
    let base64 = encode_base64(&response.body);

    let file_path = if should_save_local_icon(slot, app_id) {
        let shortcuts = state.local_shortcuts().await?;
        let bytes = response.body;
        let ext_owned = ext.to_owned();
        tokio::task::spawn_blocking(move || {
            save_local_icon_bytes(app_id, &shortcuts, &ext_owned, &bytes)
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

pub async fn clear_local_artwork_file(
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
    let shortcuts = state.local_shortcuts().await?;
    let removed = tokio::task::spawn_blocking(move || {
        let Some(grid_dir) = shortcut_grid_dir(app_id, &shortcuts) else {
            return false;
        };
        let stem = slot.grid_stem(app_id);
        let mut any = false;
        for ext in GRID_EXTENSIONS {
            let path = grid_dir.join(format!("{stem}.{ext}"));
            if path.is_file() && fs::remove_file(path).is_ok() {
                any = true;
            }
        }
        any
    })
    .await
    .map_err(|error| error.to_string())?;
    Ok(json!({ "ok": true, "removed": removed }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_steam_icons_are_not_saved_locally() {
        assert!(!should_save_local_icon(ArtworkSlot::Icon, 1_090_150));
        assert!(should_save_local_icon(ArtworkSlot::Icon, 0x8000_0000));
        assert!(!should_save_local_icon(ArtworkSlot::Cover, 0x8000_0000));
    }
    use crate::http::{Fixture, Response};
    use reqwest::header::HeaderMap;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let id = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("dm-artwork-test-{}-{id}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn base64_and_magic_bytes_match_standard_formats() {
        assert_eq!(encode_base64(b""), "");
        assert_eq!(encode_base64(b"f"), "Zg==");
        assert_eq!(encode_base64(b"fo"), "Zm8=");
        assert_eq!(encode_base64(b"foo"), "Zm9v");
        assert_eq!(encode_base64(b"foobar"), "Zm9vYmFy");

        assert_eq!(sniff_image_format(b"\x89PNG\r\n\x1a\n1234"), Some(("png", "image/png")));
        assert_eq!(sniff_image_format(&[0xff, 0xd8, 0xff, 0xe0]), Some(("jpg", "image/jpeg")));
        assert_eq!(sniff_image_format(b"RIFF\x00\x00\x00\x00WEBP"), Some(("webp", "image/webp")));
        assert_eq!(sniff_image_format(b"<html>not an image</html>"), None);
    }

    #[test]
    fn steam_asset_url_allowlist_blocks_non_steam_hosts() {
        assert!(is_allowed_steam_asset_url(
            "https://shared.steamstatic.com/store_item_assets/steam/apps/1145350/library_capsule.jpg"
        ));
        assert!(is_allowed_steam_asset_url(
            "https://shared.fastly.steamstatic.com/community_assets/images/apps/1145350/abc.jpg"
        ));
        assert!(!is_allowed_steam_asset_url(
            "http://shared.steamstatic.com/store_item_assets/steam/apps/1145350/header.jpg"
        ));
        assert!(!is_allowed_steam_asset_url("https://evil.example/header.jpg"));
        assert!(!is_allowed_steam_asset_url("https://steamstatic.com.evil.example/header.jpg"));
        assert!(!is_allowed_steam_asset_url("https://user@shared.steamstatic.com/header.jpg"));
    }

    #[test]
    fn parses_store_browse_assets_preferring_2x_and_validating_icon_hash() {
        let payload = json!({
            "response": {
                "store_items": [{
                    "assets": {
                        "asset_url_format": "steam/apps/1145350/${FILENAME}",
                        "library_capsule": "library_600x900.jpg",
                        "library_capsule_2x": "abc/library_capsule_2x.jpg",
                        "header": "def/header.jpg",
                        "header_2x": "def/header_2x.jpg",
                        "library_hero": "library_hero.jpg",
                        "community_icon": "0123456789abcdef0123456789abcdef01234567"
                    }
                }]
            }
        });
        let parsed = parse_store_browse_assets(1145350, &payload);
        assert_eq!(
            parsed.cover.as_deref(),
            Some("https://shared.steamstatic.com/store_item_assets/steam/apps/1145350/abc/library_capsule_2x.jpg")
        );
        assert_eq!(
            parsed.wide.as_deref(),
            Some("https://shared.steamstatic.com/store_item_assets/steam/apps/1145350/def/header_2x.jpg")
        );
        assert_eq!(
            parsed.hero.as_deref(),
            Some("https://shared.steamstatic.com/store_item_assets/steam/apps/1145350/library_hero.jpg")
        );
        assert!(parsed.logo.is_none());
        assert_eq!(
            parsed.icon.as_deref(),
            Some("https://shared.steamstatic.com/community_assets/images/apps/1145350/0123456789abcdef0123456789abcdef01234567.jpg")
        );
    }

    #[test]
    fn summary_counts_missing_existing_and_locked_slots() {
        let root = temp_dir();
        let grid = root.join("grid");
        fs::create_dir_all(&grid).unwrap();
        let shortcut_file = root.join("shortcuts.vdf");
        fs::write(&shortcut_file, []).unwrap();
        let icon_file = root.join("custom.png");
        fs::write(&icon_file, b"\x89PNG\r\n\x1a\nxxxx").unwrap();
        // Game 1001: has cover + icon, missing wide/hero/logo.
        fs::write(grid.join("1001p.jpg"), &[0xff, 0xd8, 0xff, 0xe0]).unwrap();
        // Game 1002 (locked): has cover only.
        fs::write(grid.join("1002p.jpg"), &[0xff, 0xd8, 0xff, 0xe0]).unwrap();

        let shortcuts = vec![
            Shortcut {
                name: "Game A".into(),
                exe: "/bin/a".into(),
                exe_raw: "/bin/a".into(),
                start_dir: String::new(),
                launch_options: String::new(),
                shortcut_path: String::new(),
                icon: icon_file.to_string_lossy().into_owned(),
                appid_raw: None,
                app_id: 1001,
                source: "test",
                steam_user_id: "1".into(),
                shortcut_file: shortcut_file.clone(),
            },
            Shortcut {
                name: "Game B".into(),
                exe: "/bin/b".into(),
                exe_raw: "/bin/b".into(),
                start_dir: String::new(),
                launch_options: String::new(),
                shortcut_path: String::new(),
                icon: String::new(),
                appid_raw: None,
                app_id: 1002,
                source: "test",
                steam_user_id: "1".into(),
                shortcut_file,
            },
        ];
        let metadata = json!({
            "1001": {"steam_appid": 1145350},
            "1002": {"steam_appid": 504230},
            "1003": {"title": "Unmatched"}
        });
        let locks = json!({"1002": true});
        let settings = storage::default_artwork_settings();
        let summary = summarize_artwork_sync(
            &[1001, 1002, 1003],
            &metadata,
            &locks,
            &settings,
            &shortcuts,
            Some(&grid),
        );
        assert_eq!(summary["matched"], 2);
        assert_eq!(summary["complete"], 0);
        assert_eq!(summary["missing_games"], 2);
        assert_eq!(summary["locked_games"], 1);
        // Only unlocked game 1001 contributes to actionable bulk counts: 2 present, 3 missing.
        assert_eq!(summary["existing_enabled_slots"], 2);
        assert_eq!(summary["missing_slots"], 3);
        let _ = fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn delisted_fallback_probes_standard_cdn_and_caches_result() {
        let input = json!({
            "ids": [{"appid": 224060}],
            "context": {"language": "english", "country_code": "US"},
            "data_request": {"include_assets": true},
        });
        let mut browse_url = reqwest::Url::parse(STORE_BROWSE_URL).unwrap();
        browse_url
            .query_pairs_mut()
            .append_pair("input_json", &input.to_string());
        let ok_head = |url: &str| Fixture {
            method: Method::HEAD,
            url: url.to_owned(),
            result: Ok(Response {
                status: 200,
                headers: HeaderMap::new(),
                body: Vec::new(),
                url: url.to_owned(),
            }),
        };
        let miss_head = |url: &str| Fixture {
            method: Method::HEAD,
            url: url.to_owned(),
            result: Ok(Response {
                status: 404,
                headers: HeaderMap::new(),
                body: Vec::new(),
                url: url.to_owned(),
            }),
        };
        let http = Http::fixtures(vec![
            Fixture::json(browse_url.as_str(), json!({"response": {"store_items": []}})),
            miss_head("https://shared.steamstatic.com/store_item_assets/steam/apps/224060/library_600x900_2x.jpg"),
            ok_head("https://shared.steamstatic.com/store_item_assets/steam/apps/224060/library_600x900.jpg"),
            ok_head("https://shared.steamstatic.com/store_item_assets/steam/apps/224060/header.jpg"),
            ok_head("https://shared.steamstatic.com/store_item_assets/steam/apps/224060/library_hero.jpg"),
            ok_head("https://shared.steamstatic.com/store_item_assets/steam/apps/224060/logo_2x.png"),
        ]);
        let cache = Mutex::new(AssetCache::default());
        let first = resolve_steam_assets(&http, &cache, 224060).await;
        assert_eq!(
            first.cover.as_deref(),
            Some("https://shared.steamstatic.com/store_item_assets/steam/apps/224060/library_600x900.jpg")
        );
        assert!(first.wide.is_some());
        assert!(first.hero.is_some());
        assert_eq!(
            first.logo.as_deref(),
            Some("https://shared.steamstatic.com/store_item_assets/steam/apps/224060/logo_2x.png")
        );
        http.assert_drained();

        // Second call serves from cache with zero HTTP requests.
        let second = resolve_steam_assets(&http, &cache, 224060).await;
        assert_eq!(first, second);
    }

    #[tokio::test]
    async fn network_failure_is_not_cached() {
        let input = json!({
            "ids": [{"appid": 224060}],
            "context": {"language": "english", "country_code": "US"},
            "data_request": {"include_assets": true},
        });
        let mut browse_url = reqwest::Url::parse(STORE_BROWSE_URL).unwrap();
        browse_url
            .query_pairs_mut()
            .append_pair("input_json", &input.to_string());
        let down = |method: Method, url: &str| Fixture {
            method,
            url: url.to_owned(),
            result: Err("network down".to_owned()),
        };
        let cdn = "https://shared.steamstatic.com/store_item_assets/steam/apps/224060/";
        let mut fixtures = vec![down(Method::GET, browse_url.as_str())];
        for file in [
            "library_600x900_2x.jpg",
            "library_600x900.jpg",
            "header.jpg",
            "library_hero.jpg",
            "logo_2x.png",
            "logo.png",
        ] {
            fixtures.push(down(Method::HEAD, &format!("{cdn}{file}")));
        }
        let http = Http::fixtures(fixtures);
        let cache = Mutex::new(AssetCache::default());
        let resolved = resolve_steam_assets(&http, &cache, 224060).await;
        assert_eq!(resolved, ResolvedSteamAssets::default());
        http.assert_drained();
        assert!(cache.lock().await.get(224060).is_none());
    }
}
