//! HowLongToBeat times for game pages: settings gate, cache paths, and lookups.

use crate::{
    logging,
    matching::safe_int,
    metadata,
    provider_cache::{self, HltbEntry, HltbStatus, HltbTimes},
    providers::hltb::{Error, GamePage, LookupInput, LookupOutcome, RefreshOutcome},
    state::AppState,
    storage,
};
use serde_json::{Value, json};
use std::{
    sync::{Arc, atomic::Ordering},
    time::Duration,
};

const DAY_MS: i64 = 86_400_000;
pub const MATCHED_TTL_MS: i64 = 14 * DAY_MS;
pub const NO_MATCH_TTL_MS: i64 = 7 * DAY_MS;
const ERROR_RETRY: Duration = Duration::from_secs(30);
const MAX_TITLE_CHARS: usize = 512;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn steam_app_id(value: &Value) -> Option<u32> {
    safe_int(value).filter(|id| (1..=0x7fff_ffff).contains(id)).map(|id| id as u32)
}

/// What a cached entry was looked up with; any difference makes it invalid.
#[derive(Clone, Debug, PartialEq)]
struct Inputs {
    steam: Option<u32>,
    title: String,
    pinned: Option<u32>,
}

fn same_inputs(entry: &HltbEntry, inputs: &Inputs) -> bool {
    entry.steam_appid_used == inputs.steam && entry.title_used == inputs.title && entry.pinned_id_used == inputs.pinned
}

fn fresh(entry: &HltbEntry, now: i64) -> bool {
    let ttl = if entry.status == HltbStatus::Matched { MATCHED_TTL_MS } else { NO_MATCH_TTL_MS };
    now - entry.fetched_at < ttl
}

fn seconds(value: i64) -> u64 {
    value.max(0) as u64
}

fn entry(page: Option<&GamePage>, inputs: &Inputs, now: i64) -> HltbEntry {
    let id = page.and_then(|page| u32::try_from(page.game_id).ok());
    HltbEntry {
        status: if id.is_some() { HltbStatus::Matched } else { HltbStatus::NoMatch },
        hltb_id: id,
        game_name: page.filter(|_| id.is_some()).map(|page| page.game_name.clone()),
        stats: page.filter(|_| id.is_some()).map(|page| HltbTimes {
            main: seconds(page.comp_main), plus: seconds(page.comp_plus),
            complete: seconds(page.comp_100), all: seconds(page.comp_all),
        }),
        steam_appid_used: inputs.steam,
        title_used: inputs.title.clone(),
        pinned_id_used: inputs.pinned,
        fetched_at: now,
    }
}

fn retry_error(retry_after: Duration) -> Value {
    json!({"status": "error", "retry_after_ms": retry_after.as_millis() as u64})
}

fn reply(entry: &HltbEntry) -> Result<Value, String> {
    serde_json::to_value(entry).map_err(|error| error.to_string())
}

/// HLTB times for one library entry, fetching only when the cached entry is missing,
/// expired, or was found with different inputs.
pub async fn stats(state: &Arc<AppState>, app_id: &Value, is_shortcut: &Value, title: &Value) -> Result<Value, String> {
    let app_id = storage::positive_shortcut_app_id(app_id).ok_or("invalid app id")?;
    let is_shortcut = is_shortcut.as_bool().ok_or("is_shortcut must be a boolean")?;
    let title = title.as_str().ok_or("title must be a string")?.trim();
    if title.contains('\0') || title.chars().count() > MAX_TITLE_CHARS {
        return Err("invalid title".into());
    }
    // Remove metadata or Clear cache after this point makes the lookup's result stale.
    let epoch = state.hltb_epoch.load(Ordering::SeqCst);
    let (enabled, steam, pinned, removed) = {
        let store = state.store().await?;
        let data = store.data();
        let key = app_id.to_string();
        let enabled = storage::normalize_hltb_settings(&data["settings"]["hltb"])["enabled"] == true;
        if is_shortcut {
            let record = &data["metadata"][&key];
            let pinned = steam_app_id(&record["hltb_game_id"]);
            (enabled, steam_app_id(&record["steam_appid"]), pinned, metadata::removed_by_user(data, &key))
        } else {
            (enabled, steam_app_id(&json!(app_id)), None, false)
        }
    };
    if !enabled {
        return Ok(json!({"status": "disabled"}));
    }
    if removed && pinned.is_none() {
        return Ok(json!({"status": "blocked"}));
    }
    let inputs = Inputs { steam, title: title.to_owned(), pinned };
    let now = now_ms();
    let cached = state.provider_cache.lock().await.hltb.get(&app_id).cloned().filter(|cached| same_inputs(cached, &inputs));
    if let Some(cached) = cached.as_ref().filter(|cached| fresh(cached, now)) {
        return reply(cached);
    }
    if let Some(until) = state.hltb_retry.lock().await.get(&app_id).copied() {
        let wait = until.saturating_duration_since(tokio::time::Instant::now());
        if !wait.is_zero() {
            return Ok(retry_error(wait));
        }
    }

    let client = &state.hltb;
    let lookup = LookupInput {
        steam_appid: steam.map(i64::from), title: title.to_owned(),
        pinned_id: pinned.map(i64::from), native_steam: !is_shortcut,
    };
    let saved_id = cached.filter(|cached| cached.status == HltbStatus::Matched).and_then(|cached| cached.hltb_id);
    let result = match saved_id {
        // Expired with the same inputs: one page request, no search.
        Some(id) => match client.refresh(&state.http, i64::from(id), if pinned.is_none() { steam.map(i64::from) } else { None }).await {
            Ok(RefreshOutcome::Updated(page)) => Ok(Some(page)),
            Ok(RefreshOutcome::Invalid) if pinned.is_some() => Ok(None),
            Ok(RefreshOutcome::Invalid) => full_lookup(state, lookup).await,
            Err(error) => Err(error),
        },
        None => full_lookup(state, lookup).await,
    };
    match result {
        Ok(page) => {
            let entry = entry(page.as_ref(), &inputs, now_ms());
            {
                let mut cache = state.provider_cache.lock().await;
                if state.hltb_epoch.load(Ordering::SeqCst) != epoch {
                    // Ask again: the next call sees the removal marker or the cleared cache.
                    return Ok(retry_error(Duration::ZERO));
                }
                cache.hltb.insert(app_id, entry.clone());
                cache.cap_all();
            }
            state.hltb_retry.lock().await.remove(&app_id);
            provider_cache::schedule_save(state);
            reply(&entry)
        }
        Err(error) => {
            let wait = match &error {
                Error::RateLimited { retry_after } => *retry_after,
                Error::Transient(message) => {
                    logging::event("hltb", "lookup failed", json!({"app_id": app_id, "error": message}), log::Level::Warn);
                    ERROR_RETRY
                }
            };
            state.hltb_retry.lock().await.insert(app_id, tokio::time::Instant::now() + wait);
            Ok(retry_error(wait))
        }
    }
}

async fn full_lookup(state: &AppState, lookup: LookupInput) -> Result<Option<GamePage>, Error> {
    Ok(match state.hltb.lookup(&state.http, lookup).await? {
        LookupOutcome::Matched { page, .. } => Some(page),
        LookupOutcome::NoMatch => None,
    })
}

/// Confirm a user-entered HowLongToBeat game ID.
pub async fn check_game_id(state: &AppState, id: &Value) -> Result<Value, String> {
    let id = safe_int(id).filter(|id| (1..=i64::from(i32::MAX)).contains(id)).ok_or("invalid HowLongToBeat game ID")?;
    match state.hltb.game_page(&state.http, id).await {
        Ok(Some(page)) => Ok(json!({"found": true, "game_id": page.game_id, "game_name": page.game_name})),
        Ok(None) => Ok(json!({"found": false})),
        Err(Error::RateLimited { .. }) => Err("HowLongToBeat is busy. Try again in a minute.".into()),
        Err(Error::Transient(message)) => Err(message),
    }
}

/// Forget one game's HLTB result, e.g. after Remove metadata, so it is not shown
/// from the cache and is looked up again only when allowed.
pub async fn forget(state: &Arc<AppState>, app_id: &Value) {
    let Some(app_id) = storage::positive_shortcut_app_id(app_id) else { return };
    state.hltb_epoch.fetch_add(1, Ordering::SeqCst);
    state.hltb_retry.lock().await.remove(&app_id);
    if state.provider_cache.lock().await.hltb.remove(&app_id).is_some() {
        provider_cache::schedule_save(state);
    }
}

pub async fn clear(state: &AppState) -> Result<Value, String> {
    state.hltb_epoch.fetch_add(1, Ordering::SeqCst);
    state.hltb_retry.lock().await.clear();
    let mut cache = state.provider_cache.lock().await;
    cache.hltb.clear();
    state.provider_cache_dirty.store(false, Ordering::SeqCst);
    provider_cache::save(&state.env.plugin_settings_dir.join(provider_cache::FILENAME), &cache).await?;
    Ok(json!({"ok": true}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_entries_are_fresh_only_within_their_lifetime_and_inputs() {
        let now = 100 * DAY_MS;
        let inputs = |steam: u32, title: &str, pinned: Option<u32>| Inputs { steam: Some(steam), title: title.into(), pinned };
        let portal = inputs(620, "Portal 2", None);
        let page = GamePage {
            game_id: 7231, game_name: "Portal 2".into(), comp_main: 30886, comp_plus: 49570,
            comp_100: 82821, comp_all: 38321, profile_steam: 620, profile_steam_alt: 0,
        };
        let matched = entry(Some(&page), &portal, now - MATCHED_TTL_MS + 1);
        assert!(fresh(&matched, now) && same_inputs(&matched, &portal));
        assert!(!fresh(&entry(Some(&page), &portal, now - MATCHED_TTL_MS), now));
        let missing = entry(None, &portal, now - NO_MATCH_TTL_MS + 1);
        assert!(fresh(&missing, now));
        assert!(!fresh(&entry(None, &portal, now - NO_MATCH_TTL_MS), now));
        for changed in [inputs(570, "Portal 2", None), inputs(620, "Portal", None), inputs(620, "Portal 2", Some(1))] {
            assert!(!same_inputs(&matched, &changed));
        }
        assert_eq!(matched.stats, Some(HltbTimes { main: 30886, plus: 49570, complete: 82821, all: 38321 }));
        assert!(matched.valid(now) && missing.valid(now));
    }

    mod stateful {
        use super::super::*;
        use crate::http::{Fixture, Http, Response};
        use crate::providers::hltb::HltbClient;
        use reqwest::{Method, header::HeaderMap};

        struct Root(std::path::PathBuf);
        impl Drop for Root {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }

        async fn state(fixtures: Vec<Fixture>, enabled: bool) -> (Root, Arc<AppState>) {
            state_with(Http::fixtures(fixtures), enabled).await
        }

        async fn state_with(http: Http, enabled: bool) -> (Root, Arc<AppState>) {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let base = std::env::var_os("TMPDIR").map(std::path::PathBuf::from).unwrap_or_else(|| "/var/tmp/omp-1000".into());
            let root = base.join(format!("hltb-stats-test-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
            std::fs::create_dir_all(&root).unwrap();
            let env = decky_plugin::Env {
                plugin_settings_dir: root.join("settings"),
                plugin_runtime_dir: root.join("runtime"),
                plugin_log_dir: root.join("logs"),
                plugin_version: "0.6.1".into(),
                ..Default::default()
            };
            let mut state = AppState::new(env).unwrap();

            let inner = Arc::get_mut(&mut state).unwrap();
            inner.cancel = http.cancel.clone();
            inner.http = http;
            inner.hltb = HltbClient::with_config(Duration::from_millis(1), Duration::from_secs(60), || 1);
            state.initialize().await.unwrap();
            let mut settings = storage::default_hltb_settings();
            settings["enabled"] = json!(enabled);
            state.set_setting("hltb", settings).await.unwrap();
            (Root(root), state)
        }

        fn reply(method: Method, url: &str, status: u16, body: impl Into<Vec<u8>>) -> Fixture {
            Fixture { method, url: url.into(), result: Ok(Response { status, headers: HeaderMap::new(), body: body.into(), url: url.into() }) }
        }
        fn init() -> Fixture {
            reply(Method::GET, "https://howlongtobeat.com/api/search/site/init?t=1", 200, br#"{"token":"t"}"#.to_vec())
        }
        fn search(id: i64, name: &str) -> Fixture {
            let body = json!({"data":[{"game_id":id,"game_name":name,"comp_main":3600,"comp_plus":7200,"comp_100":10800,"comp_all":5400,"comp_all_count":5}]});
            reply(Method::POST, "https://howlongtobeat.com/api/search/site", 200, serde_json::to_vec(&body).unwrap())
        }
        fn page(id: i64, steam: i64, main: i64) -> Fixture {
            let next = json!({"props":{"pageProps":{"game":{"data":{"game":[{"game_id":id,"game_name":"Portal 2",
                "comp_main":main,"comp_plus":2,"comp_100":3,"comp_all":4,"profile_steam":steam,"profile_steam_alt":0}]}}}}});
            let html = format!(r#"<script id="__NEXT_DATA__" type="application/json">{next}</script>"#);
            reply(Method::GET, &format!("https://howlongtobeat.com/game/{id}"), 200, html)
        }
        async fn age(state: &AppState, app_id: u32, days: i64) {
            state.provider_cache.lock().await.hltb.get_mut(&app_id).unwrap().fetched_at = now_ms() - days * DAY_MS;
        }

        #[tokio::test]
        async fn fresh_entries_need_no_request_and_expired_ones_one_page() {
            let (_root, state) = state(vec![init(), search(7231, "Portal 2"), page(7231, 620, 3600), page(7231, 620, 7200)], true).await;
            let first = stats(&state, &json!(620), &json!(false), &json!("Portal 2")).await.unwrap();
            assert_eq!((first["status"].as_str(), first["hltb_id"].as_i64()), (Some("matched"), Some(7231)));
            // Fresh: a further request would hit an empty fixture queue and fail the lookup.
            assert_eq!(stats(&state, &json!(620), &json!(false), &json!("Portal 2")).await.unwrap(), first);
            age(&state, 620, 15).await;
            let refreshed = stats(&state, &json!(620), &json!(false), &json!("Portal 2")).await.unwrap();
            assert_eq!(refreshed["stats"]["main"], 7200);
            state.http.assert_drained();
            provider_cache::flush(&state).await.unwrap();
            let saved = provider_cache::load(&state.env.plugin_settings_dir.join(provider_cache::FILENAME)).await;
            assert_eq!(serde_json::to_value(&saved.hltb[&620]).unwrap(), refreshed);
        }

        #[tokio::test]
        async fn a_changed_steam_match_invalidates_and_a_missing_listing_relooks() {
            let (_root, state) = state(vec![
                init(), search(1, "Game"), page(1, 10, 1),
                search(2, "Game"), page(2, 20, 1),
                page(2, 99, 1), search(3, "Game"), page(3, 20, 1),
            ], true).await;
            let shortcut = json!(3_000_000_000u32);
            for (steam, expected) in [(10, 1), (20, 2)] {
                crate::metadata::save(&state, &shortcut, json!({"title":"Game","steam_appid":steam}), false, None).await.unwrap();
                let found = stats(&state, &shortcut, &json!(true), &json!("Game")).await.unwrap();
                assert_eq!(found["hltb_id"], expected, "Steam match {steam}");
            }
            // Expired, and HLTB now lists another Steam app on that page: search again.
            age(&state, 3_000_000_000, 15).await;
            assert_eq!(stats(&state, &shortcut, &json!(true), &json!("Game")).await.unwrap()["hltb_id"], 3);
            state.http.assert_drained();
        }

        #[tokio::test]
        async fn remove_metadata_drops_a_cached_title_match_from_memory_and_disk() {
            let (_root, state) = state(vec![init(), search(62941, "Hades")], true).await;
            let shortcut = json!(3_000_000_002u32);
            crate::metadata::save(&state, &shortcut, json!({"title":"Hades","description":"x"}), false, None).await.unwrap();
            assert_eq!(stats(&state, &shortcut, &json!(true), &json!("Hades")).await.unwrap()["hltb_id"], 62941);
            provider_cache::flush(&state).await.unwrap();
            crate::rpc::dispatch(Arc::clone(&state), "remove_metadata", vec![shortcut.clone()]).await.unwrap();
            assert_eq!(stats(&state, &shortcut, &json!(true), &json!("Hades")).await.unwrap()["status"], "blocked");
            provider_cache::flush(&state).await.unwrap();
            let saved = provider_cache::load(&state.env.plugin_settings_dir.join(provider_cache::FILENAME)).await;
            assert!(!saved.hltb.contains_key(&3_000_000_002));
            state.http.assert_drained();
        }

        #[tokio::test]
        async fn a_lookup_that_finishes_after_remove_metadata_is_not_saved() {
            let mut http = Http::fixtures(vec![init(), search(62941, "Hades")]);
            let gate = http.gate_next_request();
            let (_root, state) = state_with(http, true).await;
            let shortcut = json!(3_000_000_003u32);
            crate::metadata::save(&state, &shortcut, json!({"title":"Hades","description":"x"}), false, None).await.unwrap();
            let pending = {
                let (state, shortcut) = (Arc::clone(&state), shortcut.clone());
                tokio::spawn(async move { stats(&state, &shortcut, &json!(true), &json!("Hades")).await })
            };
            tokio::time::timeout(Duration::from_secs(2), gate.started.notified()).await.unwrap();
            crate::rpc::dispatch(Arc::clone(&state), "remove_metadata", vec![shortcut.clone()]).await.unwrap();
            gate.resume.notify_one();
            assert_eq!(pending.await.unwrap().unwrap()["status"], "error");
            assert!(!state.provider_cache.lock().await.hltb.contains_key(&3_000_000_003));
            assert_eq!(stats(&state, &shortcut, &json!(true), &json!("Hades")).await.unwrap()["status"], "blocked");
        }

        #[tokio::test]
        async fn disabled_removed_and_pinned_games() {
            let (_root, off) = state(vec![], false).await;
            assert_eq!(stats(&off, &json!(620), &json!(false), &json!("Portal 2")).await.unwrap()["status"], "disabled");

            let (_root, state) = state(vec![page(42, 0, 1)], true).await;
            let shortcut = json!(3_000_000_001u32);
            crate::metadata::save(&state, &shortcut, json!({"title":"Game"}), false, None).await.unwrap();
            crate::metadata::remove(&state, &shortcut).await.unwrap();
            assert_eq!(stats(&state, &shortcut, &json!(true), &json!("Game")).await.unwrap()["status"], "blocked");
            crate::metadata::save(&state, &shortcut, json!({"title":"Game","hltb_game_id":42}), false, None).await.unwrap();
            assert_eq!(stats(&state, &shortcut, &json!(true), &json!("Game")).await.unwrap()["hltb_id"], 42);
            state.http.assert_drained();
        }

        #[tokio::test]
        async fn failures_are_not_cached_and_wait_before_retrying() {
            let (_root, state) = state(vec![init(), reply(Method::POST, "https://howlongtobeat.com/api/search/site", 500, b"".to_vec())], true).await;
            let failed = stats(&state, &json!(620), &json!(false), &json!("Portal 2")).await.unwrap();
            assert_eq!(failed["status"], "error");
            assert!(failed["retry_after_ms"].as_u64().unwrap() > 0);
            assert!(stats(&state, &json!(620), &json!(false), &json!("Portal 2")).await.unwrap()["status"] == "error");
            assert!(!state.provider_cache.lock().await.hltb.contains_key(&620));
        }
    }
}
