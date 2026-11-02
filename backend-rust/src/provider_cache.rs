//! Saved provider results (ProtonDB ratings and name lookups, HowLongToBeat times)
//! in `provider_cache.json`. Entries are typed in memory: a large library keeps
//! tens of thousands of them, and generic JSON values cost several times more.

use crate::logging;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

pub const FILENAME: &str = "provider_cache.json";
/// Per section. Measured on SteamOS: 5,000 entries per section keep startup
/// reads and saves fast and memory small; 20,000 did not.
pub const MAX_ENTRIES: usize = 5_000;
const DAY_MS: i64 = 86_400_000;
const MAX_TEXT_CHARS: usize = 512;
const MAX_STEAM_APP_ID: u32 = 0x7fff_ffff;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Platinum,
    Gold,
    Silver,
    Bronze,
    Borked,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Rating {
    pub tier: Option<Tier>,
    pub updated_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct NameId {
    pub name: String,
    pub steam_appid: u32,
    pub resolved_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HltbStatus {
    Matched,
    NoMatch,
}

/// HowLongToBeat times in seconds.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HltbTimes {
    pub main: u64,
    pub plus: u64,
    pub complete: u64,
    pub all: u64,
}

/// One saved HowLongToBeat result and the inputs it was found with.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HltbEntry {
    pub status: HltbStatus,
    pub hltb_id: Option<u32>,
    pub game_name: Option<String>,
    pub stats: Option<HltbTimes>,
    pub steam_appid_used: Option<u32>,
    pub title_used: String,
    pub pinned_id_used: Option<u32>,
    pub fetched_at: i64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ProviderCache {
    pub ratings: HashMap<u32, Rating>,
    pub name_ids: HashMap<u32, NameId>,
    pub hltb: HashMap<u32, HltbEntry>,
}

impl Serialize for ProviderCache {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        struct ProtonDb<'a> {
            ratings: &'a HashMap<u32, Rating>,
            name_ids: &'a HashMap<u32, NameId>,
        }
        #[derive(Serialize)]
        struct Hltb<'a> {
            entries: &'a HashMap<u32, HltbEntry>,
        }
        #[derive(Serialize)]
        struct File<'a> {
            version: u8,
            protondb: ProtonDb<'a>,
            hltb: Hltb<'a>,
        }
        File {
            version: 1,
            protondb: ProtonDb { ratings: &self.ratings, name_ids: &self.name_ids },
            hltb: Hltb { entries: &self.hltb },
        }
        .serialize(serializer)
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn valid_time(time: i64, now: i64) -> bool {
    time >= 0 && time <= now + DAY_MS
}

fn valid_text(text: &str) -> bool {
    !text.contains('\0') && text.chars().count() <= MAX_TEXT_CHARS
}

fn steam_id(id: Option<u32>) -> bool {
    id.is_none_or(|id| (1..=MAX_STEAM_APP_ID).contains(&id))
}

fn key(key: &str, maximum: u32) -> Option<u32> {
    if key.is_empty() || !key.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    key.parse::<u32>().ok().filter(|id| (1..=maximum).contains(id))
}

impl Rating {
    fn valid(&self, steam_appid: u32, now: i64) -> bool {
        steam_appid <= MAX_STEAM_APP_ID && valid_time(self.updated_at, now)
    }
}

impl NameId {
    fn valid(&self, now: i64) -> bool {
        !self.name.is_empty() && valid_text(&self.name) && steam_id(Some(self.steam_appid)) && valid_time(self.resolved_at, now)
    }
}

impl HltbEntry {
    pub fn valid(&self, now: i64) -> bool {
        let result_valid = match self.status {
            HltbStatus::Matched => {
                self.hltb_id.is_some_and(|id| id > 0)
                    && self.game_name.as_deref().is_some_and(valid_text)
                    && self.stats.is_some()
            }
            HltbStatus::NoMatch => self.hltb_id.is_none() && self.game_name.is_none() && self.stats.is_none(),
        };
        result_valid
            && valid_text(&self.title_used)
            && steam_id(self.steam_appid_used)
            && steam_id(self.pinned_id_used)
            && valid_time(self.fetched_at, now)
    }
}

/// Keep the `MAX_ENTRIES` newest entries.
fn cap<T>(map: &mut HashMap<u32, T>, time: impl Fn(&T) -> i64) {
    if map.len() <= MAX_ENTRIES {
        return;
    }
    let mut ordered: Vec<(i64, u32)> = map.iter().map(|(id, entry)| (time(entry), *id)).collect();
    ordered.sort_unstable_by(|a, b| b.cmp(a));
    for (_, id) in ordered.into_iter().skip(MAX_ENTRIES) {
        map.remove(&id);
    }
}

fn section<T: for<'de> Deserialize<'de>>(
    value: Option<&Value>,
    maximum: u32,
    valid: impl Fn(u32, &T) -> bool,
) -> HashMap<u32, T> {
    let Some(entries) = value.and_then(Value::as_object) else { return HashMap::new() };
    entries
        .iter()
        .filter_map(|(id, entry)| {
            let id = key(id, maximum)?;
            let entry = T::deserialize(entry).ok()?;
            valid(id, &entry).then_some((id, entry))
        })
        .collect()
}

impl ProviderCache {
    /// Read a cache file value; invalid entries are dropped one by one.
    pub fn from_value(value: &Value) -> Self {
        let now = now_ms();
        if value.get("version").and_then(Value::as_u64) != Some(1) {
            return Self::default();
        }
        let mut cache = Self {
            ratings: section(value.pointer("/protondb/ratings"), MAX_STEAM_APP_ID, |id, r: &Rating| r.valid(id, now)),
            name_ids: section(value.pointer("/protondb/name_ids"), u32::MAX, |_, n: &NameId| n.valid(now)),
            hltb: section(value.pointer("/hltb/entries"), u32::MAX, |_, e: &HltbEntry| e.valid(now)),
        };
        cache.cap_all();
        cache
    }

    pub fn cap_all(&mut self) {
        cap(&mut self.ratings, |rating| rating.updated_at);
        cap(&mut self.name_ids, |name| name.resolved_at);
        cap(&mut self.hltb, |entry| entry.fetched_at);
    }

    /// Merge frontend ProtonDB results; the newer timestamp wins and invalid entries are skipped.
    pub fn merge_protondb(&mut self, ratings: &Value, name_ids: &Value) -> Result<(), String> {
        if !ratings.is_object() {
            return Err("ratings must be an object".into());
        }
        if !name_ids.is_object() {
            return Err("name_ids must be an object".into());
        }
        let now = now_ms();
        for (id, rating) in section(Some(ratings), MAX_STEAM_APP_ID, |id, r: &Rating| r.valid(id, now)) {
            if self.ratings.get(&id).is_none_or(|current| rating.updated_at > current.updated_at) {
                self.ratings.insert(id, rating);
            }
        }
        for (id, name) in section(Some(name_ids), u32::MAX, |_, n: &NameId| n.valid(now)) {
            if self.name_ids.get(&id).is_none_or(|current| name.resolved_at > current.resolved_at) {
                self.name_ids.insert(id, name);
            }
        }
        self.cap_all();
        Ok(())
    }
}

pub async fn load(path: &Path) -> ProviderCache {
    match tokio::fs::read(path).await {
        Ok(bytes) => match serde_json::from_slice::<Value>(&bytes) {
            Ok(value) if value.get("version").and_then(Value::as_u64) == Some(1) => ProviderCache::from_value(&value),
            Ok(_) => {
                logging::event("provider_cache", "unknown cache version", json!({"path": path}), log::Level::Warn);
                ProviderCache::default()
            }
            Err(error) => {
                logging::event("provider_cache", "invalid cache file", json!({"path": path, "error": error.to_string()}), log::Level::Warn);
                ProviderCache::default()
            }
        },
        Err(error) => {
            logging::event("provider_cache", "cache file unavailable", json!({"path": path, "error": error.to_string()}), log::Level::Info);
            ProviderCache::default()
        }
    }
}

const SAVE_DELAY: std::time::Duration = std::time::Duration::from_secs(1);

/// Save the provider cache at most once per second; `flush` writes any pending change now.
pub fn schedule_save(state: &std::sync::Arc<crate::state::AppState>) {
    if state.provider_cache_dirty.swap(true, Ordering::SeqCst) {
        return;
    }
    let state = std::sync::Arc::clone(state);
    tokio::spawn(async move {
        tokio::select! {
            _ = tokio::time::sleep(SAVE_DELAY) => {},
            _ = state.cancel.cancelled() => {},
        }
        let _ = flush(&state).await;
    });
}

pub async fn flush(state: &crate::state::AppState) -> Result<(), String> {
    if !state.provider_cache_dirty.swap(false, Ordering::SeqCst) {
        return Ok(());
    }
    let cache = state.provider_cache.lock().await;
    save(&state.env.plugin_settings_dir.join(FILENAME), &cache).await
}

pub async fn save(path: &Path, cache: &ProviderCache) -> Result<(), String> {
    let parent = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    tokio::fs::create_dir_all(parent).await.map_err(|error| error.to_string())?;
    let bytes = serde_json::to_vec(cache).map_err(|error| error.to_string())?;
    static NEXT_TEMPORARY: AtomicU64 = AtomicU64::new(0);
    let filename = path.file_name().and_then(|name| name.to_str()).unwrap_or(FILENAME);
    let temporary = path.with_file_name(format!("{filename}.{}.{}.tmp", std::process::id(), NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed)));
    let result = match tokio::fs::write(&temporary, bytes).await {
        Ok(()) => tokio::fs::rename(&temporary, path).await,
        Err(error) => Err(error),
    };
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(&temporary).await;
        logging::event("provider_cache", "failed to save cache", json!({"path": path, "error": error.to_string()}), log::Level::Warn);
        return Err(error.to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn directory() -> PathBuf {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        std::env::temp_dir().join(format!("provider-cache-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)))
    }

    fn hltb(status: &str, fetched_at: i64) -> Value {
        if status == "matched" {
            json!({"status":"matched","hltb_id":7231,"game_name":"Portal 2","stats":{"main":1,"plus":2,"complete":3,"all":4},
                   "steam_appid_used":620,"title_used":"Portal 2","pinned_id_used":null,"fetched_at":fetched_at})
        } else {
            json!({"status":"no_match","hltb_id":null,"game_name":null,"stats":null,
                   "steam_appid_used":null,"title_used":"Game","pinned_id_used":null,"fetched_at":fetched_at})
        }
    }

    #[tokio::test]
    async fn round_trip_keeps_the_file_shape_and_leaves_no_temporary_file() {
        let dir = directory();
        let path = dir.join(FILENAME);
        let mut cache = ProviderCache::from_value(&json!({"version":1,"hltb":{"entries":{"7":hltb("no_match",42)}}}));
        cache
            .merge_protondb(&json!({"620":{"tier":"gold","updated_at":100}}), &json!({"4294967295":{"name":"Portal 2","steam_appid":620,"resolved_at":200}}))
            .unwrap();
        save(&path, &cache).await.unwrap();
        let written: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(written, json!({"version":1,
            "protondb":{"ratings":{"620":{"tier":"gold","updated_at":100}},
                        "name_ids":{"4294967295":{"name":"Portal 2","steam_appid":620,"resolved_at":200}}},
            "hltb":{"entries":{"7":hltb("no_match",42)}}}));
        assert_eq!(load(&path).await, cache);
        let names: Vec<_> = std::fs::read_dir(&dir).unwrap().map(|entry| entry.unwrap().file_name()).collect();
        assert_eq!(names, vec![FILENAME]);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn partial_file_keeps_valid_entries_and_rejects_bad_files() {
        let dir = directory();
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(FILENAME);
        let future = now_ms() + DAY_MS + 1000;
        let mut bad_id = hltb("matched", 5);
        bad_id["hltb_id"] = json!(0);
        let mut no_match_with_id = hltb("no_match", 5);
        no_match_with_id["hltb_id"] = json!(3);
        let value = json!({"version":1, "protondb":{"ratings":{
            "620":{"tier":null,"updated_at":0}, "0":{"tier":"gold","updated_at":1},
            "3":{"tier":"invalid","updated_at":1}, "4":{"tier":"gold","updated_at":future},
            "2147483648":{"tier":"gold","updated_at":1}
        },"name_ids":{
            "4294967295":{"name":"A","steam_appid":620,"resolved_at":1},
            "4294967296":{"name":"B","steam_appid":620,"resolved_at":1},
            "9":{"name":"bad\u{0000}name","steam_appid":620,"resolved_at":1},
            "10":{"name":"B","steam_appid":2147483648u64,"resolved_at":1}
        }},"hltb":{"entries":{"7":hltb("matched",5),"8":null,"9":{"custom":true},"10":bad_id,"11":no_match_with_id}}});
        std::fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        let loaded = load(&path).await;
        assert_eq!(loaded.ratings, HashMap::from([(620, Rating { tier: None, updated_at: 0 })]));
        assert_eq!(loaded.name_ids.keys().collect::<Vec<_>>(), vec![&4294967295]);
        assert_eq!(loaded.hltb.keys().collect::<Vec<_>>(), vec![&7]);
        std::fs::write(&path, b"{broken").unwrap();
        assert_eq!(load(&path).await, ProviderCache::default());
        std::fs::write(&path, br#"{"version":2}"#).unwrap();
        assert_eq!(load(&path).await, ProviderCache::default());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn merge_validates_and_keeps_the_newest_values() {
        let mut cache = ProviderCache::default();
        let future = now_ms() + DAY_MS + 1000;
        cache.merge_protondb(&json!({
            "1":{"tier":"gold","updated_at":10}, "2":{"tier":"unknown","updated_at":10},
            "2147483648":{"tier":"gold","updated_at":10}, "3":{"tier":null,"updated_at":-1},
            "4":{"tier":"silver","updated_at":future}
        }), &json!({"8":{"name":"Old","steam_appid":1,"resolved_at":10}, "9":{"name":"","steam_appid":1,"resolved_at":1}})).unwrap();
        cache.merge_protondb(&json!({"1":{"tier":"silver","updated_at":9}, "5":{"tier":null,"updated_at":11}}),
            &json!({"8":{"name":"New","steam_appid":2,"resolved_at":11}})).unwrap();
        assert_eq!(cache.ratings, HashMap::from([
            (1, Rating { tier: Some(Tier::Gold), updated_at: 10 }),
            (5, Rating { tier: None, updated_at: 11 }),
        ]));
        assert_eq!(cache.name_ids, HashMap::from([(8, NameId { name: "New".into(), steam_appid: 2, resolved_at: 11 })]));
        assert!(cache.merge_protondb(&json!([]), &json!({})).is_err());
        assert!(cache.merge_protondb(&json!({}), &Value::Null).is_err());
    }

    #[test]
    fn oldest_entries_are_removed_at_the_cap() {
        let count = MAX_ENTRIES + 1;
        let ratings: serde_json::Map<String, Value> = (1..=count).map(|id| (id.to_string(), json!({"tier":"gold","updated_at":id}))).collect();
        let names: serde_json::Map<String, Value> = (1..=count).map(|id| (id.to_string(), json!({"name":"Game","steam_appid":1,"resolved_at":id}))).collect();
        let entries: serde_json::Map<String, Value> = (1..=count).map(|id| (id.to_string(), hltb("no_match", id as i64))).collect();
        let cache = ProviderCache::from_value(&json!({"version":1,"protondb":{"ratings":ratings,"name_ids":names},"hltb":{"entries":entries}}));
        for (len, has_oldest, has_newest) in [
            (cache.ratings.len(), cache.ratings.contains_key(&1), cache.ratings.contains_key(&(count as u32))),
            (cache.name_ids.len(), cache.name_ids.contains_key(&1), cache.name_ids.contains_key(&(count as u32))),
            (cache.hltb.len(), cache.hltb.contains_key(&1), cache.hltb.contains_key(&(count as u32))),
        ] {
            assert_eq!((len, has_oldest, has_newest), (MAX_ENTRIES, false, true));
        }
    }
}
