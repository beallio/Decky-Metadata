use crate::{
    logging,
    matching::{py_string, py_truthy},
    metadata,
    providers::{community, ign, steam},
    state::{self, AppState},
    storage,
};
use decky_plugin::{MethodResult, RawMethodResult};
use serde::{Serialize, Serializer};
use serde_json::{Value, json};
use std::sync::Arc;

pub const METHODS: &[&str] = &[
    "get_platform_capabilities",
    "get_native_css_classes",
    "get_system_versions",
    "get_plugin_version",
    "get_plugin_logs",
    "get_state",
    "get_debug_logging",
    "set_debug_logging",
    "get_compatibility_default",
    "set_compatibility_default",
    "get_compatibility_default_scope",
    "set_compatibility_default_scope",
    "get_trailer_settings",
    "set_trailer_settings",
    "get_mini_achievements_enabled",
    "set_mini_achievements_enabled",
    "get_protondb_badge_settings",
    "set_protondb_badge_settings",
    "get_editor_header_settings",
    "set_editor_header_settings",
    "get_artwork_settings",
    "set_artwork_settings",
    "get_artwork_locked",
    "set_artwork_locked",
    "get_all_artwork_locks",
    "get_artwork_summary",
    "get_game_artwork_state",
    "fetch_steam_artwork_asset",
    "clear_local_artwork_file",
    "get_sgdb_key_status",
    "sgdb_search_games",
    "sgdb_resolve_game",
    "sgdb_list_assets",
    "sgdb_fetch_asset",
    "read_local_artwork_file",
    "get_transparent_artwork_asset",
    "set_sgdb_game_override",
    "clear_sgdb_game_override",
    "get_provider_cache",
    "put_protondb_cache",
    "get_hltb_settings",
    "set_hltb_settings",
    "get_hltb_stats",
    "check_hltb_game_id",
    "search_hltb_games",
    "clear_hltb_cache",
    "get_metadata",
    "get_all_metadata",
    "get_all_steam_overrides",
    "get_steam_override",
    "save_steam_override",
    "remove_metadata",
    "clear_metadata_cache",
    "get_shortcut_name_management",
    "save_shortcut_name_state",
    "clear_shortcut_name_state",
    "frontend_log",
    "get_local_shortcuts",
    "eval_in_big_picture",
    "save_metadata",
    "save_previewed_metadata",
    "search_metadata",
    "search_steam_matches",
    "fetch_metadata",
    "find_ign_trailer",
    "apply_fetched_metadata",
    "preview_fetched_metadata",
    "auto_fetch_metadata",
    "get_community_fallback_page",
    "enrich_steam_app",
    "preview_steam_metadata",
    "refresh_delisted_index",
    "get_delisted_index_status",
    "start_scan_missing",
    "get_scan_progress",
    "get_missing_metadata_count",
    "start_refresh_steam_activities",
    "refresh_steam_activity_for_app",
    "get_activity_refresh_progress",
    "check_for_plugin_update",
    "revalidate_plugin_update",
    "record_update_install_requested",
    "confirm_update_install_handoff",
    "clear_pending_update_install",
    "get_update_check_context",
    "get_update_settings",
    "set_update_channel",
    "set_automatic_update_checks",
    "set_testing_tab_enabled",
    "get_testing_versions",
    "prepare_testing_version",
];

fn arity(args: &[Value], minimum: usize, maximum: usize) -> Result<(), String> {
    if (minimum..=maximum).contains(&args.len()) {
        Ok(())
    } else {
        Err(format!(
            "expected {minimum}..={maximum} arguments, got {}",
            args.len()
        ))
    }
}

fn update_failure(error: String, check: bool) -> Value {
    logging::event(
        "update",
        "updater RPC failed",
        json!({"error":error}),
        log::Level::Error,
    );
    let mut result = json!({"status":"failed","message":error});
    if check {
        result["checked_at"] = chrono::Utc::now()
            .to_rfc3339_opts(chrono::SecondsFormat::Micros, false)
            .into();
    }
    result
}

/// Store reads that return large parts of the settings file. They serialize straight
/// from the locked store, so a reply never needs a full in-memory copy of it.
pub const RAW_METHODS: &[&str] = &["get_state", "get_metadata", "get_all_metadata", "get_provider_cache"];

pub async fn dispatch_raw(state: &AppState, method: &str, args: &[Value]) -> RawMethodResult {
    if method == "get_provider_cache" {
        arity(args, 0, 0)?;
        return serde_json::value::to_raw_value(&*state.provider_cache.lock().await)
            .map_err(|error| error.to_string());
    }
    let store = state.store().await?;
    let data = store.data();
    let value = match method {
        "get_state" => {
            arity(args, 0, 0)?;
            data
        }
        "get_metadata" => {
            arity(args, 1, 1)?;
            &data["metadata"][py_string(&args[0])]
        }
        "get_all_metadata" => {
            arity(args, 0, 0)?;
            return serde_json::value::to_raw_value(&WithoutNews(&data["metadata"]))
                .map_err(|error| error.to_string());
        }
        _ => return Err(format!("Plugin has no method {method}")),
    };
    serde_json::value::to_raw_value(value).map_err(|error| error.to_string())
}

/// The all-records reply leaves out non-empty `steam_news`, most of its bytes; the frontend
/// loads a record's news with `get_metadata` when needed. An absent key means "not loaded",
/// so empty news stays as `[]`.
struct WithoutNews<'a>(&'a Value);

impl Serialize for WithoutNews<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.0.as_object() {
            Some(records) => serializer
                .collect_map(records.iter().map(|(key, record)| (key, Summary(record)))),
            None => self.0.serialize(serializer),
        }
    }
}

struct Summary<'a>(&'a Value);

impl Serialize for Summary<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.0.as_object() {
            Some(record) => serializer.collect_map(record.iter().filter(|(key, value)| {
                key.as_str() != "steam_news" || value.as_array().is_some_and(Vec::is_empty)
            })),
            None => self.0.serialize(serializer),
        }
    }
}

/// Preference getters reject with a stable code when the settings file could not be read, like the original backend.
async fn loaded_store<'a>(
    state: &'a AppState,
    code: &str,
) -> Result<tokio::sync::MutexGuard<'a, storage::Storage>, String> {
    let storage = state.store().await?;
    if storage.loaded_successfully() {
        Ok(storage)
    } else {
        Err(code.to_owned())
    }
}

pub async fn dispatch(state: Arc<AppState>, method: &str, args: Vec<Value>) -> MethodResult {
    match method {
        "put_protondb_cache" => {
            arity(&args, 2, 2)?;
            state.provider_cache.lock().await.merge_protondb(&args[0], &args[1])?;
            crate::provider_cache::schedule_save(&state);
            Ok(json!({"ok": true}))
        }
        "get_hltb_settings" => {
            arity(&args, 0, 0)?;
            Ok(storage::normalize_hltb_settings(
                &loaded_store(&state, "hltb_settings_unavailable").await?.data()["settings"]["hltb"],
            ))
        }
        "set_hltb_settings" => {
            arity(&args, 1, 1)?;
            state.set_setting("hltb", storage::validate_hltb_settings(&args[0])?).await
        }
        "get_hltb_stats" => {
            arity(&args, 3, 4)?;
            crate::hltb::stats(&state, &args[0], &args[1], &args[2], args.get(3)).await
        }
        "get_all_steam_overrides" => {
            arity(&args, 0, 0)?;
            Ok(state.store().await?.data()["steam_overrides"].clone())
        }
        "get_steam_override" => {
            arity(&args, 1, 1)?;
            let Some(app_id) = storage::positive_steam_app_id(&args[0]) else {
                return Ok(Value::Null);
            };
            Ok(state.store().await?.data()["steam_overrides"][app_id.to_string()].clone())
        }
        "save_steam_override" => {
            arity(&args, 2, 2)?;
            let app_id = storage::positive_steam_app_id(&args[0])
                .ok_or("invalid_steam_app_id")?;
            let normalized = storage::validate_steam_override(&args[1])?;
            let key = app_id.to_string();
            let saved = state
                .change(|transaction| {
                    match &normalized {
                        Some(entry) => {
                            transaction.set(&["steam_overrides", &key], entry.clone())?;
                        }
                        None => {
                            transaction.remove(&["steam_overrides", &key])?;
                        }
                    }
                    Ok(normalized.clone().unwrap_or(Value::Null))
                })
                .await?;
            crate::hltb::forget(&state, &json!(app_id)).await;
            Ok(saved)
        }
        "check_hltb_game_id" => {
            arity(&args, 1, 1)?;
            crate::hltb::check_game_id(&state, &args[0]).await
        }
        "search_hltb_games" => {
            arity(&args, 1, 1)?;
            crate::hltb::search_games(&state, &args[0]).await
        }
        "clear_hltb_cache" => {
            arity(&args, 0, 0)?;
            crate::hltb::clear(&state).await
        }
        "get_platform_capabilities" => {
            arity(&args, 0, 0)?;
            tokio::task::spawn_blocking(state::platform_capabilities)
                .await
                .map_err(|error| error.to_string())
        }
        "get_native_css_classes" => {
            arity(&args, 0, 0)?;
            let decky_home = state.env.decky_home.clone();
            let resolved = tokio::task::spawn_blocking(move || {
                crate::css_classes::resolve_translated_css_classes(&decky_home)
            })
            .await
            .map_err(|error| error.to_string())?;
            serde_json::to_value(resolved).map_err(|error| error.to_string())
        }
        "get_system_versions" => {
            arity(&args, 0, 0)?;
            Ok(state::system_versions(&state.env).await)
        }
        "get_plugin_version" => {
            arity(&args, 0, 0)?;
            Ok(state.env.plugin_version.clone().into())
        }
        "get_plugin_logs" => {
            arity(&args, 0, 0)?;
            let Some(path) = logging::install(&state.env) else {
                return Ok(String::new().into());
            };
            Ok(logging::read_tail(&path).await.into())
        }
        "get_debug_logging" => {
            arity(&args, 0, 0)?;
            let enabled = py_truthy(&state.store().await?.data()["settings"]["debug_logging"]);
            logging::set_debug(enabled);
            Ok(enabled.into())
        }
        "set_debug_logging" => {
            arity(&args, 1, 1)?;
            let enabled = py_truthy(&args[0]);
            state.set_setting("debug_logging", enabled.into()).await?;
            logging::set_debug(enabled);
            logging::event(
                "load",
                "debug logging updated",
                json!({"enabled":enabled}),
                log::Level::Info,
            );
            Ok(enabled.into())
        }
        "get_compatibility_default" => {
            arity(&args, 0, 0)?;
            Ok(json!(storage::compatibility_default(
                &loaded_store(&state, "compat_default_unavailable").await?.data()["settings"]["deck_compat_default"]
            )))
        }
        "set_compatibility_default" => {
            arity(&args, 1, 1)?;
            state
                .set_setting(
                    "deck_compat_default",
                    storage::validate_compatibility_default(&args[0])?,
                )
                .await
        }
        "get_compatibility_default_scope" => {
            arity(&args, 0, 0)?;
            Ok(storage::compatibility_default_scope(
                &loaded_store(&state, "compat_scope_unavailable").await?.data()["settings"]
                    ["deck_compat_default_scope"],
            )
            .unwrap_or("all")
            .into())
        }
        "set_compatibility_default_scope" => {
            arity(&args, 1, 1)?;
            state
                .set_setting(
                    "deck_compat_default_scope",
                    storage::validate_compatibility_default_scope(&args[0])?.into(),
                )
                .await
        }
        "get_trailer_settings" => {
            arity(&args, 0, 0)?;
            Ok(storage::normalize_trailer_settings(
                &loaded_store(&state, "trailer_settings_unavailable").await?.data()["settings"]["game_trailers"],
            ))
        }
        "set_trailer_settings" => {
            arity(&args, 1, 1)?;
            state
                .set_setting(
                    "game_trailers",
                    storage::validate_trailer_settings(&args[0])?,
                )
                .await
        }
        "get_mini_achievements_enabled" => {
            arity(&args, 0, 0)?;
            Ok(
                loaded_store(&state, "mini_achievements_settings_unavailable").await?.data()["settings"]
                    ["mini_achievements_enabled"]
                    .as_bool()
                    .unwrap_or(false)
                    .into(),
            )
        }
        "set_mini_achievements_enabled" => {
            arity(&args, 1, 1)?;
            state
                .set_setting(
                    "mini_achievements_enabled",
                    storage::validate_mini_achievements_enabled(&args[0])?.into(),
                )
                .await
        }
        "get_editor_header_settings" => {
            arity(&args, 0, 0)?;
            Ok(storage::normalize_editor_header_settings(
                &loaded_store(&state, "editor_header_settings_unavailable").await?.data()["settings"]
                    ["editor_header"],
            ))
        }
        "set_editor_header_settings" => {
            arity(&args, 1, 1)?;
            state
                .set_setting(
                    "editor_header",
                    storage::validate_editor_header_settings(&args[0])?,
                )
                .await
        }
        "get_artwork_settings" => {
            arity(&args, 0, 0)?;
            Ok(storage::normalize_artwork_settings(
                &loaded_store(&state, "artwork_settings_unavailable")
                    .await?
                    .data()["settings"]["steam_artwork"],
            ))
        }
        "set_artwork_settings" => {
            arity(&args, 1, 1)?;
            state
                .set_setting(
                    "steam_artwork",
                    storage::validate_artwork_settings(&args[0])?,
                )
                .await
        }
        "get_artwork_locked" => {
            arity(&args, 1, 1)?;
            let Some(app_id) = storage::positive_shortcut_app_id(&args[0]) else {
                return Ok(Value::Bool(false));
            };
            Ok(Value::Bool(
                state.store().await?.data()["artwork_locks"]
                    .get(app_id.to_string())
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            ))
        }
        "set_artwork_locked" => {
            arity(&args, 2, 2)?;
            let app_id =
                storage::positive_shortcut_app_id(&args[0]).ok_or("invalid_shortcut_app_id")?;
            let locked = args[1]
                .as_bool()
                .ok_or_else(|| "invalid artwork lock value".to_owned())?;
            let key = app_id.to_string();
            state
                .change(|transaction| {
                    if locked {
                        transaction.set(&["artwork_locks", &key], Value::Bool(true))?;
                    } else {
                        transaction.remove(&["artwork_locks", &key])?;
                    }
                    Ok(Value::Bool(locked))
                })
                .await
        }
        "get_all_artwork_locks" => {
            arity(&args, 0, 0)?;
            Ok(state.store().await?.data()["artwork_locks"].clone())
        }
        "get_artwork_summary" => {
            arity(&args, 1, 1)?;
            crate::artwork::get_artwork_summary(&state, &args[0]).await
        }
        "get_game_artwork_state" => {
            arity(&args, 2, 2)?;
            crate::artwork::get_game_artwork_state(&state, &args[0], &args[1]).await
        }
        "fetch_steam_artwork_asset" => {
            arity(&args, 3, 3)?;
            crate::artwork::fetch_steam_artwork_asset(&state, &args[0], &args[1], &args[2]).await
        }
        "clear_local_artwork_file" => {
            arity(&args, 2, 2)?;
            crate::artwork::clear_local_artwork_file(&state, &args[0], &args[1]).await
        }
        "get_sgdb_key_status" => {
            arity(&args, 0, 0)?;
            crate::steamgriddb::get_sgdb_key_status(&state).await
        }
        "sgdb_search_games" => {
            arity(&args, 1, 1)?;
            crate::steamgriddb::sgdb_search_games(&state, &args[0]).await
        }
        "sgdb_resolve_game" => {
            arity(&args, 3, 3)?;
            crate::steamgriddb::sgdb_resolve_game(&state, &args[0], &args[1], &args[2]).await
        }
        "sgdb_list_assets" => {
            arity(&args, 4, 4)?;
            crate::steamgriddb::sgdb_list_assets(&state, &args[0], &args[1], &args[2], &args[3])
                .await
        }
        "sgdb_fetch_asset" => {
            arity(&args, 3, 3)?;
            crate::steamgriddb::sgdb_fetch_asset(&state, &args[0], &args[1], &args[2]).await
        }
        "read_local_artwork_file" => {
            arity(&args, 3, 3)?;
            crate::steamgriddb::read_local_artwork_file(&state, &args[0], &args[1], &args[2]).await
        }
        "get_transparent_artwork_asset" => {
            arity(&args, 2, 2)?;
            crate::steamgriddb::get_transparent_artwork_asset(&state, &args[0], &args[1]).await
        }
        "set_sgdb_game_override" => {
            arity(&args, 3, 3)?;
            crate::steamgriddb::set_sgdb_game_override(&state, &args[0], &args[1], &args[2]).await
        }
        "clear_sgdb_game_override" => {
            arity(&args, 1, 1)?;
            crate::steamgriddb::clear_sgdb_game_override(&state, &args[0]).await
        }
        "get_protondb_badge_settings" => {
            arity(&args, 0, 0)?;
            Ok(storage::normalize_protondb_badge_settings(
                &loaded_store(&state, "protondb_settings_unavailable").await?.data()["settings"]
                    ["protondb_badges"],
            ))
        }
        "set_protondb_badge_settings" => {
            arity(&args, 1, 1)?;
            state
                .set_setting(
                    "protondb_badges",
                    storage::validate_protondb_badge_settings(&args[0])?,
                )
                .await
        }
        "remove_metadata" => {
            arity(&args, 1, 1)?;
            let removed = metadata::remove(&state, &args[0]).await?;
            crate::hltb::forget(&state, &args[0]).await;
            Ok(removed)
        }
        "clear_metadata_cache" => {
            arity(&args, 0, 0)?;
            let count = crate::scan_runner::clear_metadata_when_idle(&state).await?;
            logging::event(
                "cache",
                "metadata cache cleared",
                json!({"count":count}),
                log::Level::Info,
            );
            Ok(json!({"ok":true,"cleared":count}))
        }
        "get_shortcut_name_management" => {
            arity(&args, 1, 1)?;
            state.shortcut_name_management(&args[0]).await
        }
        "save_shortcut_name_state" => {
            arity(&args, 4, 4)?;
            state
                .save_shortcut_name_state(&args[0], &args[1], &args[2], &args[3])
                .await
        }
        "clear_shortcut_name_state" => {
            arity(&args, 1, 1)?;
            let id = storage::positive_shortcut_app_id(&args[0])
                .ok_or("invalid shortcut app id")?
                .to_string();
            state
                .change(|transaction| {
                    transaction.remove(&["shortcut_names", &id])?;
                    Ok(json!({"ok":true}))
                })
                .await
        }
        "frontend_log" => {
            arity(&args, 0, 4)?;
            let area = args
                .first()
                .filter(|value| py_truthy(value))
                .map(py_string)
                .unwrap_or_else(|| "ui".into());
            let message = args
                .get(1)
                .filter(|value| py_truthy(value))
                .map(py_string)
                .unwrap_or_default();
            let fields = args
                .get(2)
                .filter(|value| value.is_object())
                .cloned()
                .unwrap_or(Value::Null);
            let level = args.get(3).map(py_string).unwrap_or_else(|| "debug".into());
            let level = match level.trim().to_lowercase().as_str() {
                "info" => log::Level::Info,
                "warning" | "warn" => log::Level::Warn,
                "error" => log::Level::Error,
                _ => log::Level::Debug,
            };
            logging::event(&area, &message, fields, level);
            Ok(true.into())
        }
        "get_local_shortcuts" => {
            arity(&args, 0, 0)?;
            Ok(Value::Array(
                state
                    .local_shortcuts()
                    .await?
                    .iter()
                    .map(state::shortcut_json)
                    .collect(),
            ))
        }
        "eval_in_big_picture" => {
            arity(&args, 1, 1)?;
            Ok(state.cef.eval_in_big_picture(&args[0]).await)
        }
        "save_metadata" => {
            arity(&args, 2, 3)?;
            // An optional third argument is the record the caller started from (null = absent).
            // The save then commits only if the stored record still equals it, else returns null.
            match args.get(2) {
                None => metadata::save(&state, &args[0], args[1].clone(), false, None).await,
                Some(expected) => metadata::save_guarded(
                    &state,
                    &args[0],
                    args[1].clone(),
                    false,
                    None,
                    Some(expected),
                )
                .await
                .map(|saved| saved.unwrap_or(Value::Null)),
            }
        }
        "save_previewed_metadata" => {
            arity(&args, 3, 3)?;
            // The scan pipeline's trust rule applies: only a positive ID equal to the saved
            // record's steam_appid keeps the sent compat and news fields.
            let trusted = crate::matching::safe_int(&args[2]).filter(|id| *id > 0);
            Ok(json!(
                metadata::save(&state, &args[0], args[1].clone(), false, trusted).await?
            ))
        }
        "search_metadata" => {
            arity(&args, 1, 2)?;
            Ok(json!(
                ign::search_metadata(&state.http, &args[0], args.get(1).unwrap_or(&json!(8)))
                    .await?
            ))
        }
        "search_steam_matches" => {
            arity(&args, 1, 2)?;
            Ok(
                steam::search_steam_matches(
                    &state.http,
                    &args[0],
                    args.get(1).unwrap_or(&json!(8)),
                )
                .await,
            )
        }
        "fetch_metadata" => {
            arity(&args, 1, 1)?;
            Ok(json!(
                metadata::fetch(&state, &metadata::text(&args[0])).await?
            ))
        }
        "find_ign_trailer" => {
            arity(&args, 1, 2)?;
            let game_url = args
                .get(1)
                .filter(|value| !value.is_null())
                .map(metadata::text);
            Ok(
                ign::find_trailer(&state.http, &metadata::text(&args[0]), game_url.as_deref())
                    .await
                    .unwrap_or(Value::Null),
            )
        }
        "apply_fetched_metadata" => {
            arity(&args, 2, 2)?;
            Ok(json!(
                metadata::apply_fetched(&state, &args[0], &metadata::text(&args[1])).await?
            ))
        }
        "preview_fetched_metadata" => {
            arity(&args, 2, 2)?;
            Ok(json!(
                metadata::preview_fetched(&state, &args[0], &metadata::text(&args[1])).await?
            ))
        }
        "auto_fetch_metadata" => {
            arity(&args, 2, 2)?;
            Ok(json!(
                metadata::apply_auto_fetched(&state, &args[0], &metadata::text(&args[1])).await?
            ))
        }
        "get_community_fallback_page" => {
            arity(&args, 1, 2)?;
            let record = state.store().await?.data()["metadata"][py_string(&args[0])].clone();
            let result = community::fallback_page(
                &state.http,
                record.is_object().then_some(&record),
                args.get(1).unwrap_or(&json!(1)),
            )
            .await;
            logging::event(
                "community",
                "fallback selected",
                json!({"source":result["source"],"app_id":args[0],
                "steam_appid":crate::matching::safe_int(&record["steam_appid"]).filter(|id| *id>0).unwrap_or(0),
                "page":result["page"],"count":result["items"].as_array().map_or(0,Vec::len)}),
                log::Level::Debug,
            );
            Ok(result)
        }
        "enrich_steam_app" => {
            arity(&args, 2, 3)?;
            let mode = args[1].as_str().ok_or("Invalid Steam enrichment mode")?;
            Ok(json!(
                metadata::enrich_steam(
                    &state,
                    &args[0],
                    mode,
                    steam::steam_language(args.get(2)),
                )
                .await?
            ))
        }
        "preview_steam_metadata" => {
            arity(&args, 1, 2)?;
            Ok(json!(
                metadata::preview_steam(&state, &args[0], steam::steam_language(args.get(1)))
                    .await?
            ))
        }
        "refresh_delisted_index" => {
            arity(&args, 0, 0)?;
            let index = state.ensure_delisted_index(true).await;
            Ok(
                json!({"ok":index.is_some(),"count":index.as_ref().and_then(|index| index["apps"].as_array()).map_or(0,Vec::len),
                "fetched_at":index.as_ref().map(|index| index["fetched_at"].clone()).unwrap_or(json!(0))}),
            )
        }
        "get_delisted_index_status" => {
            arity(&args, 0, 0)?;
            Ok(state.delisted_status().await)
        }
        "start_scan_missing" => {
            arity(&args, 1, 2)?;
            crate::scan_runner::start_scan_missing(
                Arc::clone(&state),
                &args[0],
                steam::steam_language(args.get(1)),
            )
            .await
        }
        "get_scan_progress" => {
            arity(&args, 0, 0)?;
            Ok(crate::scan_runner::get_scan_progress(&state).await)
        }
        "get_missing_metadata_count" => {
            arity(&args, 1, 1)?;
            Ok(json!(
                crate::scan_runner::get_missing_metadata_count(&state, &args[0]).await?
            ))
        }
        "start_refresh_steam_activities" => {
            arity(&args, 1, 2)?;
            crate::scan_runner::start_refresh_steam_activities(
                Arc::clone(&state),
                &args[0],
                steam::steam_language(args.get(1)),
            )
            .await
        }
        "refresh_steam_activity_for_app" => {
            arity(&args, 1, 2)?;
            Ok(json!(
                crate::scan_runner::refresh_steam_activity_for_app(
                    &state,
                    &args[0],
                    steam::steam_language(args.get(1)),
                )
                .await?
            ))
        }
        "get_activity_refresh_progress" => {
            arity(&args, 0, 0)?;
            Ok(crate::scan_runner::get_activity_refresh_progress(&state).await)
        }
        "check_for_plugin_update" => {
            arity(&args, 1, 2)?;
            Ok(state
                .updater_call(method, &args)
                .await
                .unwrap_or_else(|error| update_failure(error, true)))
        }
        "get_update_check_context" | "get_update_settings" | "get_testing_versions" => {
            arity(&args, 0, 0)?;
            Ok(state
                .updater_call(method, &args)
                .await
                .unwrap_or_else(|error| update_failure(error, false)))
        }
        "prepare_testing_version" => {
            arity(&args, 2, 2)?;
            Ok(state
                .updater_call(method, &args)
                .await
                .unwrap_or_else(|error| update_failure(error, false)))
        }
        "clear_pending_update_install" => {
            arity(&args, 0, 1)?;
            Ok(state
                .updater_call(method, &args)
                .await
                .unwrap_or_else(|error| update_failure(error, false)))
        }
        "revalidate_plugin_update"
        | "record_update_install_requested"
        | "confirm_update_install_handoff"
        | "set_update_channel"
        | "set_automatic_update_checks"
        | "set_testing_tab_enabled" => {
            arity(&args, 1, 1)?;
            Ok(state
                .updater_call(method, &args)
                .await
                .unwrap_or_else(|error| update_failure(error, false)))
        }
        _ => Err(format!("Plugin has no method {method}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// A fresh backend over `settings_file` bytes (none = no file); returns its root and state.
    async fn test_state(settings_file: Option<&[u8]>) -> (std::path::PathBuf, Arc<AppState>) {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let base = std::env::var_os("TMPDIR")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| "/var/tmp/omp-1000".into());
        let root = base.join(format!(
            "metadata-rpc-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let settings = root.join("settings");
        std::fs::create_dir_all(&settings).unwrap();
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        if let Some(bytes) = settings_file {
            std::fs::write(settings.join(storage::SETTINGS_FILE_NAME), bytes).unwrap();
        }
        let state = AppState::new(decky_plugin::Env {
            plugin_settings_dir: settings,
            plugin_runtime_dir: root.join("runtime"),
            plugin_log_dir: root.join("logs"),
            plugin_version: "0.5.5".into(),
            ..Default::default()
        })
        .unwrap();
        state.initialize().await.unwrap();
        (root, state)
    }

    #[tokio::test]
    async fn guarded_save_commits_only_over_the_expected_record() {
        let (root, state) = test_state(None).await;
        let save = |args: Vec<Value>| dispatch(Arc::clone(&state), "save_metadata", args);
        let original = save(vec![json!(7), json!({"title":"Game","source":"IGN"})]).await.unwrap();
        // A scan saved a newer record after the caller read `original`.
        let newer = save(vec![json!(7), json!({"title":"Game","source":"IGN","description":"Scan"})])
            .await
            .unwrap();
        let stale = json!({"title":"Game","source":"IGN","screenshots":[{"url":"https://a.example/1.png"}]});
        assert_eq!(save(vec![json!(7), stale.clone(), original]).await.unwrap(), Value::Null);
        assert_eq!(state.store().await.unwrap().data()["metadata"]["7"], newer);
        // A removed record (expected was present) and an absent record (expected null).
        assert_eq!(save(vec![json!(8), stale.clone(), newer.clone()]).await.unwrap(), Value::Null);
        assert!(state.store().await.unwrap().data()["metadata"].get("8").is_none());
        let created = save(vec![json!(8), stale.clone(), Value::Null]).await.unwrap();
        assert_eq!(created["screenshots"][0]["url"], "https://a.example/1.png");
        let updated = save(vec![json!(7), stale, newer]).await.unwrap();
        assert_eq!(updated["screenshots"][0]["url"], "https://a.example/1.png");
        state.shutdown().await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn previewed_save_trusts_only_the_previewed_steam_match() {
        let (root, state) = test_state(None).await;
        let call = |method: &'static str, args: Vec<Value>| dispatch(Arc::clone(&state), method, args);
        let news = |id: &str| {
            json!([{"id":id,"title":id,"url":"https://store.steampowered.com/news/1"}])
        };
        let seed = |app_id: i64| {
            let state = Arc::clone(&state);
            let news = news("stored");
            async move {
                dispatch(
                    state,
                    "save_metadata",
                    vec![json!(app_id), json!({"title":"Game","steam_appid":10,
                        "deck_compat_category":1,"steamos_compat_category":2,
                        "steam_news":news,"steam_dlc_appids":[11],"has_points_shop":true})],
                )
                .await
                .unwrap()
            }
        };

        // A trusted preview of a new match keeps the previewed provider fields.
        assert_eq!(seed(7).await["steam_appid"], 10);
        let saved = call(
            "save_previewed_metadata",
            vec![
                json!(7),
                json!({"title":"Game","steam_appid":20,"deck_compat_category":3,
                    "steamos_compat_category":1,"steam_news":news("fresh"),
                    "steam_dlc_appids":[22],"has_points_shop":true}),
                json!(20),
            ],
        )
        .await
        .unwrap();
        assert_eq!(saved["steam_appid"], 20);
        assert_eq!(saved["deck_compat_category"], 3);
        assert_eq!(saved["steamos_compat_category"], 1);
        assert_eq!(saved["steam_news"][0]["id"], "fresh");
        assert_eq!(saved["steam_dlc_appids"], json!([22]));
        assert_eq!(saved["has_points_shop"], true);

        // A mismatched trusted id is an untrusted save: the new match clears the fields.
        assert_eq!(seed(8).await["steam_appid"], 10);
        let untrusted = call(
            "save_previewed_metadata",
            vec![
                json!(8),
                json!({"title":"Game","steam_appid":20,"deck_compat_category":3,
                    "steamos_compat_category":1,"steam_news":news("fresh"),
                    "steam_dlc_appids":[22],"has_points_shop":true}),
                json!(99),
            ],
        )
        .await
        .unwrap();
        assert_eq!(untrusted["steam_appid"], 20);
        for field in [
            "deck_compat_category",
            "steamos_compat_category",
            "steam_machine_compat_category",
            "steam_frame_compat_category",
        ] {
            assert!(untrusted[field].is_null(), "{field}");
        }
        assert_eq!(untrusted["steam_news"], json!([]));
        assert_eq!(untrusted["steam_dlc_appids"], json!([]));
        assert_eq!(untrusted["has_points_shop"], false);

        // Refreshing the same match stores the previewed categories, not the stored ones.
        assert_eq!(seed(9).await["steam_appid"], 10);
        let refreshed = call(
            "save_previewed_metadata",
            vec![
                json!(9),
                json!({"title":"Game","steam_appid":10,"deck_compat_category":3,
                    "steamos_compat_category":1,"steam_news":news("fresh")}),
                json!(10),
            ],
        )
        .await
        .unwrap();
        assert_eq!(refreshed["steam_appid"], 10);
        assert_eq!(refreshed["deck_compat_category"], 3);
        assert_eq!(refreshed["steamos_compat_category"], 1);
        assert_eq!(refreshed["steam_news"][0]["id"], "fresh");

        // Arity is exactly three arguments; a non-positive id means a plain save.
        assert!(call("save_previewed_metadata", vec![json!(1), json!({"title":"Game"})])
            .await
            .is_err());
        assert!(call(
            "save_previewed_metadata",
            vec![json!(1), json!({"title":"Game"}), json!(0), json!("extra")],
        )
        .await
        .is_err());
        assert_eq!(
            call(
                "save_previewed_metadata",
                vec![json!(1), json!({"title":"Plain"}), json!(0)],
            )
            .await
            .unwrap()["title"],
            "Plain"
        );
        state.shutdown().await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn preview_fetched_metadata_dispatch_requires_two_arguments() {
        let (root, state) = test_state(None).await;
        let call = |args: Vec<Value>| {
            dispatch(Arc::clone(&state), "preview_fetched_metadata", args)
        };
        // An empty slug fetches nothing, so no network is reached.
        assert_eq!(call(vec![json!({"title":"Game"}), json!("")]).await.unwrap(), Value::Null);
        assert!(call(vec![json!({"title":"Game"})]).await.is_err());
        assert!(call(vec![json!({"title":"Game"}), json!(""), json!("extra")])
            .await
            .is_err());
        // A non-object draft is rejected before fetching.
        assert!(call(vec![json!("nope"), json!("")]).await.is_err());
        state.shutdown().await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn removal_is_saved_on_disk_until_clear_cache() {
        let (root, state) = test_state(None).await;
        let call = |method: &'static str, args: Vec<Value>| dispatch(Arc::clone(&state), method, args);
        call("save_metadata", vec![json!(5), json!({"title":"Dolphin","steam_appid":400})]).await.unwrap();
        assert_eq!(call("remove_metadata", vec![json!(5)]).await.unwrap(), json!({}));
        // Save after Remove keeps the title-only record blocked from automatic matching.
        call("save_metadata", vec![json!(5), json!({"title":"Dolphin","steam_appid":null})]).await.unwrap();
        let saved = std::fs::read(root.join("settings").join(storage::SETTINGS_FILE_NAME)).unwrap();
        let saved: Value = serde_json::from_slice(&saved).unwrap();
        assert!(metadata::removed_by_user(&saved, "5"));

        call("clear_metadata_cache", Vec::new()).await.unwrap();
        assert!(!metadata::removed_by_user(state.store().await.unwrap().data(), "5"));
        state.shutdown().await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn all_records_reply_leaves_out_only_non_empty_news() {
        let (root, state) = test_state(None).await;
        let news = json!([{"id":"n1","title":"Patch","url":"https://store.steampowered.com/news/1","date":1}]);
        for (id, record) in [
            (1, json!({"title":"With news","source":"Steam","steam_news":news})),
            (2, json!({"title":"No news","source":"Steam","steam_news":[]})),
        ] {
            dispatch(Arc::clone(&state), "save_metadata", vec![json!(id), record]).await.unwrap();
        }
        let read = |method: &'static str, args: Vec<Value>| {
            let state = Arc::clone(&state);
            async move {
                let raw = dispatch_raw(&state, method, &args).await.unwrap();
                serde_json::from_str::<Value>(raw.get()).unwrap()
            }
        };
        let all = read("get_all_metadata", Vec::new()).await;
        assert!(all["1"].get("steam_news").is_none());
        assert_eq!(all["1"]["title"], "With news");
        assert!(all["1"]["steam_news_enriched_at"].is_number());
        assert_eq!(all["2"]["steam_news"], json!([]));
        // The single-record read stays complete, and the stored record keeps its news.
        let full = read("get_metadata", vec![json!(1)]).await;
        assert_eq!(full["steam_news"][0]["id"], "n1");
        assert_eq!(state.store().await.unwrap().data()["metadata"]["1"], full);
        state.shutdown().await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn steam_language_arguments_are_optional_and_unknown_values_fall_back() {
        let (root, state) = test_state(None).await;
        // Old one- and two-argument callers still dispatch.
        for (method, args) in [
            ("enrich_steam_app", vec![json!(1), json!("metadata")]),
            ("start_scan_missing", vec![json!([])]),
            ("start_refresh_steam_activities", vec![json!([])]),
            ("refresh_steam_activity_for_app", vec![json!(1)]),
        ] {
            dispatch(Arc::clone(&state), method, args).await.unwrap();
        }
        state.jobs.drain().await;
        // An unknown language is accepted and normalized instead of rejecting the call.
        for (method, args) in [
            (
                "enrich_steam_app",
                vec![json!(1), json!("metadata"), json!("klingon")],
            ),
            ("start_scan_missing", vec![json!([]), json!("klingon")]),
            (
                "start_refresh_steam_activities",
                vec![json!([]), json!("klingon")],
            ),
            (
                "refresh_steam_activity_for_app",
                vec![json!(1), json!("klingon")],
            ),
        ] {
            dispatch(Arc::clone(&state), method, args).await.unwrap();
        }
        state.jobs.drain().await;
        assert!(
            dispatch(
                Arc::clone(&state),
                "enrich_steam_app",
                vec![json!(1), json!("metadata"), json!("english"), json!("extra")],
            )
            .await
            .is_err()
        );
        state.shutdown().await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn steam_preview_dispatch_accepts_one_or_two_arguments() {
        let (root, state) = test_state(None).await;
        let call = |args: Vec<Value>| {
            dispatch(Arc::clone(&state), "preview_steam_metadata", args)
        };
        // No explicit match, so neither call reaches the network.
        assert_eq!(call(vec![json!({"title":"Game"})]).await.unwrap(), Value::Null);
        assert_eq!(
            call(vec![json!({"title":"Game"}), json!("klingon")])
                .await
                .unwrap(),
            Value::Null
        );
        assert!(call(Vec::new()).await.is_err());
        assert!(call(vec![json!({"title":"Game"}), json!("english"), json!("extra")])
            .await
            .is_err());
        state.shutdown().await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn preference_getters_reject_an_unreadable_settings_file() {
        let (root, state) = test_state(Some(b"{broken")).await;
        let path = root.join("settings").join(storage::SETTINGS_FILE_NAME);

        let getters = [
            "get_compatibility_default",
            "get_compatibility_default_scope",
            "get_trailer_settings",
            "get_mini_achievements_enabled",
            "get_protondb_badge_settings",
        ];
        for method in getters {
            assert!(dispatch(Arc::clone(&state), method, Vec::new()).await.is_err(), "{method}");
        }
        std::fs::write(&path, br#"{"settings":{"mini_achievements_enabled":true}}"#).unwrap();
        // Coarse filesystem clocks can repeat an mtime; the store reloads only when it changes.
        let modified = std::fs::metadata(&path).unwrap().modified().unwrap()
            + std::time::Duration::from_secs(1);
        std::fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(modified))
            .unwrap();
        assert_eq!(
            dispatch(Arc::clone(&state), "get_mini_achievements_enabled", Vec::new())
                .await
                .unwrap(),
            json!(true)
        );
        state.shutdown().await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn steam_overrides_stay_isolated_from_metadata_and_clear_cache() {
        let (root, state) = test_state(None).await;
        let call = |method: &'static str, args: Vec<Value>| dispatch(Arc::clone(&state), method, args);

        assert_eq!(call("get_all_steam_overrides", Vec::new()).await.unwrap(), json!({}));
        assert_eq!(call("get_steam_override", vec![json!(65540)]).await.unwrap(), Value::Null);

        // Shortcut app IDs and invalid HLTB IDs are rejected.
        assert!(call("save_steam_override", vec![json!(0x8000_0001u32), json!({"hltb_game_id": 4031})]).await.is_err());
        assert!(call("save_steam_override", vec![json!(65540), json!({"hltb_game_id": 0})]).await.is_err());

        // Valid Steam override persists, does not appear in metadata, and survives clear_metadata_cache.
        assert_eq!(
            call("save_steam_override", vec![json!(65540), json!({"hltb_game_id": 4031})]).await.unwrap(),
            json!({"hltb_game_id": 4031})
        );
        assert_eq!(
            call("get_steam_override", vec![json!(65540)]).await.unwrap(),
            json!({"hltb_game_id": 4031})
        );
        assert_eq!(
            call("get_all_steam_overrides", Vec::new()).await.unwrap(),
            json!({"65540": {"hltb_game_id": 4031}})
        );
        let all_metadata = serde_json::from_str::<Value>(
            dispatch_raw(&state, "get_all_metadata", &[]).await.unwrap().get(),
        )
        .unwrap();
        assert_eq!(all_metadata, json!({}));

        call("clear_metadata_cache", Vec::new()).await.unwrap();
        assert_eq!(
            call("get_steam_override", vec![json!(65540)]).await.unwrap(),
            json!({"hltb_game_id": 4031})
        );

        // Clearing hltb_game_id removes the override entry completely.
        assert_eq!(
            call("save_steam_override", vec![json!(65540), json!({"hltb_game_id": null})]).await.unwrap(),
            Value::Null
        );
        assert_eq!(call("get_all_steam_overrides", Vec::new()).await.unwrap(), json!({}));

        state.shutdown().await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn sgdb_settings_overrides_and_local_artwork_rpcs() {
        let (root, state) = test_state(None).await;
        let call = |method: &'static str, args: Vec<Value>| dispatch(Arc::clone(&state), method, args);

        // Extended artwork settings normalize & persist cleanly.
        let initial = call("get_artwork_settings", Vec::new()).await.unwrap();
        assert_eq!(initial["defaultTab"], "cover");
        assert_eq!(initial["sgdbApiKey"], "");
        assert_eq!(
            initial["tabOrder"],
            json!(["cover", "wide", "hero", "logo", "icon", "manage"])
        );
        assert_eq!(initial["hiddenTabs"], json!([]));

        let mut updated = initial.clone();
        updated["sgdbApiKey"] = json!("  my-test-key  ");
        updated["defaultTab"] = json!("hero");
        updated["tabOrder"] = json!(["hero", "cover", "wide", "logo", "icon", "manage"]);
        updated["hiddenTabs"] = json!(["icon"]);
        updated["filters"]["cover"]["nsfw"] = json!(true);
        let saved = call("set_artwork_settings", vec![updated]).await.unwrap();
        assert_eq!(saved["sgdbApiKey"], "my-test-key");
        assert_eq!(saved["defaultTab"], "hero");
        assert_eq!(saved["hiddenTabs"], json!(["icon"]));
        assert_eq!(saved["filters"]["cover"]["nsfw"], true);

        let key_status = call("get_sgdb_key_status", Vec::new()).await.unwrap();
        assert_eq!(key_status["hasUserKey"], true);
        assert_eq!(key_status["configured"], true);

        // Per-game SGDB overrides accept both native Steam IDs and non-Steam shortcut IDs.
        assert!(state.store().await.unwrap().data()["sgdb_game_overrides"]
            .get("1091500").is_none());
        let over = call(
            "set_sgdb_game_override",
            vec![json!(1091500), json!(5258006), json!("Cyberpunk 2077")],
        )
        .await
        .unwrap();
        assert_eq!(over, json!({"sgdb_game_id": 5258006, "name": "Cyberpunk 2077"}));
        assert_eq!(
            state.store().await.unwrap().data()["sgdb_game_overrides"]["1091500"],
            over
        );
        // Resolve game uses persisted override before network lookup.
        let resolved = call(
            "sgdb_resolve_game",
            vec![json!(1091500), json!(1091500), json!("Cyberpunk 2077")],
        )
        .await
        .unwrap();
        assert_eq!(resolved["override"], true);
        assert_eq!(resolved["game"]["id"], 5258006);

        call("clear_sgdb_game_override", vec![json!(1091500)]).await.unwrap();
        assert!(state.store().await.unwrap().data()["sgdb_game_overrides"]
            .get("1091500").is_none());

        // Transparent PNG asset & local file asset work and sniff valid PNG.
        let transparent = call(
            "get_transparent_artwork_asset",
            vec![json!(1091500), json!("logo")],
        )
        .await
        .unwrap();
        assert_eq!(transparent["slot"], "logo");
        assert_eq!(transparent["ext"], "png");
        assert_eq!(transparent["mime"], "image/png");
        assert!(!transparent["base64"].as_str().unwrap().is_empty());

        let local_png = root.join("sample.png");
        std::fs::write(&local_png, crate::steamgriddb::TRANSPARENT_PNG).unwrap();
        let local = call(
            "read_local_artwork_file",
            vec![json!(1091500), json!("cover"), json!(local_png.to_string_lossy())],
        )
        .await
        .unwrap();
        assert_eq!(local["slot"], "cover");
        assert_eq!(local["ext"], "png");
        assert_eq!(local["base64"], transparent["base64"]);

        let bad_file = root.join("not-an-image.txt");
        std::fs::write(&bad_file, b"hello world").unwrap();
        assert!(call(
            "read_local_artwork_file",
            vec![json!(1091500), json!("cover"), json!(bad_file.to_string_lossy())],
        )
        .await
        .is_err());

        state.shutdown().await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }
}
