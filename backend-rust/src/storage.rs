use crate::{
    logging,
    matching::{py_truthy as json_truthy, safe_int},
};
use chrono::{Datelike, Local, TimeZone};
use serde_json::{Map, Number, Value, json};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncReadExt;

pub const RELEASE_DATE_FORMAT: &str = "date-only-v1";
pub const SETTINGS_FILE_NAME: &str = "decky_metadata.json";
/// One `<game id>.json` per metadata record; the settings file keeps every other root field.
pub const RECORDS_DIR_NAME: &str = "metadata";
/// Present only in a per-game layout settings file. Without it, the file's `metadata` is authoritative.
const LAYOUT_KEY: &str = "metadata_layout";
const LAYOUT_FILES: &str = "files-v1";
const TRAILER_QUALITIES: &[i64] = &[720, 1080, 1440, 2160];
const PROTONDB_COVER_POSITIONS: &[&str] = &["bottom-left", "top-left", "top-right"];

/// Settings file and records directory modification times, used to detect external changes.
type Stamp = (Option<i128>, Option<i128>);

pub struct Storage {
    data: Value,
    dir: PathBuf,
    stamp: Stamp,
    loaded: bool,
    /// The settings file holds a full single-file copy for an older version; replace it before the next write.
    legacy_exported: bool,
}

impl Storage {
    pub async fn open(settings_dir: PathBuf) -> Result<Self, String> {
        tokio::fs::create_dir_all(&settings_dir)
            .await
            .map_err(|error| format!("failed creating settings directory: {error}"))?;
        let mut store = Self {
            data: default_data(),
            dir: settings_dir,
            stamp: (None, None),
            loaded: false,
            legacy_exported: false,
        };
        let stamp = read_stamp(&store.dir).await?;
        match load_store(&store.dir).await {
            Ok(loaded) => store.adopt(loaded, stamp).await?,
            Err(LoadError::Missing) => {
                write_all(&store.dir, &store.data).await?;
                store.stamp = read_stamp(&store.dir).await?;
                store.loaded = true;
            }
            Err(error) => {
                if let LoadError::Failure(message) = &error {
                    log_load_failure(&store.dir, message);
                }
                store.stamp = read_stamp(&store.dir).await.unwrap_or((None, None));
            }
        }
        Ok(store)
    }

    /// Publishes loaded data, first converting single-file data or old release dates on disk.
    /// `stamp` is read before loading, so a change during the read causes another reload.
    async fn adopt(&mut self, (mut data, persist): (Value, Persist), stamp: Stamp) -> Result<(), String> {
        let migrated = migrate_release_dates(&mut data)?;
        if migrated || persist == Persist::All {
            write_all(&self.dir, &data).await?;
        } else if persist == Persist::Envelope {
            write_envelope(&self.dir, &data).await?;
        }
        self.data = normalize_loaded_data(data)?;
        self.stamp = if migrated || persist != Persist::None {
            read_stamp(&self.dir).await?
        } else {
            stamp
        };
        self.loaded = true;
        self.legacy_exported = false;
        Ok(())
    }

    pub fn loaded_successfully(&self) -> bool {
        self.loaded
    }

    pub async fn refresh(&mut self) -> Result<bool, String> {
        let stamp = read_stamp(&self.dir).await?;
        // An unloaded cache holds defaults; it must not replace record files beside a lost settings file.
        if stamp.0.is_none() && self.loaded {
            write_all(&self.dir, &self.data).await?;
            self.stamp = read_stamp(&self.dir).await?;
            self.loaded = true;
            self.legacy_exported = false;
            return Ok(true);
        }
        if stamp == self.stamp {
            return Ok(false);
        }
        match load_store(&self.dir).await {
            Ok(loaded) => {
                self.adopt(loaded, stamp).await?;
                Ok(true)
            }
            Err(LoadError::Missing) => {
                write_all(&self.dir, &self.data).await?;
                self.stamp = read_stamp(&self.dir).await?;
                self.loaded = true;
                self.legacy_exported = false;
                Ok(true)
            }
            // The cache no longer matches the files; refuse writes until valid files load.
            Err(LoadError::Invalid) => {
                self.loaded = false;
                Ok(false)
            }
            Err(LoadError::Failure(error)) => {
                log_load_failure(&self.dir, &error);
                self.loaded = false;
                Ok(false)
            }
        }
    }

    /// Startup fell back to defaults because the files are unusable; saving now would replace them.
    fn ensure_writable(&self) -> Result<(), String> {
        if self.loaded {
            Ok(())
        } else {
            Err("metadata settings file is unreadable; fix or remove it before saving changes".to_owned())
        }
    }

    pub fn data(&self) -> &Value {
        &self.data
    }

    /// Writes the whole store as one settings file, the layout older versions read.
    /// Call it before the updater hands off to another version: an older version
    /// sees no records otherwise. Later writes keep that file complete until the next
    /// load, which converts it back.
    pub async fn export_legacy(&mut self) -> Result<(), String> {
        self.ensure_writable()?;
        let encoded = serde_json::to_vec(&self.data).map_err(|error| error.to_string())?;
        write_atomic(self.dir.join(SETTINGS_FILE_NAME), encoded).await?;
        self.legacy_exported = true;
        self.stamp = read_stamp(&self.dir).await?;
        Ok(())
    }

    /// The owner refreshes and normalizes once under its mutex before staging a mutation.
    pub async fn transaction<R>(
        &mut self,
        mutation: impl FnOnce(&mut StoreTransaction<'_>) -> Result<R, String>,
    ) -> Result<R, String> {
        self.ensure_writable()?;
        let mut transaction = StoreTransaction::new(&mut self.data);
        let value = match mutation(&mut transaction) {
            Ok(value) => value,
            Err(error) => {
                transaction.rollback();
                return Err(error);
            }
        };
        // Only paths whose value changed are written; re-saving the same record writes nothing.
        let mut envelope = false;
        let mut records = Some(Vec::<String>::new());
        for (path, previous) in &transaction.undo {
            let parts: Vec<&str> = path.iter().map(String::as_str).collect();
            if value_at(transaction.data, &parts) == previous.as_ref() {
                continue;
            }
            match parts.as_slice() {
                ["metadata"] => records = None,
                ["metadata", key, ..] => {
                    if let Some(keys) = records.as_mut().filter(|keys| !keys.iter().any(|saved| saved == key)) {
                        keys.push((*key).to_owned());
                    }
                }
                _ => envelope = true,
            }
        }
        let undo = std::mem::take(&mut transaction.undo);
        drop(transaction);
        if !envelope && records.as_ref().is_some_and(Vec::is_empty) {
            return Ok(value);
        }
        match self.persist(envelope, records.as_deref()).await {
            Ok(()) => Ok(value),
            Err(error) => {
                rollback_changes(&mut self.data, undo);
                Err(error)
            }
        }
    }

    /// `records: None` rewrites every record file. A failed write leaves the stamp stale, so the
    /// next refresh reloads whatever reached the disk.
    async fn persist(&mut self, envelope: bool, records: Option<&[String]>) -> Result<(), String> {
        if self.legacy_exported {
            // Until the next load, the single settings file stays the complete store: an older
            // version may start from it at any moment during the install.
            let encoded = serde_json::to_vec(&self.data).map_err(|error| error.to_string())?;
            write_atomic(self.dir.join(SETTINGS_FILE_NAME), encoded).await?;
            self.stamp = read_stamp(&self.dir).await?;
            return Ok(());
        }
        match records {
            None => write_records_dir(&self.dir, &self.data).await?,
            Some(keys) => {
                for key in keys {
                    write_record(&self.dir, key, self.data["metadata"].get(key)).await?;
                }
            }
        }
        if envelope {
            write_envelope(&self.dir, &self.data).await?;
        }
        self.stamp = read_stamp(&self.dir).await?;
        Ok(())
    }

    /// Store normalization remains visible in memory even when its best-effort save fails.
    pub async fn normalize_loaded_store_states(&mut self, cached_index: Option<&Value>) -> bool {
        let changed = normalize_store_states(&mut self.data, cached_index);
        if changed.is_empty() {
            return false;
        }
        if let Err(error) = self.persist(false, Some(&changed)).await {
            logging::event(
                "load",
                "failed normalizing loaded Steam store states",
                json!({"error":error}),
                log::Level::Error,
            );
        }
        true
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
    let hltb = saved.remove("hltb");
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
    if let Some(value) = hltb {
        normalized.insert("hltb".to_owned(), normalize_hltb_settings(&value));
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

const HLTB_STYLES: [&str; 4] = ["default", "clean", "clean-left", "clean-default"];
const HLTB_MAX_HIDDEN_APPS: usize = 5_000;

pub fn default_hltb_settings() -> Value {
    json!({
        "enabled": false, "style": "default", "hideViewDetails": false,
        "showMain": true, "showMainPlus": true, "showComplete": true, "showAllStyles": true,
        "appearance": {"custom": false, "barAlpha": 25, "linkColor": "steam",
                       "textShadow": false, "textScale": 100, "border": true},
        "hiddenAppIds": [],
    })
}

fn hltb_step(value: Option<&Value>, min: i64, max: i64) -> Option<i64> {
    value.and_then(Value::as_i64).filter(|n| (min..=max).contains(n) && n % 5 == 0)
}

fn hltb_hidden_app_id(value: &Value) -> Option<i64> {
    value.as_i64().filter(|id| (1..=0xffff_ffff).contains(id))
}

/// Keep every valid saved choice and replace anything else with its default.
pub fn normalize_hltb_settings(value: &Value) -> Value {
    let mut normalized = default_hltb_settings();
    let Some(source) = value.as_object() else { return normalized };
    for key in ["enabled", "hideViewDetails", "showMain", "showMainPlus", "showComplete", "showAllStyles"] {
        if let Some(flag) = source.get(key).and_then(Value::as_bool) {
            normalized[key] = Value::Bool(flag);
        }
    }
    if let Some(style) = source.get("style").and_then(Value::as_str).filter(|style| HLTB_STYLES.contains(style)) {
        normalized["style"] = json!(style);
    }
    if let Some(appearance) = source.get("appearance").and_then(Value::as_object) {
        let target = &mut normalized["appearance"];
        for key in ["custom", "textShadow", "border"] {
            if let Some(flag) = appearance.get(key).and_then(Value::as_bool) {
                target[key] = Value::Bool(flag);
            }
        }
        if let Some(alpha) = hltb_step(appearance.get("barAlpha"), 0, 100) {
            target["barAlpha"] = json!(alpha);
        }
        if let Some(scale) = hltb_step(appearance.get("textScale"), 75, 150) {
            target["textScale"] = json!(scale);
        }
        if let Some(color) = appearance.get("linkColor").and_then(Value::as_str).filter(|c| matches!(*c, "steam" | "text")) {
            target["linkColor"] = json!(color);
        }
    }
    if let Some(ids) = source.get("hiddenAppIds").and_then(Value::as_array) {
        let mut seen = std::collections::HashSet::new();
        let ids: Vec<i64> = ids
            .iter()
            .filter_map(hltb_hidden_app_id)
            .filter(|id| seen.insert(*id))
            .take(HLTB_MAX_HIDDEN_APPS)
            .collect();
        normalized["hiddenAppIds"] = json!(ids);
    }
    normalized
}

/// Reject a settings object that is not exactly a valid HLTB settings value.
pub fn validate_hltb_settings(value: &Value) -> Result<Value, String> {
    let invalid = || "invalid HLTB settings".to_owned();
    let source = value.as_object().ok_or_else(invalid)?;
    let defaults = default_hltb_settings();
    let same_keys = |actual: &Map<String, Value>, expected: &Value| {
        let expected = expected.as_object().expect("fixed HLTB defaults");
        actual.len() == expected.len() && expected.keys().all(|key| actual.contains_key(key))
    };
    let appearance = source.get("appearance").and_then(Value::as_object).ok_or_else(invalid)?;
    let ids = source.get("hiddenAppIds").and_then(Value::as_array).ok_or_else(invalid)?;
    let flags_valid = ["enabled", "hideViewDetails", "showMain", "showMainPlus", "showComplete", "showAllStyles"]
        .iter()
        .all(|key| source.get(*key).is_some_and(Value::is_boolean))
        && ["custom", "textShadow", "border"].iter().all(|key| appearance.get(*key).is_some_and(Value::is_boolean));
    if !same_keys(source, &defaults)
        || !same_keys(appearance, &defaults["appearance"])
        || !flags_valid
        || !source.get("style").and_then(Value::as_str).is_some_and(|style| HLTB_STYLES.contains(&style))
        || hltb_step(appearance.get("barAlpha"), 0, 100).is_none()
        || hltb_step(appearance.get("textScale"), 75, 150).is_none()
        || !appearance.get("linkColor").and_then(Value::as_str).is_some_and(|c| matches!(c, "steam" | "text"))
        || ids.len() > HLTB_MAX_HIDDEN_APPS
        || ids.iter().any(|id| hltb_hidden_app_id(id).is_none())
    {
        return Err(invalid());
    }
    Ok(normalize_hltb_settings(value))
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

/// Normalizes loaded states using only a previously cached delisted index; returns the changed record keys.
pub fn normalize_store_states(data: &mut Value, cached_index: Option<&Value>) -> Vec<String> {
    let Some(metadata) = data.get_mut("metadata").and_then(Value::as_object_mut) else {
        return Vec::new();
    };
    let mut changed = Vec::new();
    for (key, record) in metadata.iter_mut() {
        let Some(record) = record.as_object_mut() else {
            continue;
        };
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
            changed.push(key.clone());
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

#[derive(Clone, Copy, PartialEq, Eq)]
enum Persist {
    None,
    Envelope,
    All,
}

/// Loads the settings file and, for the per-game layout, every record file. `Persist::All`
/// marks single-file data that must be converted; `Persist::Envelope` a lost settings file.
async fn load_store(dir: &Path) -> Result<(Value, Persist), LoadError> {
    let records_dir = dir.join(RECORDS_DIR_NAME);
    let (mut data, persist) = match load_file(&dir.join(SETTINGS_FILE_NAME)).await {
        Ok(data) => (data, Persist::None),
        // A lost settings file must not discard the record files beside it, including the
        // `.old` set an interrupted full rewrite leaves (`read_records` restores it).
        Err(LoadError::Missing) => {
            let failed = |error: std::io::Error| LoadError::Failure(format!("failed reading metadata records: {error}"));
            let backup = dir.join(format!("{RECORDS_DIR_NAME}.old"));
            if tokio::fs::try_exists(&records_dir).await.map_err(failed)?
                || tokio::fs::try_exists(&backup).await.map_err(failed)?
            {
                (default_data(), Persist::Envelope)
            } else {
                return Err(LoadError::Missing);
            }
        }
        Err(error) => return Err(error),
    };
    let object = data.as_object_mut().ok_or(LoadError::Invalid)?;
    match object.remove(LAYOUT_KEY) {
        None if persist == Persist::None => return Ok((data, Persist::All)),
        None => {}
        Some(Value::String(layout)) if layout == LAYOUT_FILES => {}
        Some(_) => {
            return Err(LoadError::Failure(
                "unsupported metadata layout; a newer plugin version wrote these files".to_owned(),
            ));
        }
    }
    // shortcut: an older version installed by hand (not by the updater, which exports first)
    // keeps the layout key and writes `metadata` here; those edits are ignored.
    object.remove("metadata");
    let records = read_records(records_dir).await.map_err(LoadError::Failure)?;
    object.insert("metadata".to_owned(), Value::Object(records));
    Ok((data, persist))
}

async fn load_file(path: &Path) -> Result<Value, LoadError> {
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
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).await.map_err(|error| {
        LoadError::Failure(format!("failed reading metadata settings: {error}"))
    })?;
    let value = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| LoadError::Failure(format!("failed reading metadata settings: {error}")))?;
    if !value.is_object() {
        return Err(LoadError::Invalid);
    }
    Ok(value)
}

async fn read_records(records_dir: PathBuf) -> Result<Map<String, Value>, String> {
    tokio::task::spawn_blocking(move || {
        let entries = match std::fs::read_dir(&records_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                // A crash between the two renames in `write_records_dir` leaves only the previous set.
                let previous = records_dir.with_file_name(format!("{RECORDS_DIR_NAME}.old"));
                match std::fs::rename(&previous, &records_dir) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Map::new()),
                    Err(error) => return Err(format!("failed restoring metadata records: {error}")),
                }
                std::fs::read_dir(&records_dir)
                    .map_err(|error| format!("failed reading metadata records: {error}"))?
            }
            Err(error) => return Err(format!("failed reading metadata records: {error}")),
        };
        let mut records = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|error| format!("failed reading metadata records: {error}"))?;
            let Some(key) = entry.file_name().to_str().and_then(record_key) else {
                continue;
            };
            let bytes = std::fs::read(entry.path())
                .map_err(|error| format!("failed reading metadata record {key}: {error}"))?;
            let record = serde_json::from_slice::<Value>(&bytes)
                .map_err(|error| format!("failed reading metadata record {key}: {error}"))?;
            records.push((key, record));
        }
        records.sort_unstable_by(|left, right| left.0.cmp(&right.0));
        Ok(records.into_iter().collect())
    })
    .await
    .map_err(|error| format!("failed reading metadata records: {error}"))?
}

/// Game IDs are decimal; any other key is hex-encoded so it cannot name a path outside the directory.
fn record_file_name(key: &str) -> String {
    if !key.is_empty() && key.bytes().all(|byte| byte.is_ascii_digit()) {
        format!("{key}.json")
    } else {
        let hex: String = key.bytes().map(|byte| format!("{byte:02x}")).collect();
        format!("~{hex}.json")
    }
}

/// Inverse of `record_file_name`; temporary and foreign files return `None`.
fn record_key(file_name: &str) -> Option<String> {
    let stem = file_name.strip_suffix(".json")?;
    let Some(hex) = stem.strip_prefix('~') else {
        return (!stem.is_empty() && stem.bytes().all(|byte| byte.is_ascii_digit()))
            .then(|| stem.to_owned());
    };
    if hex.len() % 2 != 0 {
        return None;
    }
    let bytes = (0..hex.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(hex.get(index..index + 2)?, 16).ok())
        .collect::<Option<Vec<u8>>>()?;
    String::from_utf8(bytes).ok()
}

/// Runs on every request: both stats share one blocking-pool hop, the cost of the single-file stat.
async fn read_stamp(dir: &Path) -> Result<Stamp, String> {
    let settings = dir.join(SETTINGS_FILE_NAME);
    let records = dir.join(RECORDS_DIR_NAME);
    tokio::task::spawn_blocking(move || Ok((file_mtime_ns(&settings)?, file_mtime_ns(&records)?)))
        .await
        .map_err(|error| format!("failed stat metadata settings: {error}"))?
}

/// Every root field except `metadata`, plus the layout key.
fn encode_envelope(data: &Value) -> Result<Vec<u8>, String> {
    struct Envelope<'a>(&'a Map<String, Value>);
    impl serde::Serialize for Envelope<'_> {
        fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
            let layout = Value::String(LAYOUT_FILES.to_owned());
            serializer.collect_map(
                self.0
                    .iter()
                    .filter(|(key, _)| key.as_str() != "metadata" && key.as_str() != LAYOUT_KEY)
                    .map(|(key, value)| (key.as_str(), value))
                    .chain(std::iter::once((LAYOUT_KEY, &layout))),
            )
        }
    }
    let object = data
        .as_object()
        .ok_or_else(|| "metadata settings must be a JSON object".to_owned())?;
    serde_json::to_vec(&Envelope(object)).map_err(|error| error.to_string())
}

async fn write_envelope(dir: &Path, data: &Value) -> Result<(), String> {
    write_atomic(dir.join(SETTINGS_FILE_NAME), encode_envelope(data)?).await
}

/// Converts any data to the per-game layout: records first, then the settings file that marks the layout.
async fn write_all(dir: &Path, data: &Value) -> Result<(), String> {
    let envelope = encode_envelope(data)?;
    write_records_dir(dir, data).await?;
    write_atomic(dir.join(SETTINGS_FILE_NAME), envelope).await
}

async fn write_record(dir: &Path, key: &str, record: Option<&Value>) -> Result<(), String> {
    let records_dir = dir.join(RECORDS_DIR_NAME);
    let path = records_dir.join(record_file_name(key));
    let Some(record) = record else {
        return match tokio::fs::remove_file(&path).await {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                Err(format!("failed removing metadata record: {error}"))
            }
            _ => Ok(()),
        };
    };
    let encoded = serde_json::to_vec(record).map_err(|error| error.to_string())?;
    tokio::fs::create_dir_all(&records_dir)
        .await
        .map_err(|error| format!("failed creating metadata records directory: {error}"))?;
    write_atomic(path, encoded).await
}

/// Replaces the whole records directory: a staged copy is renamed into place.
async fn write_records_dir(dir: &Path, data: &Value) -> Result<(), String> {
    let files = data
        .get("metadata")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .map(|(key, record)| {
            serde_json::to_vec(record)
                .map(|encoded| (record_file_name(key), encoded))
                .map_err(|error| error.to_string())
        })
        .collect::<Result<Vec<_>, String>>()?;
    let dir = dir.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let failed = |action: &str, error: std::io::Error| format!("failed {action} metadata records: {error}");
        let target = dir.join(RECORDS_DIR_NAME);
        let staged = dir.join(format!("{RECORDS_DIR_NAME}.new"));
        let previous = dir.join(format!("{RECORDS_DIR_NAME}.old"));
        // Loading restores `.old` when `target` is missing, so a leftover here is stale.
        for leftover in [&staged, &previous] {
            match std::fs::remove_dir_all(leftover) {
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                    return Err(failed("clearing", error));
                }
                _ => {}
            }
        }
        std::fs::create_dir(&staged).map_err(|error| failed("staging", error))?;
        for (name, encoded) in files {
            std::fs::write(staged.join(name), encoded).map_err(|error| failed("writing", error))?;
        }
        let had_target = match std::fs::rename(&target, &previous) {
            Ok(()) => true,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(error) => return Err(failed("replacing", error)),
        };
        if let Err(error) = std::fs::rename(&staged, &target) {
            if had_target {
                let _ = std::fs::rename(&previous, &target);
            }
            return Err(failed("replacing", error));
        }
        let _ = std::fs::remove_dir_all(&previous);
        Ok(())
    })
    .await
    .map_err(|error| format!("failed replacing metadata records: {error}"))?
}

fn log_load_failure(path: &Path, error: &str) {
    logging::event(
        "load",
        "failed reading metadata settings",
        json!({"path":path.to_string_lossy(),"error":error}),
        log::Level::Error,
    );
}

fn file_mtime_ns(path: &Path) -> Result<Option<i128>, String> {
    match std::fs::metadata(path) {
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

async fn write_atomic(path: PathBuf, encoded: Vec<u8>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let name = path
            .file_name()
            .ok_or_else(|| "metadata settings path has no file name".to_owned())?;
        let temp_path = path.with_file_name(format!("{}.tmp", name.to_string_lossy()));
        if let Err(error) = std::fs::write(&temp_path, encoded) {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("failed writing metadata settings: {error}"));
        }
        if let Err(error) = std::fs::rename(&temp_path, &path) {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("failed replacing metadata settings: {error}"));
        }
        Ok(())
    })
    .await
    .map_err(|error| format!("failed replacing metadata settings: {error}"))?
}

enum LoadError {
    Missing,
    Invalid,
    Failure(String),
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tokio::sync::Mutex;

    #[test]
    fn hltb_settings_accept_exact_values_and_repair_saved_ones() {
        let defaults = default_hltb_settings();
        assert_eq!(validate_hltb_settings(&defaults).unwrap(), defaults);
        let mut changed = defaults.clone();
        changed["style"] = json!("clean-left");
        changed["appearance"]["barAlpha"] = json!(55);
        changed["hiddenAppIds"] = json!([620, 4294967295u32]);
        assert_eq!(validate_hltb_settings(&changed).unwrap(), changed);
        for (path, bad) in [
            ("style", json!("fancy")), ("enabled", json!("yes")), ("hiddenAppIds", json!([0])),
            ("hiddenAppIds", json!([4294967296u64])), ("extra", json!(true)),
        ] {
            let mut value = defaults.clone();
            value[path] = bad;
            assert!(validate_hltb_settings(&value).is_err(), "{path}");
        }
        for (key, bad) in [("barAlpha", json!(33)), ("textScale", json!(200)), ("linkColor", json!("red"))] {
            let mut value = defaults.clone();
            value["appearance"][key] = bad;
            assert!(validate_hltb_settings(&value).is_err(), "{key}");
        }
        let repaired = normalize_hltb_settings(&json!({
            "enabled": true, "style": "fancy", "appearance": {"barAlpha": 33, "textScale": 150},
            "hiddenAppIds": [5, 5, 0, "7", 9],
        }));
        assert_eq!(repaired["enabled"], true);
        assert_eq!(repaired["style"], "default");
        assert_eq!(repaired["appearance"]["barAlpha"], 25);
        assert_eq!(repaired["appearance"]["textScale"], 150);
        assert_eq!(repaired["hiddenAppIds"], json!([5, 9]));
        assert_eq!(normalize_hltb_settings(&Value::Null), defaults);
    }

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

    /// The whole store as an older single-file reader would rebuild it from disk.
    fn persisted(dir: &Path) -> Value {
        let mut data: Value =
            serde_json::from_slice(&std::fs::read(dir.join(SETTINGS_FILE_NAME)).unwrap()).unwrap();
        let object = data.as_object_mut().unwrap();
        assert_eq!(object.remove(LAYOUT_KEY), Some(json!(LAYOUT_FILES)));
        let mut records = Map::new();
        for entry in std::fs::read_dir(dir.join(RECORDS_DIR_NAME)).unwrap() {
            let entry = entry.unwrap();
            let Some(key) = record_key(entry.file_name().to_str().unwrap()) else {
                continue;
            };
            records.insert(key, serde_json::from_slice(&std::fs::read(entry.path()).unwrap()).unwrap());
        }
        object.insert("metadata".to_owned(), Value::Object(records));
        data
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
        assert_eq!(
            normalize_store_states(&mut data, Some(&cached)),
            ["indexed", "available", "unknown"]
        );
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
        assert!(normalize_store_states(&mut data, Some(&cached)).is_empty());
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
        // The single file became the per-game layout.
        let envelope: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert!(envelope.get("metadata").is_none());
        assert_eq!(envelope[LAYOUT_KEY], LAYOUT_FILES);
        assert_eq!(persisted(&dir.0)["metadata"], store.data()["metadata"]);

        let bytes =
            br#"{"release_date_format":"date-only-v1","metadata":{"1":{"title":"external"}}}"#;
        tokio::fs::write(&path, bytes).await.unwrap();
        let changed_ns = store.stamp.0.unwrap() + 1;
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
    async fn missing_settings_refresh_resaves_current_memory() {
        let dir = TempDir::new();
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        let path = dir.0.join(SETTINGS_FILE_NAME);
        assert_eq!(persisted(&dir.0), default_data());
        store
            .transaction(|tx| tx.set(&["metadata", "42"], json!({"title":"Keep me"})))
            .await
            .unwrap();
        tokio::fs::remove_file(&path).await.unwrap();

        assert!(store.refresh().await.unwrap());
        assert_eq!(store.data()["metadata"]["42"]["title"], "Keep me");
        assert_eq!(persisted(&dir.0), *store.data());
    }

    #[tokio::test]
    async fn unchanged_saves_skip_the_file_write_and_changed_saves_do_not() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TempDir::new();
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        let record = json!({"title":"Same","screenshots":[{"url":"https://a"}]});
        store.transaction(|tx| tx.set(&["metadata", "1"], record.clone())).await.unwrap();
        // With the records directory read-only, any real record write (temp file + rename) fails.
        let records = dir.0.join(RECORDS_DIR_NAME);
        std::fs::set_permissions(&records, std::fs::Permissions::from_mode(0o500)).unwrap();
        let same = store.transaction(|tx| tx.set(&["metadata", "1"], record.clone())).await;
        let changed = store
            .transaction(|tx| tx.set(&["metadata", "1", "title"], json!("Different")))
            .await;
        std::fs::set_permissions(&records, std::fs::Permissions::from_mode(0o700)).unwrap();
        same.unwrap();
        assert!(changed.is_err());
        assert_eq!(store.data()["metadata"]["1"], record);
    }

    #[tokio::test]
    async fn unusable_settings_refuse_writes_until_a_valid_file_loads() {
        for bytes in [b"{broken".as_slice(), b"[]".as_slice()] {
            let dir = TempDir::new();
            let path = dir.0.join(SETTINGS_FILE_NAME);
            tokio::fs::write(&path, bytes).await.unwrap();
            let mut store = Storage::open(dir.0.clone()).await.unwrap();
            assert!(!store.loaded_successfully());
            assert_eq!(store.data(), &default_data());

            let save = |tx: &mut StoreTransaction<'_>| tx.set(&["metadata", "9"], json!({"title":"Explicit save"}));
            assert!(store.transaction(save).await.is_err());
            assert_eq!(store.data(), &default_data());
            assert_eq!(tokio::fs::read(&path).await.unwrap(), bytes);

            // Once the user repairs the file, it loads and saves work again.
            tokio::fs::write(&path, br#"{"metadata":{"1":{"title":"Kept"}}}"#).await.unwrap();
            std::fs::File::open(&path)
                .unwrap()
                .set_times(std::fs::FileTimes::new().set_modified(std::time::SystemTime::now() + std::time::Duration::from_secs(2)))
                .unwrap();
            assert!(store.refresh().await.unwrap());
            store.transaction(save).await.unwrap();
            let saved = persisted(&dir.0);
            assert_eq!(saved["metadata"]["1"]["title"], "Kept");
            assert_eq!(saved["metadata"]["9"]["title"], "Explicit save");
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
        let changed_ns = store.stamp.0.unwrap() + 1;
        let modified =
            UNIX_EPOCH + std::time::Duration::from_nanos(u64::try_from(changed_ns).unwrap());
        std::fs::File::open(&path)
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(modified))
            .unwrap();
        assert!(!store.refresh().await.unwrap());
        assert_eq!(store.data(), &before);
        assert_eq!(tokio::fs::read(&path).await.unwrap(), invalid);
        // A later mutation must not replace the damaged file with the cached document.
        assert!(
            store
                .transaction(|tx| tx.set(&["settings", "mini_achievements_enabled"], json!(true)))
                .await
                .is_err()
        );
        assert_eq!(tokio::fs::read(&path).await.unwrap(), invalid);
    }
    #[tokio::test]
    async fn failed_store_state_normalization_is_logged_to_plugin_events() {
        let dir = TempDir::new();
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        store
            .transaction(|tx| tx.set(&["metadata", "1"], json!({"steam_appid":1})))
            .await
            .unwrap();
        std::fs::create_dir(dir.0.join(RECORDS_DIR_NAME).join("1.json.tmp")).unwrap();
        let before = logging::test_events().len();

        assert!(store.normalize_loaded_store_states(None).await);
        assert_eq!(store.data()["metadata"]["1"]["steam_store_state"], "unknown");
        assert!(logging::test_events()[before..].iter().any(|event| {
            event.contains("ERROR [decky:load] failed normalizing loaded Steam store states")
        }));
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
    async fn cancelled_atomic_settings_write_still_renames_the_complete_file() {
        let dir = TempDir::new();
        let path = dir.0.join(SETTINGS_FILE_NAME);
        let expected = json!({"payload":"x".repeat(16 * 1024 * 1024)});
        let write_path = path.clone();
        let write = tokio::spawn(async move {
            write_atomic(write_path, serde_json::to_vec(&expected).unwrap()).await
        });
        let temporary = dir.0.join(format!("{SETTINGS_FILE_NAME}.tmp"));
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            loop {
                if tokio::fs::try_exists(&temporary).await.unwrap_or(false) || write.is_finished()
                {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        write.abort();
        let _ = write.await;

        let persisted = tokio::time::timeout(std::time::Duration::from_secs(10), async {
            loop {
                if let Ok(bytes) = tokio::fs::read(&path).await {
                    if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
                        break value;
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(1)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(persisted["payload"].as_str().unwrap().len(), 16 * 1024 * 1024);
        assert!(!tokio::fs::try_exists(temporary).await.unwrap());
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

        let record_path = dir.0.join(RECORDS_DIR_NAME).join("1.json");
        let persisted_before = tokio::fs::read(&record_path).await.unwrap();
        std::fs::create_dir(dir.0.join(RECORDS_DIR_NAME).join("1.json.tmp")).unwrap();
        assert!(
            store
                .transaction(|tx| tx.set(&["metadata", "1", "title"], json!("failed")))
                .await
                .is_err()
        );
        assert_eq!(store.data()["metadata"]["1"], before);
        assert_eq!(tokio::fs::read(&record_path).await.unwrap(), persisted_before);
    }

    #[tokio::test]
    async fn failed_store_state_save_keeps_normalized_loaded_records_exposed() {
        let dir = TempDir::new();
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        store
            .transaction(|tx| tx.set(&["metadata", "42"], json!({"steam_appid": 90})))
            .await
            .unwrap();
        std::fs::create_dir(dir.0.join(RECORDS_DIR_NAME).join("42.json.tmp")).unwrap();
        let cached = json!({"apps": [[90, "Gone"]]});
        assert!(store.normalize_loaded_store_states(Some(&cached)).await);
        assert_eq!(
            store.data()["metadata"]["42"]["steam_store_state"],
            "delisted"
        );
        let persisted = persisted(&dir.0);
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
        let persisted = persisted(&dir.0);
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

    fn set_old_mtime(path: &Path) {
        let old = UNIX_EPOCH + std::time::Duration::from_secs(1_000_000);
        std::fs::File::open(path)
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(old))
            .unwrap();
    }

    #[tokio::test]
    async fn record_saves_touch_only_their_file_and_odd_keys_stay_inside_the_directory() {
        let dir = TempDir::new();
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        for key in ["1", "2", "../escape", "007", "€"] {
            store
                .transaction(|tx| tx.set(&["metadata", key], json!({"title": key})))
                .await
                .unwrap();
        }
        let records = dir.0.join(RECORDS_DIR_NAME);
        let mut names: Vec<String> = std::fs::read_dir(&records)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(names, ["007.json", "1.json", "2.json", "~2e2e2f657363617065.json", "~e282ac.json"]);
        assert!(!dir.0.join("escape.json").exists());

        let envelope = dir.0.join(SETTINGS_FILE_NAME);
        set_old_mtime(&envelope);
        set_old_mtime(&records.join("1.json"));
        store
            .transaction(|tx| tx.set(&["metadata", "2", "title"], json!("changed")))
            .await
            .unwrap();
        store.transaction(|tx| tx.remove(&["metadata", "007"])).await.unwrap();
        let old = UNIX_EPOCH + std::time::Duration::from_secs(1_000_000);
        assert_eq!(std::fs::metadata(&envelope).unwrap().modified().unwrap(), old);
        assert_eq!(std::fs::metadata(records.join("1.json")).unwrap().modified().unwrap(), old);
        assert!(!records.join("007.json").exists());

        let reopened = Storage::open(dir.0.clone()).await.unwrap();
        assert_eq!(reopened.data(), store.data());
        assert_eq!(reopened.data()["metadata"]["../escape"]["title"], "../escape");
        assert_eq!(reopened.data()["metadata"]["2"]["title"], "changed");
    }

    #[tokio::test]
    async fn legacy_export_serves_an_older_reader_and_converts_back() {
        let dir = TempDir::new();
        let path = dir.0.join(SETTINGS_FILE_NAME);
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        store
            .transaction(|tx| tx.set(&["metadata", "1"], json!({"title": "Before"})))
            .await
            .unwrap();
        store.export_legacy().await.unwrap();
        let exported: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(exported, *store.data());
        assert!(!store.refresh().await.unwrap());

        // Writes during the install (a scan, the handoff confirmation) keep the single file complete.
        store
            .transaction(|tx| tx.set(&["metadata", "1", "title"], json!("During install")))
            .await
            .unwrap();
        let during: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(during, *store.data());
        assert!(!store.refresh().await.unwrap());

        // A cancelled install: the next load converts the single file back.
        let reloaded = Storage::open(dir.0.clone()).await.unwrap();
        assert_eq!(reloaded.data()["metadata"]["1"]["title"], "During install");
        assert_eq!(persisted(&dir.0), *reloaded.data());

        // A completed downgrade: the older version edits and saves the exported file.
        let mut older = during;
        older["metadata"]["1"]["title"] = json!("Edited by older version");
        older["metadata"]["5"] = json!({"title": "Added by older version"});
        std::fs::write(&path, serde_json::to_vec(&older).unwrap()).unwrap();
        let upgraded = Storage::open(dir.0.clone()).await.unwrap();
        assert_eq!(upgraded.data()["metadata"]["1"]["title"], "Edited by older version");
        assert_eq!(upgraded.data()["metadata"]["5"]["title"], "Added by older version");
        assert_eq!(persisted(&dir.0), *upgraded.data());
    }

    #[tokio::test]
    async fn lost_settings_file_unknown_layout_and_interrupted_swap_keep_records() {
        let dir = TempDir::new();
        let path = dir.0.join(SETTINGS_FILE_NAME);
        let mut store = Storage::open(dir.0.clone()).await.unwrap();
        store
            .transaction(|tx| tx.set(&["metadata", "1"], json!({"title": "Kept"})))
            .await
            .unwrap();

        std::fs::remove_file(&path).unwrap();
        let reopened = Storage::open(dir.0.clone()).await.unwrap();
        assert_eq!(reopened.data()["metadata"]["1"]["title"], "Kept");
        assert_eq!(persisted(&dir.0)["metadata"]["1"]["title"], "Kept");

        // A crash between the two renames of a full rewrite leaves only `metadata.old`.
        let records = dir.0.join(RECORDS_DIR_NAME);
        std::fs::rename(&records, dir.0.join(format!("{RECORDS_DIR_NAME}.old"))).unwrap();
        let recovered = Storage::open(dir.0.clone()).await.unwrap();
        assert_eq!(recovered.data()["metadata"]["1"]["title"], "Kept");
        assert!(records.join("1.json").exists());

        // The same crash while recreating a lost settings file: no settings file, only `metadata.old`.
        std::fs::remove_file(&path).unwrap();
        std::fs::rename(&records, dir.0.join(format!("{RECORDS_DIR_NAME}.old"))).unwrap();
        let recovered = Storage::open(dir.0.clone()).await.unwrap();
        assert_eq!(recovered.data()["metadata"]["1"]["title"], "Kept");
        assert!(records.join("1.json").exists());
        assert!(path.exists());

        // A damaged settings file the user then deletes must not empty the records.
        std::fs::write(&path, b"{broken").unwrap();
        let mut damaged = Storage::open(dir.0.clone()).await.unwrap();
        assert!(!damaged.loaded_successfully());
        std::fs::remove_file(&path).unwrap();
        assert!(damaged.refresh().await.unwrap());
        assert_eq!(damaged.data()["metadata"]["1"]["title"], "Kept");
        assert!(records.join("1.json").exists());

        let future = br#"{"metadata_layout":"files-v9"}"#;
        std::fs::write(&path, future).unwrap();
        let mut newer = Storage::open(dir.0.clone()).await.unwrap();
        assert!(!newer.loaded_successfully());
        assert!(newer.transaction(|tx| tx.set(&["metadata", "2"], json!({}))).await.is_err());
        assert_eq!(std::fs::read(&path).unwrap(), future);
        assert!(records.join("1.json").exists());
    }
}
