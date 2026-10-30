use crate::logging;
use serde_json::{Map, Value, json};
use std::{
    collections::HashSet,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

pub const FILENAME: &str = "provider_cache.json";
const MAX_ENTRIES: usize = 20_000;
const DAY_MS: f64 = 86_400_000.0;

pub fn empty() -> Value {
    json!({"version": 1, "protondb": {"ratings": {}, "name_ids": {}}, "hltb": {"entries": {}}})
}

fn now_ms() -> f64 {
    chrono::Utc::now().timestamp_millis() as f64
}

fn valid_id(key: &str, maximum: u64) -> bool {
    !key.is_empty() && key.bytes().all(|byte| byte.is_ascii_digit())
        && key.parse::<u64>().is_ok_and(|id| id > 0 && id <= maximum)
}

fn timestamp(value: Option<&Value>, now: f64) -> Option<f64> {
    value.and_then(Value::as_f64).filter(|time| time.is_finite() && *time >= 0.0 && *time <= now + DAY_MS)
}

fn valid_rating(key: &str, value: &Value, now: f64) -> bool {
    valid_id(key, 0x7fff_ffff)
        && value.as_object().is_some_and(|entry| {
            matches!(entry.get("tier"), Some(Value::Null))
                || entry.get("tier").and_then(Value::as_str)
                    .is_some_and(|tier| matches!(tier, "platinum" | "gold" | "silver" | "bronze" | "borked"))
        })
        && timestamp(value.get("updated_at"), now).is_some()
}

fn valid_name_id(key: &str, value: &Value, now: f64) -> bool {
    valid_id(key, 0xffff_ffff)
        && value.get("name").and_then(Value::as_str).is_some_and(|name| {
            !name.is_empty() && !name.contains('\0') && name.chars().count() <= 512
        })
        && value.get("steam_appid").and_then(Value::as_u64).is_some_and(|id| (1..=0x7fff_ffff).contains(&id))
        && timestamp(value.get("resolved_at"), now).is_some()
}

fn cap(map: &mut Map<String, Value>, time_key: &str) {
    if map.len() <= MAX_ENTRIES {
        return;
    }
    let mut ordered: Vec<_> = map.iter().map(|(key, value)| {
        (key.as_str(), value.get(time_key).and_then(Value::as_f64).unwrap_or(0.0))
    }).collect();
    ordered.sort_unstable_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(b.0)));
    let keep: HashSet<String> = ordered.into_iter().take(MAX_ENTRIES).map(|(key, _)| key.to_owned()).collect();
    map.retain(|key, _| keep.contains(key));
}

fn take_map(value: Option<&mut Value>) -> Map<String, Value> {
    match value.map(Value::take) {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    }
}

fn normalize(mut value: Value, now: f64) -> Value {
    if value.get("version").and_then(Value::as_u64) != Some(1) {
        return empty();
    }
    let mut ratings = take_map(value.get_mut("protondb").and_then(|v| v.get_mut("ratings")));
    let mut name_ids = take_map(value.get_mut("protondb").and_then(|v| v.get_mut("name_ids")));
    let mut hltb = take_map(value.get_mut("hltb").and_then(|v| v.get_mut("entries")));
    ratings.retain(|key, value| valid_rating(key, value, now));
    name_ids.retain(|key, value| valid_name_id(key, value, now));
    hltb.retain(|_, value| value.is_object());
    cap(&mut ratings, "updated_at");
    cap(&mut name_ids, "resolved_at");
    cap(&mut hltb, "fetched_at");
    json!({"version": 1, "protondb": {"ratings": ratings, "name_ids": name_ids}, "hltb": {"entries": hltb}})
}

pub async fn load(path: &Path) -> Value {
    match tokio::fs::read(path).await {
        Ok(bytes) => match serde_json::from_slice::<Value>(&bytes) {
            Ok(value) if value.get("version").and_then(Value::as_u64) == Some(1) => normalize(value, now_ms()),
            Ok(_) => {
                logging::event("provider_cache", "unknown cache version", json!({"path": path}), log::Level::Warn);
                empty()
            }
            Err(error) => {
                logging::event("provider_cache", "invalid cache file", json!({"path": path, "error": error.to_string()}), log::Level::Warn);
                empty()
            }
        },
        Err(error) => {
            logging::event("provider_cache", "cache file unavailable", json!({"path": path, "error": error.to_string()}), log::Level::Info);
            empty()
        }
    }
}

pub fn merge_protondb(cache: &mut Value, ratings: &Value, name_ids: &Value) -> Result<(), String> {
    let ratings = ratings.as_object().ok_or("ratings must be an object")?;
    let name_ids = name_ids.as_object().ok_or("name_ids must be an object")?;
    let now = now_ms();
    for (incoming, section, time_key, validate) in [
        (ratings, "ratings", "updated_at", valid_rating as fn(&str, &Value, f64) -> bool),
        (name_ids, "name_ids", "resolved_at", valid_name_id as fn(&str, &Value, f64) -> bool),
    ] {
        let target = cache["protondb"][section].as_object_mut().expect("normalized provider cache");
        for (key, value) in incoming {
            if !validate(key, value, now) {
                continue;
            }
            let incoming_time = value[time_key].as_f64().unwrap();
            if target.get(key).and_then(|entry| entry[time_key].as_f64()).is_none_or(|time| incoming_time > time) {
                target.insert(key.clone(), value.clone());
            }
        }
        cap(target, time_key);
    }
    Ok(())
}

pub async fn save(path: &Path, cache: &Value) -> Result<(), String> {
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

    #[tokio::test]
    async fn round_trip_preserves_hltb_and_leaves_no_temporary_file() {
        let dir = directory();
        let path = dir.join(FILENAME);
        let mut cache = empty();
        cache["hltb"]["entries"]["7"] = json!({"status":"matched", "fetched_at":42});
        merge_protondb(&mut cache, &json!({"620":{"tier":"gold","updated_at":100}}), &json!({"4294967295":{"name":"Portal 2","steam_appid":620,"resolved_at":200}})).unwrap();
        save(&path, &cache).await.unwrap();
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
        let future = now_ms() + DAY_MS + 1000.0;
        let value = json!({"version":1, "protondb":{"ratings":{
            "620":{"tier":null,"updated_at":0}, "0":{"tier":"gold","updated_at":1},
            "3":{"tier":"invalid","updated_at":1}, "4":{"tier":"gold","updated_at":future}
        },"name_ids":{
            "4294967295":{"name":"A","steam_appid":620,"resolved_at":1},
            "4294967296":{"name":"B","steam_appid":620,"resolved_at":1},
            "9":{"name":"bad\u{0000}name","steam_appid":620,"resolved_at":1},
            "10":{"name":"B","steam_appid":2147483648u64,"resolved_at":1}
        }},"hltb":{"entries":{"7":{"custom":true},"8":null}}});
        std::fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        let loaded = load(&path).await;
        assert_eq!(loaded["protondb"]["ratings"], json!({"620":{"tier":null,"updated_at":0}}));
        assert_eq!(loaded["protondb"]["name_ids"], json!({"4294967295":{"name":"A","steam_appid":620,"resolved_at":1}}));
        assert_eq!(loaded["hltb"]["entries"], json!({"7":{"custom":true}}));
        std::fs::write(&path, b"{broken").unwrap();
        assert_eq!(load(&path).await, empty());
        std::fs::write(&path, br#"{"version":2}"#).unwrap();
        assert_eq!(load(&path).await, empty());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn merge_validates_and_keeps_the_newest_values() {
        let mut cache = empty();
        let future = now_ms() + DAY_MS + 1000.0;
        merge_protondb(&mut cache, &json!({
            "1":{"tier":"gold","updated_at":10}, "2":{"tier":"unknown","updated_at":10},
            "2147483648":{"tier":"gold","updated_at":10}, "3":{"tier":null,"updated_at":-1},
            "4":{"tier":"silver","updated_at":future}
        }), &json!({"8":{"name":"Old","steam_appid":1,"resolved_at":10}, "9":{"name":"","steam_appid":1,"resolved_at":1}})).unwrap();
        merge_protondb(&mut cache, &json!({"1":{"tier":"silver","updated_at":9}, "5":{"tier":null,"updated_at":11}}), &json!({"8":{"name":"New","steam_appid":2,"resolved_at":11}})).unwrap();
        assert_eq!(cache["protondb"]["ratings"], json!({"1":{"tier":"gold","updated_at":10}, "5":{"tier":null,"updated_at":11}}));
        assert_eq!(cache["protondb"]["name_ids"], json!({"8":{"name":"New","steam_appid":2,"resolved_at":11}}));
        assert!(merge_protondb(&mut cache, &json!([]), &json!({})).is_err());
        assert!(merge_protondb(&mut cache, &json!({}), &Value::Null).is_err());
    }

    #[test]
    fn oldest_entries_are_removed_at_the_cap() {
        let ratings: Map<String, Value> = (1..=MAX_ENTRIES + 1).map(|id| (id.to_string(), json!({"tier":"gold","updated_at":id}))).collect();
        let names: Map<String, Value> = (1..=MAX_ENTRIES + 1).map(|id| (id.to_string(), json!({"name":"Game","steam_appid":1,"resolved_at":id}))).collect();
        let hltb: Map<String, Value> = (1..=MAX_ENTRIES + 1).map(|id| (id.to_string(), json!({"fetched_at":id}))).collect();
        let cache = normalize(json!({"version":1,"protondb":{"ratings":ratings,"name_ids":names},"hltb":{"entries":hltb}}), now_ms());
        for map in [&cache["protondb"]["ratings"], &cache["protondb"]["name_ids"], &cache["hltb"]["entries"]] {
            assert_eq!(map.as_object().unwrap().len(), MAX_ENTRIES);
            assert!(map.get("1").is_none());
            assert!(map.get((MAX_ENTRIES + 1).to_string()).is_some());
        }
    }
}
