use crate::{
    logging,
    matching::{py_string, py_truthy},
    metadata,
    providers::{community, ign, steam},
    state::{self, AppState},
    storage,
};
use decky_plugin::{MethodResult, RawMethodResult};
use serde_json::{Value, json};
use std::sync::Arc;

pub const METHODS: &[&str] = &[
    "get_platform_capabilities",
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
    "get_metadata",
    "get_all_metadata",
    "remove_metadata",
    "clear_metadata_cache",
    "get_shortcut_name_management",
    "save_shortcut_name_state",
    "clear_shortcut_name_state",
    "frontend_log",
    "get_local_shortcuts",
    "eval_in_big_picture",
    "save_metadata",
    "search_metadata",
    "search_steam_matches",
    "get_steam_match_preview",
    "fetch_metadata",
    "find_ign_trailer",
    "apply_fetched_metadata",
    "auto_fetch_metadata",
    "get_community_fallback_page",
    "enrich_steam_app",
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
pub const RAW_METHODS: &[&str] = &["get_state", "get_metadata", "get_all_metadata"];

pub async fn dispatch_raw(state: &AppState, method: &str, args: &[Value]) -> RawMethodResult {
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
            &data["metadata"]
        }
        _ => return Err(format!("Plugin has no method {method}")),
    };
    serde_json::value::to_raw_value(value).map_err(|error| error.to_string())
}

pub async fn dispatch(state: Arc<AppState>, method: &str, args: Vec<Value>) -> MethodResult {
    match method {
        "get_platform_capabilities" => {
            arity(&args, 0, 0)?;
            tokio::task::spawn_blocking(state::platform_capabilities)
                .await
                .map_err(|error| error.to_string())
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
                &state.store().await?.data()["settings"]["deck_compat_default"]
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
                &state.store().await?.data()["settings"]["deck_compat_default_scope"],
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
                &state.store().await?.data()["settings"]["game_trailers"],
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
                state.store().await?.data()["settings"]["mini_achievements_enabled"]
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
        "get_protondb_badge_settings" => {
            arity(&args, 0, 0)?;
            Ok(storage::normalize_protondb_badge_settings(
                &state.store().await?.data()["settings"]["protondb_badges"],
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
            let key = py_string(&args[0]);
            state
                .change(|transaction| {
                    transaction.remove(&["metadata", &key])?;
                    Ok(transaction
                        .get(&["metadata"])
                        .cloned()
                        .unwrap_or_else(|| json!({})))
                })
                .await
        }
        "clear_metadata_cache" => {
            arity(&args, 0, 0)?;
            let count = state
                .change(|transaction| {
                    let count = transaction
                        .get(&["metadata"])
                        .and_then(Value::as_object)
                        .map_or(0, |metadata| metadata.len());
                    transaction.set(&["metadata"], json!({}))?;
                    Ok(count)
                })
                .await?;
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
            arity(&args, 2, 2)?;
            metadata::save(&state, &args[0], args[1].clone(), false, None).await
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
        "get_steam_match_preview" => {
            arity(&args, 1, 1)?;
            Ok(steam::steam_match_preview(&state.http, &args[0]).await)
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
            arity(&args, 2, 2)?;
            let mode = args[1].as_str().ok_or("Invalid Steam enrichment mode")?;
            Ok(json!(metadata::enrich_steam(&state, &args[0], mode).await?))
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
            arity(&args, 1, 1)?;
            crate::scan_runner::start_scan_missing(Arc::clone(&state), &args[0]).await
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
            arity(&args, 1, 1)?;
            crate::scan_runner::start_refresh_steam_activities(Arc::clone(&state), &args[0]).await
        }
        "refresh_steam_activity_for_app" => {
            arity(&args, 1, 1)?;
            Ok(json!(
                crate::scan_runner::refresh_steam_activity_for_app(&state, &args[0]).await?
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
        "get_update_check_context" | "get_update_settings" => {
            arity(&args, 0, 0)?;
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
        | "set_automatic_update_checks" => {
            arity(&args, 1, 1)?;
            Ok(state
                .updater_call(method, &args)
                .await
                .unwrap_or_else(|error| update_failure(error, false)))
        }
        _ => Err(format!("Plugin has no method {method}")),
    }
}
