use crate::matching::{py_truthy as json_truthy, safe_int};
use chrono::{Datelike, Local, TimeZone};
use serde_json::{Map, Number, Value, json};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncReadExt;

pub const RELEASE_DATE_FORMAT: &str = "date-only-v1";
pub const SETTINGS_FILE_NAME: &str = "decky_metadata.json";
const TRAILER_QUALITIES: &[i64] = &[720, 1080, 1440, 2160];
const PROTONDB_COVER_POSITIONS: &[&str] = &["bottom-left", "top-left", "top-right"];

pub struct Storage {
    data: Value,
    path: PathBuf,
    mtime_ns: Option<i128>,
}

impl Storage {
    pub async fn open(settings_dir: PathBuf) -> Result<Self, String> {
        tokio::fs::create_dir_all(&settings_dir)
            .await
            .map_err(|error| format!("failed creating settings directory: {error}"))?;
        let path = settings_dir.join(SETTINGS_FILE_NAME);
        match load_file(&path).await {
            Ok((mut data, mut mtime_ns)) => {
                if migrate_release_dates(&mut data)? {
                    mtime_ns = write_atomic(&path, &data).await?;
                }
                Ok(Self {
                    data: normalize_loaded_data(data)?,
                    path,
                    mtime_ns,
                })
            }
            Err(LoadError::Missing) => {
                let data = default_data();
                let mtime_ns = write_atomic(&path, &data).await?;
                Ok(Self {
                    data,
                    path,
                    mtime_ns,
                })
            }
            Err(LoadError::Failure(error)) => Err(error),
        }
    }

    pub async fn refresh(&mut self) -> Result<bool, String> {
        match file_mtime_ns(&self.path).await {
            Ok(Some(mtime_ns)) if self.mtime_ns == Some(mtime_ns) => return Ok(false),
            Ok(Some(_)) => {}
            Ok(None) => {
                let data = default_data();
                let mtime_ns = write_atomic(&self.path, &data).await?;
                self.data = data;
                self.mtime_ns = mtime_ns;
                return Ok(true);
            }
            Err(error) => return Err(error),
        }

        let (mut data, mut mtime_ns) = match load_file(&self.path).await {
            Ok(loaded) => loaded,
            Err(LoadError::Missing) => {
                let data = default_data();
                let mtime_ns = write_atomic(&self.path, &data).await?;
                self.data = data;
                self.mtime_ns = mtime_ns;
                return Ok(true);
            }
            Err(LoadError::Failure(error)) => return Err(error),
        };
        if migrate_release_dates(&mut data)? {
            mtime_ns = write_atomic(&self.path, &data).await?;
        }
        self.data = normalize_loaded_data(data)?;
        self.mtime_ns = mtime_ns;
        Ok(true)
    }

    pub fn data(&self) -> &Value {
        &self.data
    }

    pub async fn replace(&mut self, next: Value) -> Result<(), String> {
        if !next.is_object() {
            return Err("metadata settings must be a JSON object".to_owned());
        }
        self.refresh().await?;
        let mtime_ns = write_atomic(&self.path, &next).await?;
        self.data = next;
        self.mtime_ns = mtime_ns;
        Ok(())
    }

    /// The owner refreshes and normalizes once under its mutex before staging a mutation.
    pub async fn transaction<R>(
        &mut self,
        mutation: impl FnOnce(&mut StoreTransaction<'_>) -> Result<R, String>,
    ) -> Result<R, String> {
        let mut transaction = StoreTransaction::new(&mut self.data);
        let value = match mutation(&mut transaction) {
            Ok(value) => value,
            Err(error) => {
                transaction.rollback();
                return Err(error);
            }
        };
        let changed = !transaction.undo.is_empty();
        let undo = std::mem::take(&mut transaction.undo);
        drop(transaction);
        if !changed {
            return Ok(value);
        }
        match write_atomic(&self.path, &self.data).await {
            Ok(mtime_ns) => {
                self.mtime_ns = mtime_ns;
                Ok(value)
            }
            Err(error) => {
                rollback_changes(&mut self.data, undo);
                Err(error)
            }
        }
    }

    /// Store normalization remains visible in memory even when its best-effort save fails.
    pub async fn normalize_loaded_store_states(&mut self, cached_index: Option<&Value>) -> bool {
        let changed = normalize_store_states(&mut self.data, cached_index);
        if changed {
            match write_atomic(&self.path, &self.data).await {
                Ok(mtime_ns) => self.mtime_ns = mtime_ns,
                Err(error) => {
                    log::error!("failed persisting normalized Steam store states: {error}")
                }
            }
        }
        changed
    }
}

pub struct StoreTransaction<'a> {
    data: &'a mut Value,
    undo: Vec<(Vec<String>, Option<Value>)>,
}

impl<'a> StoreTransaction<'a> {
    fn new(data: &'a mut Value) -> Self {
        Self {
            data,
            undo: Vec::new(),
        }
    }

    pub fn get(&self, path: &[&str]) -> Option<&Value> {
        value_at(self.data, path)
    }

    pub fn set(&mut self, path: &[&str], value: Value) -> Result<(), String> {
        if path.is_empty() {
            return Err("cannot replace storage root through a transaction".to_owned());
        }
        if !self.data.is_object() {
            return Err("metadata settings must be a JSON object".to_owned());
        }
        for depth in 1..path.len() {
            let prefix = &path[..depth];
            let parent = value_at(self.data, prefix);
            if parent.is_some_and(Value::is_object) {
                continue;
            }
            self.remember(prefix);
            set_at(self.data, prefix, Value::Object(Map::new()))?;
        }
        self.remember(path);
        set_at(self.data, path, value)
    }

    pub fn remove(&mut self, path: &[&str]) -> Result<Option<Value>, String> {
        if path.is_empty() {
            return Err("cannot remove storage root through a transaction".to_owned());
        }
        if value_at(self.data, path).is_none() {
            return Ok(None);
        }
        self.remember(path);
        remove_at(self.data, path)
    }

    pub fn edit<R>(
        &mut self,
        path: &[&str],
        update: impl FnOnce(&mut Value) -> Result<R, String>,
    ) -> Result<R, String> {
        if path.is_empty() || value_at(self.data, path).is_none() {
            return Err("storage transaction target is missing".to_owned());
        }
        self.remember(path);
        update(value_at_mut(self.data, path).expect("path checked above"))
    }

    fn remember(&mut self, path: &[&str]) {
        if self
            .undo
            .iter()
            .any(|(saved, _)| saved.iter().map(String::as_str).eq(path.iter().copied()))
        {
            return;
        }
        let previous = value_at(self.data, path).cloned();
        self.undo.push((
            path.iter().map(|part| (*part).to_owned()).collect(),
            previous,
        ));
    }

    fn rollback(&mut self) {
        rollback_changes(self.data, std::mem::take(&mut self.undo));
    }
}

fn rollback_changes(data: &mut Value, changes: Vec<(Vec<String>, Option<Value>)>) {
    for (path, previous) in changes.into_iter().rev() {
        let path: Vec<&str> = path.iter().map(String::as_str).collect();
        match previous {
            Some(value) => {
                let _ = set_at(data, &path, value);
            }
            None => {
                let _ = remove_at(data, &path);
            }
        }
    }
}

fn value_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    path.iter()
        .try_fold(value, |value, key| value.as_object()?.get(*key))
}

fn value_at_mut<'a>(value: &'a mut Value, path: &[&str]) -> Option<&'a mut Value> {
    let (last, parents) = path.split_last()?;
    let mut value = value;
    for key in parents {
        value = value.as_object_mut()?.get_mut(*key)?;
    }
    value.as_object_mut()?.get_mut(*last)
}

fn set_at(value: &mut Value, path: &[&str], next: Value) -> Result<(), String> {
    let (last, parents) = path
        .split_last()
        .ok_or_else(|| "empty storage path".to_owned())?;
    let mut object = value;
    for key in parents {
        object = object
            .as_object_mut()
            .and_then(|object| object.get_mut(*key))
            .ok_or_else(|| "storage transaction parent is missing".to_owned())?;
    }
    object
        .as_object_mut()
        .ok_or_else(|| "storage transaction parent is not an object".to_owned())?
        .insert((*last).to_owned(), next);
    Ok(())
}

fn remove_at(value: &mut Value, path: &[&str]) -> Result<Option<Value>, String> {
    let (last, parents) = path
        .split_last()
        .ok_or_else(|| "empty storage path".to_owned())?;
    let mut object = value;
    for key in parents {
        let Some(child) = object
            .as_object_mut()
            .and_then(|object| object.get_mut(*key))
        else {
            return Ok(None);
        };
        object = child;
    }
    Ok(object
        .as_object_mut()
        .and_then(|object| object.remove(*last)))
}

pub fn default_data() -> Value {
    json!({
        "release_date_format": RELEASE_DATE_FORMAT,
        "metadata": {},
        "shortcut_names": {},
        "settings": default_settings(),
        "update_settings": {},
        "update_check_cache": {},
    })
}

pub fn default_settings() -> Value {
    json!({
        "debug_logging": false,
        "deck_compat_default": null,
        "game_trailers": default_trailer_settings(),
        "mini_achievements_enabled": false,
        "protondb_badges": default_protondb_badge_settings(),
    })
}

pub fn default_trailer_settings() -> Value {
    json!({
        "enabled": false,
        "detailEnabled": true,
        "homeEnabled": false,
        "audioEnabled": false,
        "quality": "auto",
        "hideLogoDuringTrailer": false,
        "detailFadeInDelaySeconds": 3,
        "homeFadeInDelaySeconds": 3,
    })
}

pub fn default_protondb_badge_settings() -> Value {
    json!({
        "enabled": false,
        "home": true,
        "library": true,
        "gameView": true,
        "store": true,
        "focusOnly": false,
        "coverPosition": "bottom-left",
    })
}

pub fn normalize_settings(saved: Option<&Value>) -> Value {
    normalize_settings_owned(saved.cloned())
}

fn normalize_settings_owned(saved: Option<Value>) -> Value {
    let mut saved = match saved {
        Some(Value::Object(saved)) => saved,
        _ => Map::new(),
    };
    let debug_logging = saved
        .remove("debug_logging")
        .is_some_and(|value| json_truthy(&value));
    let game_trailers = saved.remove("game_trailers");
    let compatibility = saved.remove("deck_compat_default");
    let mini_achievements = saved.remove("mini_achievements_enabled");
    let protondb = saved.remove("protondb_badges");
    let has_scope = saved.contains_key("deck_compat_default_scope");
    let scope = saved.remove("deck_compat_default_scope");
    let legacy_scope = saved.remove("deck_compat_default_matched_only");
    let has_legacy_scope = legacy_scope.is_some();

    let mut normalized = default_settings().as_object().cloned().unwrap_or_default();
    normalized.extend(saved);
    normalized.insert("debug_logging".to_owned(), Value::Bool(debug_logging));
    if let Some(value) = game_trailers {
        normalized.insert(
            "game_trailers".to_owned(),
            normalize_trailer_settings(&value),
        );
    } else {
        normalized.remove("game_trailers");
    }
    if let Some(value) = compatibility {
        normalized.insert(
            "deck_compat_default".to_owned(),
            compatibility_default(&value).map_or(Value::Null, Value::from),
        );
    } else {
        normalized.remove("deck_compat_default");
    }
    if let Some(value) = mini_achievements {
        normalized.insert(
            "mini_achievements_enabled".to_owned(),
            Value::Bool(value.as_bool().unwrap_or(false)),
        );
    } else {
        normalized.remove("mini_achievements_enabled");
    }
    if let Some(value) = protondb {
        normalized.insert(
            "protondb_badges".to_owned(),
            normalize_protondb_badge_settings(&value),
        );
    } else {
        normalized.remove("protondb_badges");
    }

    if has_scope || has_legacy_scope {
        let canonical = scope.as_ref().and_then(compatibility_default_scope);
        let fallback = if legacy_scope.as_ref().and_then(Value::as_bool) == Some(true) {
            "metadata"
        } else {
            "all"
        };
        normalized.insert(
            "deck_compat_default_scope".to_owned(),
            Value::String(canonical.unwrap_or(fallback).to_owned()),
        );
    } else {
        normalized.remove("deck_compat_default_scope");
    }
    Value::Object(normalized)
}

pub fn normalize_trailer_settings(value: &Value) -> Value {
    let source = value.as_object();
    let mut normalized = default_trailer_settings()
        .as_object()
        .cloned()
        .unwrap_or_default();
    for key in [
        "enabled",
        "detailEnabled",
        "homeEnabled",
        "audioEnabled",
        "hideLogoDuringTrailer",
    ] {
        if let Some(value) = source
            .and_then(|source| source.get(key))
            .and_then(Value::as_bool)
        {
            normalized.insert(key.to_owned(), Value::Bool(value));
        }
    }
    let quality = source.and_then(|source| source.get("quality"));
    if let Some(quality) = quality.filter(|value| valid_trailer_quality(value)) {
        normalized.insert("quality".to_owned(), quality.clone());
    }
    let detail_delay = source
        .and_then(|source| source.get("detailFadeInDelaySeconds"))
        .or_else(|| source.and_then(|source| source.get("fadeInDelaySeconds")));
    let home_delay = source.and_then(|source| source.get("homeFadeInDelaySeconds"));
    for (key, value) in [
        ("detailFadeInDelaySeconds", detail_delay),
        ("homeFadeInDelaySeconds", home_delay),
    ] {
        if let Some(value) = value.filter(|value| valid_delay(value)) {
            normalized.insert(key.to_owned(), value.clone());
        }
    }
    Value::Object(normalized)
}

pub fn normalize_protondb_badge_settings(value: &Value) -> Value {
    let source = value.as_object();
    let mut normalized = default_protondb_badge_settings()
        .as_object()
        .cloned()
        .unwrap_or_default();
    for key in [
        "enabled",
        "home",
        "library",
        "gameView",
        "store",
        "focusOnly",
    ] {
        if let Some(value) = source
            .and_then(|source| source.get(key))
            .and_then(Value::as_bool)
        {
            normalized.insert(key.to_owned(), Value::Bool(value));
        }
    }
    if let Some(position) = source
        .and_then(|source| source.get("coverPosition"))
        .and_then(Value::as_str)
        .filter(|position| PROTONDB_COVER_POSITIONS.contains(position))
    {
        normalized.insert(
            "coverPosition".to_owned(),
            Value::String(position.to_owned()),
        );
    }
    Value::Object(normalized)
}

pub fn compatibility_default(value: &Value) -> Option<i64> {
    if value.is_boolean() {
        return None;
    }
    integer(value).filter(|value| (0..=3).contains(value))
}

pub fn compatibility_default_scope(value: &Value) -> Option<&str> {
    match value.as_str()? {
        scope @ ("steam" | "no-steam" | "metadata" | "all") => Some(scope),
        _ => None,
    }
}

pub fn validate_compatibility_default(value: &Value) -> Result<Value, String> {
    if value.is_null() {
        return Ok(Value::Null);
    }
    compatibility_default(value)
        .map(Value::from)
        .ok_or_else(|| "invalid compatibility default".to_owned())
}

pub fn validate_compatibility_default_scope(value: &Value) -> Result<String, String> {
    compatibility_default_scope(value)
        .map(str::to_owned)
        .ok_or_else(|| "invalid compatibility default scope".to_owned())
}

pub fn validate_trailer_settings(value: &Value) -> Result<Value, String> {
    let source = value
        .as_object()
        .ok_or_else(|| "invalid trailer settings".to_owned())?;
    let expected = default_trailer_settings()
        .as_object()
        .cloned()
        .unwrap_or_default();
    if source.len() != expected.len() || expected.keys().any(|key| !source.contains_key(key)) {
        return Err("invalid trailer settings".to_owned());
    }
    for key in [
        "enabled",
        "detailEnabled",
        "homeEnabled",
        "audioEnabled",
        "hideLogoDuringTrailer",
    ] {
        if !source.get(key).is_some_and(Value::is_boolean) {
            return Err("invalid trailer settings".to_owned());
        }
    }
    if !source.get("quality").is_some_and(valid_trailer_quality)
        || !source
            .get("detailFadeInDelaySeconds")
            .is_some_and(valid_delay)
        || !source
            .get("homeFadeInDelaySeconds")
            .is_some_and(valid_delay)
    {
        return Err("invalid trailer settings".to_owned());
    }
    Ok(Value::Object(source.clone()))
}

pub fn validate_protondb_badge_settings(value: &Value) -> Result<Value, String> {
    let source = value
        .as_object()
        .ok_or_else(|| "invalid ProtonDB badge settings".to_owned())?;
    let expected = default_protondb_badge_settings()
        .as_object()
        .cloned()
        .unwrap_or_default();
    if source.len() != expected.len()
        || expected.keys().any(|key| !source.contains_key(key))
        || [
            "enabled",
            "home",
            "library",
            "gameView",
            "store",
            "focusOnly",
        ]
        .iter()
        .any(|key| !source.get(*key).is_some_and(Value::is_boolean))
        || !source
            .get("coverPosition")
            .and_then(Value::as_str)
            .is_some_and(|position| PROTONDB_COVER_POSITIONS.contains(&position))
    {
        return Err("invalid ProtonDB badge settings".to_owned());
    }
    Ok(normalize_protondb_badge_settings(value))
}

pub fn validate_mini_achievements_enabled(value: &Value) -> Result<bool, String> {
    value
        .as_bool()
        .ok_or_else(|| "invalid mini achievements setting".to_owned())
}

pub fn validate_shortcut_name(value: &Value) -> Option<&str> {
    let value = value.as_str()?;
    is_safe_shortcut_name(value).then_some(value)
}

fn is_safe_shortcut_name(value: &str) -> bool {
    !value.is_empty() && !value.contains('\0') && value.chars().count() <= 512
}

pub fn positive_shortcut_app_id(value: &Value) -> Option<u32> {
    if value.is_boolean() {
        return None;
    }
    let parsed = match value {
        Value::Number(number) => integer_cast(number)?,
        Value::String(value) => parse_python_integer(value)?,
        _ => return None,
    };
    (parsed > 0 && parsed <= u32::MAX as i128).then_some(parsed as u32)
}

pub fn stored_shortcut_name_state(value: &Value) -> Option<Value> {
    let state = value.as_object()?;
    let original_name = validate_shortcut_name(state.get("original_name")?)?;
    let applied_name = validate_shortcut_name(state.get("applied_name")?)?;
    let steam_appid = positive_shortcut_app_id(state.get("steam_appid")?)?;
    let updated_at = python_int(state.get("updated_at")).unwrap_or(0);
    if updated_at < 0 {
        return None;
    }
    Some(json!({
        "original_name": original_name,
        "applied_name": applied_name,
        "steam_appid": steam_appid,
        "updated_at": updated_at,
    }))
}

pub fn build_shortcut_name_state(
    existing: Option<&Value>,
    current_record: Option<&Value>,
    original_name: &str,
    applied_name: &str,
    steam_appid: u32,
    updated_at: i64,
) -> Result<Value, String> {
    if !is_safe_shortcut_name(original_name)
        || !is_safe_shortcut_name(applied_name)
        || steam_appid == 0
    {
        return Err("invalid shortcut name state".to_owned());
    }
    let Some(record) = current_record.and_then(Value::as_object) else {
        return Err("metadata mismatch".to_owned());
    };
    let current_steam_appid = record.get("steam_appid").and_then(safe_int);
    if current_steam_appid != Some(steam_appid as i64)
        || record.get("steam_store_name").and_then(Value::as_str) != Some(applied_name)
    {
        return Err("metadata mismatch".to_owned());
    }
    let first_original = existing
        .and_then(stored_shortcut_name_state)
        .and_then(|state| {
            state
                .get("original_name")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| original_name.to_owned());
    Ok(json!({
        "original_name": first_original,
        "applied_name": applied_name,
        "steam_appid": steam_appid,
        "updated_at": updated_at,
    }))
}

/// Normalizes loaded states using only a previously cached delisted index.
pub fn normalize_store_states(data: &mut Value, cached_index: Option<&Value>) -> bool {
    let Some(metadata) = data.get_mut("metadata").and_then(Value::as_object_mut) else {
        return false;
    };
    let mut changed = false;
    for record in metadata.values_mut().filter_map(Value::as_object_mut) {
        let raw = record.get("steam_store_state");
        let normalized = raw
            .and_then(Value::as_str)
            .map(str::trim)
            .map(str::to_ascii_lowercase)
            .filter(|state| matches!(state.as_str(), "available" | "delisted" | "unknown"));
        let normalized = normalized.unwrap_or_else(|| {
            let appid = record.get("steam_appid").and_then(safe_int);
            if appid.is_some_and(|appid| cached_delisted(cached_index, appid)) {
                "delisted".to_owned()
            } else {
                "unknown".to_owned()
            }
        });
        if raw.and_then(Value::as_str) != Some(normalized.as_str()) {
            record.insert("steam_store_state".to_owned(), Value::String(normalized));
            changed = true;
        }
    }
    changed
}

pub fn migrate_release_dates(payload: &mut Value) -> Result<bool, String> {
    if payload.get("release_date_format").and_then(Value::as_str) == Some(RELEASE_DATE_FORMAT) {
        return Ok(false);
    }
    if let Some(metadata) = payload.get_mut("metadata") {
        if !json_truthy(metadata) {
            // An empty or null legacy metadata field behaves like an empty mapping.
        } else if !metadata.is_object() {
            return Err("metadata settings field must be an object".to_owned());
        } else if let Some(records) = metadata.as_object_mut() {
            for record in records.values_mut().filter_map(Value::as_object_mut) {
                let Some(value) = record.get("release_date").cloned() else {
                    continue;
                };
                let canonical = crate::matching::normalize_release_date(&value);
                if value
                    .as_str()
                    .is_some_and(|value| canonical.as_deref() == Some(value))
                {
                    continue;
                }
                let converted = legacy_timestamp(&value)
                    .and_then(local_calendar_date)
                    .map(Value::String)
                    .unwrap_or(Value::Null);
                record.insert("release_date".to_owned(), converted);
            }
        }
    }
    payload
        .as_object_mut()
        .ok_or_else(|| "metadata settings must be a JSON object".to_owned())?
        .insert(
            "release_date_format".to_owned(),
            Value::String(RELEASE_DATE_FORMAT.to_owned()),
        );
    Ok(true)
}

fn normalize_loaded_data(payload: Value) -> Result<Value, String> {
    let Value::Object(mut source) = payload else {
        return Err("metadata settings must be a JSON object".to_owned());
    };
    let release_date_format = source
        .remove("release_date_format")
        .unwrap_or_else(|| Value::String(RELEASE_DATE_FORMAT.to_owned()));
    let metadata = truthy_object(source.remove("metadata"), "metadata")?;
    let shortcut_names = match source.remove("shortcut_names") {
        Some(Value::Object(shortcut_names)) => Value::Object(shortcut_names),
        _ => Value::Object(Map::new()),
    };
    let settings = normalize_settings_owned(source.remove("settings"));
    let update_settings = truthy_object(source.remove("update_settings"), "update_settings")?;
    let update_check_cache =
        truthy_object(source.remove("update_check_cache"), "update_check_cache")?;
    let mut merged = Map::new();
    merged.insert("release_date_format".to_owned(), release_date_format);
    merged.insert("metadata".to_owned(), metadata);
    merged.insert("shortcut_names".to_owned(), shortcut_names);
    merged.insert("settings".to_owned(), settings);
    merged.insert("update_settings".to_owned(), update_settings);
    merged.insert("update_check_cache".to_owned(), update_check_cache);
    merged.extend(source);
    Ok(Value::Object(merged))
}

fn truthy_object(value: Option<Value>, name: &str) -> Result<Value, String> {
    match value {
        None => Ok(Value::Object(Map::new())),
        Some(value) if !json_truthy(&value) => Ok(Value::Object(Map::new())),
        Some(value @ Value::Object(_)) => Ok(value),
        Some(_) => Err(format!("{name} settings field must be an object")),
    }
}

fn cached_delisted(index: Option<&Value>, appid: i64) -> bool {
    index
        .and_then(|index| index.get("apps"))
        .and_then(Value::as_array)
        .is_some_and(|rows| {
            rows.iter().any(|row| {
                row.as_array()
                    .and_then(|row| row.first())
                    .and_then(safe_int)
                    == Some(appid)
            })
        })
}

fn integer(value: &Value) -> Option<i64> {
    let number = value.as_number()?;
    (!number.is_f64()).then(|| number.as_i64()).flatten()
}

fn integer_cast(number: &Number) -> Option<i128> {
    if !number.is_f64() {
        return number
            .as_i64()
            .map(i128::from)
            .or_else(|| number.as_u64().map(i128::from));
    }
    let number = number.as_f64()?;
    if !number.is_finite()
        || number.trunc() < i128::MIN as f64
        || number.trunc() >= -(i128::MIN as f64)
    {
        return None;
    }
    Some(number.trunc() as i128)
}

fn python_int(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Bool(value) => Some(if *value { 1 } else { 0 }),
        Value::Number(number) => integer_cast(number).and_then(|value| i64::try_from(value).ok()),
        Value::String(value) => {
            parse_python_integer(value).and_then(|value| i64::try_from(value).ok())
        }
        _ => None,
    }
}

pub(crate) fn parse_python_integer(value: &str) -> Option<i128> {
    let value = value.trim();
    let negative = value.starts_with('-');
    let digits = value.strip_prefix(['+', '-']).unwrap_or(value);
    let mut characters = digits.chars().peekable();
    characters.peek()?;
    let mut magnitude = 0_u128;
    let mut previous_digit = false;
    while let Some(character) = characters.next() {
        if let Some(digit) = crate::matching::decimal_digit(character) {
            magnitude = magnitude.checked_mul(10)?.checked_add(u128::from(digit))?;
            previous_digit = true;
        } else if character == '_'
            && previous_digit
            && characters
                .peek()
                .is_some_and(|next| crate::matching::decimal_digit(*next).is_some())
        {
            previous_digit = false;
        } else {
            return None;
        }
    }
    if negative {
        let min_magnitude = i128::MAX as u128 + 1;
        if magnitude == min_magnitude {
            Some(i128::MIN)
        } else {
            (magnitude <= i128::MAX as u128).then_some(-(magnitude as i128))
        }
    } else {
        (magnitude <= i128::MAX as u128).then_some(magnitude as i128)
    }
}

fn legacy_timestamp(value: &Value) -> Option<i64> {
    if value.is_boolean() {
        return None;
    }
    let value = match value {
        Value::Number(number) => integer_cast(number)?,
        Value::String(value) => parse_python_integer(value)?,
        _ => return None,
    };
    (value > 0).then(|| i64::try_from(value).ok()).flatten()
}

fn local_calendar_date(timestamp: i64) -> Option<String> {
    let date = Local.timestamp_opt(timestamp, 0).single()?.date_naive();
    if !(1..=9999).contains(&date.year()) {
        return None;
    }
    Some(format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        date.month(),
        date.day()
    ))
}

fn valid_trailer_quality(value: &Value) -> bool {
    value.as_str() == Some("auto")
        || integer(value).is_some_and(|quality| TRAILER_QUALITIES.contains(&quality))
}

fn valid_delay(value: &Value) -> bool {
    integer(value).is_some_and(|delay| (0..=10).contains(&delay))
}

async fn load_file(path: &Path) -> Result<(Value, Option<i128>), LoadError> {
    let mut file = match tokio::fs::File::open(path).await {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(LoadError::Missing);
        }
        Err(error) => {
            return Err(LoadError::Failure(format!(
                "failed reading metadata settings: {error}"
            )));
        }
    };
    let mtime_ns = match file.metadata().await {
        Ok(metadata) => modified_ns(metadata.modified().ok()),
        Err(error) => {
            return Err(LoadError::Failure(format!(
                "failed stat metadata settings: {error}"
            )));
        }
    };
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).await.map_err(|error| {
        LoadError::Failure(format!("failed reading metadata settings: {error}"))
    })?;
    let value = serde_json::from_slice::<Value>(&bytes).map_err(|error| {
        LoadError::Failure(format!("failed reading metadata settings: {error}"))
    })?;
    if !value.is_object() {
        return Err(LoadError::Failure(
            "metadata settings must be a JSON object".to_owned(),
        ));
    }
    Ok((value, mtime_ns))
}

async fn file_mtime_ns(path: &Path) -> Result<Option<i128>, String> {
    match tokio::fs::metadata(path).await {
        Ok(metadata) => Ok(modified_ns(metadata.modified().ok())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("failed stat metadata settings: {error}")),
    }
}

fn modified_ns(time: Option<SystemTime>) -> Option<i128> {
    let time = time?;
    match time.duration_since(UNIX_EPOCH) {
        Ok(duration) => {
            Some(duration.as_secs() as i128 * 1_000_000_000 + duration.subsec_nanos() as i128)
        }
        Err(error) => {
            let duration = error.duration();
            Some(-(duration.as_secs() as i128 * 1_000_000_000 + duration.subsec_nanos() as i128))
        }
    }
}

async fn write_atomic(path: &Path, data: &Value) -> Result<Option<i128>, String> {
    if !data.is_object() {
        return Err("metadata settings must be a JSON object".to_owned());
    }
    let encoded = serde_json::to_vec_pretty(data).map_err(|error| error.to_string())?;
    let name = path
        .file_name()
        .ok_or_else(|| "metadata settings path has no file name".to_owned())?;
    let temp_path = path.with_file_name(format!("{}.tmp", name.to_string_lossy()));
    if let Err(error) = tokio::fs::write(&temp_path, encoded).await {
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err(format!("failed writing metadata settings: {error}"));
    }
    if let Err(error) = tokio::fs::rename(&temp_path, path).await {
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err(format!("failed replacing metadata settings: {error}"));
    }
    Ok(file_mtime_ns(path).await.ok().flatten())
}

enum LoadError {
    Missing,
    Failure(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tokio::sync::Mutex;

    static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let id = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
            let path =
                std::env::temp_dir().join(format!("metadata-storage-{}-{id}", std::process::id()));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn settings(path: &Value) -> &Value {
        path.get("settings").expect("settings present")
    }

    #[test]
    fn settings_normalize_per_field_and_validate_strictly() {
        let saved = json!({
            "enabled": "true", "detailEnabled": false, "homeEnabled": true,
            "audioEnabled": 1, "quality": 1080, "hideLogoDuringTrailer": true,
            "fadeInDelaySeconds": 9, "detailFadeInDelaySeconds": false,
            "homeFadeInDelaySeconds": 0,
        });
        let normalized = normalize_trailer_settings(&saved);
        assert_eq!(normalized["enabled"], false);
        assert_eq!(normalized["detailEnabled"], false);
        assert_eq!(normalized["homeEnabled"], true);
        assert_eq!(normalized["audioEnabled"], false);
        assert_eq!(normalized["quality"], 1080);
        assert_eq!(normalized["detailFadeInDelaySeconds"], 3);
        assert_eq!(normalized["homeFadeInDelaySeconds"], 0);
        assert_eq!(
            normalize_trailer_settings(&json!({"quality": 720.0}))["quality"],
            "auto"
        );
        assert!(validate_trailer_settings(&normalized).is_ok());

        let valid = default_trailer_settings();
        assert_eq!(validate_trailer_settings(&valid).unwrap(), valid);
        assert!(validate_trailer_settings(&json!({"enabled": true})).is_err());
        assert_eq!(compatibility_default(&json!(true)), None);
        assert_eq!(compatibility_default(&json!(3)), Some(3));
        assert!(validate_compatibility_default(&json!("2")).is_err());
        assert!(validate_mini_achievements_enabled(&json!(1)).is_err());
    }

    #[test]
    fn legacy_scopes_and_unknown_settings_follow_loaded_key_presence() {
        let legacy = normalize_settings(Some(&json!({
            "deck_compat_default_matched_only": true,
            "unrelated": {"keep": true},
        })));
        assert_eq!(legacy["deck_compat_default_scope"], "metadata");
        assert!(legacy.get("deck_compat_default_matched_only").is_none());
        assert_eq!(legacy["unrelated"]["keep"], true);
        let no_scope = normalize_settings(Some(&json!({"debug_logging": false})));
        assert!(no_scope.get("deck_compat_default_scope").is_none());
        assert!(no_scope.get("game_trailers").is_none());
        let invalid_scope = normalize_settings(Some(&json!({
            "deck_compat_default_scope": "bad",
            "deck_compat_default_matched_only": false,
        })));
        assert_eq!(invalid_scope["deck_compat_default_scope"], "all");

        let badges = default_protondb_badge_settings();
        assert_eq!(validate_protondb_badge_settings(&badges).unwrap(), badges);
        assert!(validate_protondb_badge_settings(&json!({"enabled": true})).is_err());
        assert_eq!(
            normalize_protondb_badge_settings(&json!({"enabled": "true", "focusOnly": true}))["enabled"],
            false
        );
    }

    #[test]
    fn date_migration_converts_only_legacy_values_and_keeps_unknown_fields() {
        let mut payload = json!({
            "metadata": {
                "number": {"release_date": 1710057600},
                "numeric_string": {"release_date": "1710057600"},
                "canonical": {"release_date": "2024-02-29"},
                "datetime": {"release_date": "2024-03-10T00:00:00Z"},
                "zero": {"release_date": 0},
                "boolean": {"release_date": true},
                "invalid": {"release_date": "soon"},
                "huge": {"release_date": "99999999999999999999999999999999999"},
                "null": {"release_date": null},
                "missing": {"title": "No date"},
            },
            "unknown_root": {"keep": true},
        });
        assert!(migrate_release_dates(&mut payload).unwrap());
        assert!(payload["metadata"]["number"]["release_date"].is_string());
        assert_eq!(
            payload["metadata"]["number"]["release_date"],
            payload["metadata"]["numeric_string"]["release_date"]
        );
        assert_eq!(
            payload["metadata"]["canonical"]["release_date"],
            "2024-02-29"
        );
        for key in ["datetime", "zero", "boolean", "invalid", "huge", "null"] {
            assert_eq!(payload["metadata"][key]["release_date"], Value::Null);
        }
        assert!(payload["metadata"]["missing"].get("release_date").is_none());
        assert_eq!(payload["unknown_root"]["keep"], true);
        assert_eq!(payload["release_date_format"], RELEASE_DATE_FORMAT);
        let before = payload["metadata"]["canonical"]["release_date"].clone();
        assert!(!migrate_release_dates(&mut payload).unwrap());
        assert_eq!(payload["metadata"]["canonical"]["release_date"], before);
    }

    #[test]
    fn loaded_store_states_use_only_the_cached_delisted_index() {
        let mut data = json!({"metadata": {
            "indexed": {"steam_appid": 11},
            "available": {"steam_store_state": " AVAILABLE "},
            "preserved": {"steam_store_state": "delisted", "steam_appid": 11},
            "unknown": {"steam_appid": 12, "steam_store_state": "bogus"},
        }});
        let cached = json!({"apps": [[11, "Removed"]]});
        assert!(normalize_store_states(&mut data, Some(&cached)));
        assert_eq!(data["metadata"]["indexed"]["steam_store_state"], "delisted");
        assert_eq!(
            data["metadata"]["available"]["steam_store_state"],
            "available"
        );
        assert_eq!(
            data["metadata"]["preserved"]["steam_store_state"],
            "delisted"
        );
        assert_eq!(data["metadata"]["unknown"]["steam_store_state"], "unknown");
        assert!(!normalize_store_states(&mut data, Some(&cached)));
    }

    #[test]
    fn shortcut_history_validates_names_preserves_first_original_and_checks_current_match() {
        assert!(validate_shortcut_name(&json!("")).is_none());
        assert!(validate_shortcut_name(&json!("bad\0name")).is_none());
        assert!(validate_shortcut_name(&json!("x".repeat(513))).is_none());
        assert!(validate_shortcut_name(&json!("™".repeat(512))).is_some());
        let record = json!({"steam_appid": "15100", "steam_store_name": "Current"});
        let first =
            build_shortcut_name_state(None, Some(&record), "Original", "Current", 15100, 10)
                .unwrap();
        let second = build_shortcut_name_state(
            Some(&first),
            Some(&record),
            "Changed original",
            "Current",
            15100,
            20,
        )
        .unwrap();
        assert_eq!(second["original_name"], "Original");
        assert_eq!(second["updated_at"], 20);
        assert!(
            build_shortcut_name_state(
                Some(&first),
                Some(&json!({"steam_appid": 2, "steam_store_name": "Current"})),
                "Original",
                "Current",
                15100,
                30
            )
            .is_err()
        );
        assert!(
            build_shortcut_name_state(Some(&first), Some(&record), "Original", "Old", 15100, 30)
                .is_err()
        );
    }

    #[tokio::test]
    async fn migration_preserves_unknown_fields_and_reloads_only_on_nanosecond_mtime_change() {
        let dir = TempDir::new();
        let path = dir.0.join(SETTINGS_FILE_NAME);
        tokio::fs::write(&path, br#"{"metadata":{"1":{"release_date":1710057600,"unknown":{"keep":true}}},"shortcut_names":{"1":{"original_name":"Exact"}},"settings":{"unrelated":[1]},"update_settings":{"channel":"development"},"update_check_cache":{"tag":"v1"},"unknown_root":{"keep":true}}"#).await.unwrap();
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        assert_eq!(store.data()["metadata"]["1"]["unknown"]["keep"], true);
        assert!(store.data()["metadata"]["1"]["release_date"].is_string());
        assert_eq!(store.data()["unknown_root"]["keep"], true);
        assert_eq!(settings(store.data())["unrelated"][0], 1);
        assert_eq!(
            store.data()["shortcut_names"]["1"]["original_name"],
            "Exact"
        );
        assert_eq!(store.data()["update_settings"]["channel"], "development");
        assert_eq!(store.data()["update_check_cache"]["tag"], "v1");
        assert!(!store.refresh().await.unwrap());

        let bytes =
            br#"{"release_date_format":"date-only-v1","metadata":{"1":{"title":"external"}}}"#;
        tokio::fs::write(&path, bytes).await.unwrap();
        let changed_ns = store.mtime_ns.unwrap() + 1;
        let modified =
            UNIX_EPOCH + std::time::Duration::from_nanos(u64::try_from(changed_ns).unwrap());
        std::fs::File::open(&path)
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(modified))
            .unwrap();
        assert!(store.refresh().await.unwrap());
        assert_eq!(store.data()["metadata"]["1"]["title"], "external");
    }

    #[tokio::test]
    async fn invalid_json_and_non_object_files_are_never_overwritten() {
        for bytes in [b"{broken".as_slice(), b"[]".as_slice()] {
            let dir = TempDir::new();
            let path = dir.0.join(SETTINGS_FILE_NAME);
            tokio::fs::write(&path, bytes).await.unwrap();
            assert!(Storage::open(dir.0.clone()).await.is_err());
            assert_eq!(tokio::fs::read(path).await.unwrap(), bytes);
        }
    }

    #[tokio::test]
    async fn invalid_external_refresh_preserves_exposed_state_and_file_bytes() {
        let dir = TempDir::new();
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        let before = store.data().clone();
        let path = dir.0.join(SETTINGS_FILE_NAME);
        let invalid = b"{invalid";
        tokio::fs::write(&path, invalid).await.unwrap();
        let changed_ns = store.mtime_ns.unwrap() + 1;
        let modified =
            UNIX_EPOCH + std::time::Duration::from_nanos(u64::try_from(changed_ns).unwrap());
        std::fs::File::open(&path)
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(modified))
            .unwrap();
        assert!(store.refresh().await.is_err());
        assert_eq!(store.data(), &before);
        assert_eq!(tokio::fs::read(path).await.unwrap(), invalid);
    }

    #[tokio::test]
    async fn failed_date_migration_does_not_publish_or_replace_original_file() {
        let dir = TempDir::new();
        let path = dir.0.join(SETTINGS_FILE_NAME);
        let original = br#"{"metadata":{"1":{"release_date":1710057600}}}"#;
        tokio::fs::write(&path, original).await.unwrap();
        std::fs::create_dir(dir.0.join(format!("{SETTINGS_FILE_NAME}.tmp"))).unwrap();
        assert!(Storage::open(dir.0.clone()).await.is_err());
        assert_eq!(tokio::fs::read(path).await.unwrap(), original);
    }

    #[tokio::test]
    async fn transaction_rolls_back_only_touched_paths_on_mutation_or_write_failure() {
        let dir = TempDir::new();
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        store
            .transaction(|tx| {
                tx.set(&["metadata", "1"], json!({"title": "original"}))?;
                Ok(())
            })
            .await
            .unwrap();
        let before = store.data()["metadata"]["1"].clone();
        let error = store
            .transaction(|tx| {
                tx.edit(&["metadata", "1"], |record| {
                    record["title"] = json!("uncommitted");
                    Ok(())
                })?;
                Err::<(), _>("mutation rejected".to_owned())
            })
            .await
            .unwrap_err();
        assert_eq!(error, "mutation rejected");
        assert_eq!(store.data()["metadata"]["1"], before);

        let persisted_before = tokio::fs::read(dir.0.join(SETTINGS_FILE_NAME))
            .await
            .unwrap();
        std::fs::create_dir(dir.0.join(format!("{SETTINGS_FILE_NAME}.tmp"))).unwrap();
        assert!(
            store
                .transaction(|tx| tx.set(&["metadata", "1", "title"], json!("failed")))
                .await
                .is_err()
        );
        assert_eq!(store.data()["metadata"]["1"], before);
        assert_eq!(
            tokio::fs::read(dir.0.join(SETTINGS_FILE_NAME))
                .await
                .unwrap(),
            persisted_before
        );
        assert!(store.replace(json!([])).await.is_err());
        assert!(store.replace(json!({"metadata": {}})).await.is_err());
        assert_eq!(store.data()["metadata"]["1"], before);
        assert_eq!(
            tokio::fs::read(dir.0.join(SETTINGS_FILE_NAME))
                .await
                .unwrap(),
            persisted_before
        );
    }

    #[tokio::test]
    async fn failed_store_state_save_keeps_normalized_loaded_records_exposed() {
        let dir = TempDir::new();
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        store
            .transaction(|tx| tx.set(&["metadata", "42"], json!({"steam_appid": 90})))
            .await
            .unwrap();
        std::fs::create_dir(dir.0.join(format!("{SETTINGS_FILE_NAME}.tmp"))).unwrap();
        let cached = json!({"apps": [[90, "Gone"]]});
        assert!(store.normalize_loaded_store_states(Some(&cached)).await);
        assert_eq!(
            store.data()["metadata"]["42"]["steam_store_state"],
            "delisted"
        );
        let persisted: Value = serde_json::from_slice(
            &tokio::fs::read(dir.0.join(SETTINGS_FILE_NAME))
                .await
                .unwrap(),
        )
        .unwrap();
        assert!(
            persisted["metadata"]["42"]
                .get("steam_store_state")
                .is_none()
        );
    }

    #[tokio::test]
    async fn successful_store_state_migration_persists_once() {
        let dir = TempDir::new();
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        store
            .transaction(|tx| {
                tx.set(
                    &["metadata"],
                    json!({
                        "indexed": {"steam_appid": 90},
                        "invalid": {"steam_appid": 91, "steam_store_state": "bogus"},
                        "available": {"steam_store_state": " AVAILABLE "},
                    }),
                )
            })
            .await
            .unwrap();
        let cached = json!({"apps": [[90, "Gone"]]});
        assert!(store.normalize_loaded_store_states(Some(&cached)).await);
        assert!(!store.normalize_loaded_store_states(Some(&cached)).await);
        let persisted: Value = serde_json::from_slice(
            &tokio::fs::read(dir.0.join(SETTINGS_FILE_NAME))
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            persisted["metadata"]["indexed"]["steam_store_state"],
            "delisted"
        );
        assert_eq!(
            persisted["metadata"]["invalid"]["steam_store_state"],
            "unknown"
        );
        assert_eq!(
            persisted["metadata"]["available"]["steam_store_state"],
            "available"
        );
    }

    #[tokio::test]
    async fn serialized_concurrent_writes_preserve_each_record() {
        let dir = TempDir::new();
        let store = Storage::open(dir.0.clone()).await.unwrap();
        let store = std::sync::Arc::new(Mutex::new(store));
        let mut tasks = Vec::new();
        for id in 0..8 {
            let store = store.clone();
            tasks.push(tokio::spawn(async move {
                let mut store = store.lock().await;
                store
                    .transaction(|tx| tx.set(&["metadata", &id.to_string()], json!({"title": id})))
                    .await
                    .unwrap();
            }));
        }
        for task in tasks {
            task.await.unwrap();
        }
        let store = store.lock().await;
        assert_eq!(store.data()["metadata"].as_object().unwrap().len(), 8);
    }
}
