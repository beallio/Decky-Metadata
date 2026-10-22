use crate::{logging,matching::{py_string,py_truthy},state::{self,AppState},storage};
use decky_plugin::MethodResult;
use serde_json::{Value,json};
use std::sync::Arc;

pub const METHODS:&[&str]=&[
    "get_platform_capabilities","get_system_versions","get_plugin_version","get_plugin_logs","get_state",
    "get_debug_logging","set_debug_logging","get_compatibility_default","set_compatibility_default",
    "get_compatibility_default_scope","set_compatibility_default_scope","get_trailer_settings","set_trailer_settings",
    "get_mini_achievements_enabled","set_mini_achievements_enabled","get_protondb_badge_settings","set_protondb_badge_settings",
    "get_metadata","get_all_metadata","remove_metadata","clear_metadata_cache","get_shortcut_name_management",
    "save_shortcut_name_state","clear_shortcut_name_state","frontend_log","get_local_shortcuts",
];

fn arity(args:&[Value],minimum:usize,maximum:usize)->Result<(),String> {
    if (minimum..=maximum).contains(&args.len()) {Ok(())} else {Err(format!("expected {minimum}..={maximum} arguments, got {}",args.len()))}
}

pub async fn dispatch(state:Arc<AppState>,method:&str,args:Vec<Value>)->MethodResult {
    match method {
        "get_platform_capabilities"=>{
            arity(&args,0,0)?;
            tokio::task::spawn_blocking(state::platform_capabilities).await.map_err(|error| error.to_string())
        },
        "get_system_versions"=>{arity(&args,0,0)?;Ok(state::system_versions(&state.env).await)},
        "get_plugin_version"=>{arity(&args,0,0)?;Ok(state.env.plugin_version.clone().into())},
        "get_plugin_logs"=>{arity(&args,0,0)?;Ok(logging::read_tail(&logging::log_path(&state.env)).await.into())},
        "get_state"=>{arity(&args,0,0)?;Ok(state.store().await?.data().clone())},
        "get_debug_logging"=>{
            arity(&args,0,0)?;let enabled=py_truthy(&state.store().await?.data()["settings"]["debug_logging"]);
            logging::set_debug(enabled);Ok(enabled.into())
        },
        "set_debug_logging"=>{
            arity(&args,1,1)?;let enabled=py_truthy(&args[0]);
            state.set_setting("debug_logging",enabled.into()).await?;logging::set_debug(enabled);
            logging::event("load","debug logging updated",json!({"enabled":enabled}),log::Level::Info);Ok(enabled.into())
        },
        "get_compatibility_default"=>{arity(&args,0,0)?;Ok(json!(storage::compatibility_default(&state.store().await?.data()["settings"]["deck_compat_default"])))},
        "set_compatibility_default"=>{arity(&args,1,1)?;state.set_setting("deck_compat_default",storage::validate_compatibility_default(&args[0])?).await},
        "get_compatibility_default_scope"=>{arity(&args,0,0)?;Ok(storage::compatibility_default_scope(&state.store().await?.data()["settings"]["deck_compat_default_scope"]).unwrap_or("all").into())},
        "set_compatibility_default_scope"=>{arity(&args,1,1)?;state.set_setting("deck_compat_default_scope",storage::validate_compatibility_default_scope(&args[0])?.into()).await},
        "get_trailer_settings"=>{arity(&args,0,0)?;Ok(storage::normalize_trailer_settings(&state.store().await?.data()["settings"]["game_trailers"]))},
        "set_trailer_settings"=>{arity(&args,1,1)?;state.set_setting("game_trailers",storage::validate_trailer_settings(&args[0])?).await},
        "get_mini_achievements_enabled"=>{arity(&args,0,0)?;Ok(state.store().await?.data()["settings"]["mini_achievements_enabled"].as_bool().unwrap_or(false).into())},
        "set_mini_achievements_enabled"=>{arity(&args,1,1)?;state.set_setting("mini_achievements_enabled",storage::validate_mini_achievements_enabled(&args[0])?.into()).await},
        "get_protondb_badge_settings"=>{arity(&args,0,0)?;Ok(storage::normalize_protondb_badge_settings(&state.store().await?.data()["settings"]["protondb_badges"]))},
        "set_protondb_badge_settings"=>{arity(&args,1,1)?;state.set_setting("protondb_badges",storage::validate_protondb_badge_settings(&args[0])?).await},
        "get_metadata"=>{arity(&args,1,1)?;Ok(state.store().await?.data()["metadata"][py_string(&args[0])].clone())},
        "get_all_metadata"=>{arity(&args,0,0)?;Ok(state.store().await?.data()["metadata"].clone())},
        "remove_metadata"=>{
            arity(&args,1,1)?;let key=py_string(&args[0]);
            state.change(|transaction| {transaction.remove(&["metadata",&key])?;Ok(transaction.get(&["metadata"]).cloned().unwrap_or_else(|| json!({})))}).await
        },
        "clear_metadata_cache"=>{
            arity(&args,0,0)?;
            let count=state.change(|transaction| {
                let count=transaction.get(&["metadata"]).and_then(Value::as_object).map_or(0,|metadata| metadata.len());
                transaction.set(&["metadata"],json!({}))?;Ok(count)
            }).await?;
            logging::event("cache","metadata cache cleared",json!({"count":count}),log::Level::Info);
            Ok(json!({"ok":true,"cleared":count}))
        },
        "get_shortcut_name_management"=>{arity(&args,1,1)?;state.shortcut_name_management(&args[0]).await},
        "save_shortcut_name_state"=>{arity(&args,4,4)?;state.save_shortcut_name_state(&args[0],&args[1],&args[2],&args[3]).await},
        "clear_shortcut_name_state"=>{
            arity(&args,1,1)?;let id=storage::positive_shortcut_app_id(&args[0]).ok_or("invalid shortcut app id")?.to_string();
            state.change(|transaction| {transaction.remove(&["shortcut_names",&id])?;Ok(json!({"ok":true}))}).await
        },
        "frontend_log"=>{
            arity(&args,0,4)?;
            let area=args.first().filter(|value| py_truthy(value)).map(py_string).unwrap_or_else(|| "ui".into());
            let message=args.get(1).filter(|value| py_truthy(value)).map(py_string).unwrap_or_default();
            let fields=args.get(2).filter(|value| value.is_object()).cloned().unwrap_or(Value::Null);
            let level=args.get(3).map(py_string).unwrap_or_else(|| "debug".into());
            let level=match level.trim().to_lowercase().as_str() {"info"=>log::Level::Info,"warning"|"warn"=>log::Level::Warn,"error"=>log::Level::Error,_=>log::Level::Debug};
            logging::event(&area,&message,fields,level);Ok(true.into())
        },
        "get_local_shortcuts"=>{arity(&args,0,0)?;Ok(Value::Array(state.local_shortcuts().await?.iter().map(state::shortcut_json).collect()))},
        _=>Err(format!("Plugin has no method {method}")),
    }
}
