use crate::{http::Http,logging,matching,shortcuts_vdf::{self,Shortcut,VdfValue},steam_paths,storage::{Storage,StoreTransaction}};
use decky_plugin::Env;
use serde_json::{Value,json};
use std::{collections::HashSet,sync::Arc,time::Duration};
use tokio::sync::{Mutex,MutexGuard,OnceCell};
use tokio_util::sync::CancellationToken;

pub struct AppState {
    pub env:Env,
    pub cancel:CancellationToken,
    pub http:Http,
    storage:OnceCell<Mutex<Storage>>,
    pub delisted:Mutex<Option<Value>>,
}

impl AppState {
    pub fn new(env:Env)->Result<Arc<Self>,String> {
        let cancel=CancellationToken::new();
        let http=Http::new(cancel.clone(),&env.plugin_version)?;
        Ok(Arc::new(Self {env,cancel,http,storage:OnceCell::new(),delisted:Mutex::new(None)}))
    }

    pub async fn initialize(&self)->Result<(),String> {
        logging::install(&self.env);
        logging::event("load","backend startup begin",Value::Null,log::Level::Info);
        if self.env.plugin_settings_dir.as_os_str().is_empty() {return Err("DECKY_PLUGIN_SETTINGS_DIR is not set".into());}
        let cached=read_cached_index(&self.env.plugin_settings_dir).await;
        let mut storage=Storage::open(self.env.plugin_settings_dir.clone()).await?;
        storage.normalize_loaded_store_states(cached.as_ref()).await;
        logging::set_debug(matching::py_truthy(&storage.data()["settings"]["debug_logging"]));
        *self.delisted.lock().await=cached;
        self.storage.set(Mutex::new(storage)).map_err(|_| "backend initialized twice".to_owned())?;
        logging::event("load","backend ready",Value::Null,log::Level::Info);
        Ok(())
    }

    pub async fn store(&self)->Result<MutexGuard<'_,Storage>,String> {
        let mut storage=self.storage.get().ok_or("backend is not initialized")?.lock().await;
        if storage.refresh().await? {
            let index=read_cached_index(&self.env.plugin_settings_dir).await;
            storage.normalize_loaded_store_states(index.as_ref()).await;
            *self.delisted.lock().await=index;
        }
        Ok(storage)
    }

    pub async fn change<R>(&self,mutation:impl FnOnce(&mut StoreTransaction<'_>)->Result<R,String>)->Result<R,String> {
        let mut storage=self.store().await?;
        if self.cancel.is_cancelled() {return Err("backend stopping".into());}
        storage.transaction(mutation).await
    }

    pub async fn set_setting(&self,key:&str,value:Value)->Result<Value,String> {
        self.change(|transaction| {
            transaction.set(&["settings",key],value.clone())?;
            Ok(value)
        }).await
    }

    pub async fn shutdown(&self)->Result<(),String> {
        self.cancel.cancel();
        // A replacement already in progress must finish its atomic section.
        tokio::time::timeout(Duration::from_secs(4),async {
            if let Some(storage)=self.storage.get() {let _write=storage.lock().await;}
        }).await.map_err(|_| "backend shutdown timed out".to_owned())?;
        logging::event("load","backend unloaded",Value::Null,log::Level::Info);
        Ok(())
    }

    pub async fn local_shortcuts(&self)->Result<Vec<Shortcut>,String> {
        tokio::task::spawn_blocking(read_local_shortcuts).await.map_err(|error| error.to_string())
    }

    pub async fn shortcut_name_management(&self,id:&Value)->Result<Value,String> {
        let Some(id)=crate::storage::positive_shortcut_app_id(id) else {return Ok(json!({"eligible":false,"reason":"shortcut_not_found","state":null}));};
        let shortcuts=self.local_shortcuts().await?;
        let reason=shortcuts_vdf::name_eligibility(id,&shortcuts);
        let storage=self.store().await?;
        let state=crate::storage::stored_shortcut_name_state(&storage.data()["shortcut_names"][id.to_string()]);
        Ok(json!({"eligible":reason=="ready","reason":reason,"state":state}))
    }

    pub async fn save_shortcut_name_state(&self,id:&Value,original:&Value,applied:&Value,steam_id:&Value)->Result<Value,String> {
        let id=crate::storage::positive_shortcut_app_id(id).ok_or("invalid shortcut name state")?;
        let original=crate::storage::validate_shortcut_name(original).ok_or("invalid shortcut name state")?;
        let applied=crate::storage::validate_shortcut_name(applied).ok_or("invalid shortcut name state")?;
        let steam_id=crate::storage::positive_shortcut_app_id(steam_id).ok_or("invalid shortcut name state")?;
        let shortcuts=self.local_shortcuts().await?;
        let reason=shortcuts_vdf::name_eligibility(id,&shortcuts);
        if reason!="ready" {return Err(reason.into());}
        let key=id.to_string();
        self.change(|transaction| {
            let state=crate::storage::build_shortcut_name_state(transaction.get(&["shortcut_names",&key]),transaction.get(&["metadata",&key]),original,applied,steam_id,chrono::Utc::now().timestamp())?;
            transaction.set(&["shortcut_names",&key],state.clone())?;
            Ok(state)
        }).await
    }
}

pub async fn read_cached_index(settings:&std::path::Path)->Option<Value> {
    serde_json::from_slice(&tokio::fs::read(settings.join("delisted_index.json")).await.ok()?).ok()
}

fn read_local_shortcuts()->Vec<Shortcut> {
    let mut result=Vec::new();
    let mut seen=HashSet::new();
    for root in steam_paths::userdata_roots_from_candidates(&steam_paths::discover_steam_roots()) {
        let Ok(users)=std::fs::read_dir(root) else {continue;};
        for user in users.flatten().filter(|entry| entry.path().is_dir()) {
            let path=user.path().join("config/shortcuts.vdf");
            for mut shortcut in shortcuts_vdf::read_shortcuts_vdf(&path) {
                shortcut.name=matching::clean_game_title(&shortcut.name);
                let key=(shortcut.app_id,shortcut.name.clone(),shortcut.exe.clone(),shortcut.launch_options.clone());
                if shortcut.app_id==0 || shortcut.name.is_empty() || !seen.insert(key) {continue;}
                shortcut.steam_user_id=user.file_name().to_string_lossy().into_owned();
                result.push(shortcut);
            }
        }
    }
    result
}

fn vdf_json(value:&VdfValue)->Value {
    match value {
        VdfValue::Object(values)=>Value::Object(values.iter().map(|(key,value)| (key.clone(),vdf_json(value))).collect()),
        VdfValue::String(value)=>json!(value),VdfValue::Signed(value)=>json!(value),VdfValue::Unsigned(value)=>json!(value),
    }
}

pub fn shortcut_json(shortcut:&Shortcut)->Value {
    json!({"name":shortcut.name,"exe":shortcut.exe,"exe_raw":shortcut.exe_raw,"start_dir":shortcut.start_dir,
        "launch_options":shortcut.launch_options,"shortcut_path":shortcut.shortcut_path,"icon":shortcut.icon,
        "appid":shortcut.app_id,"appid_raw":shortcut.appid_raw.as_ref().map(vdf_json),"app_id":shortcut.app_id,
        "source":"steam_shortcuts_vdf","steam_user_id":shortcut.steam_user_id,"shortcut_file":shortcut.shortcut_file,
        "isNonSteam":true})
}

pub async fn system_versions(env:&Env)->Value {
    let decky=env.decky_version.trim();
    let contents=tokio::fs::read("/etc/os-release").await.unwrap_or_default();
    let steamos=parse_os_release_field(&String::from_utf8_lossy(&contents),"VERSION_ID");
    json!({"decky":if decky.is_empty() {"Unknown"} else {decky},"steamos":if steamos.is_empty() {"Unknown"} else {&steamos}})
}

fn parse_os_release_field(contents:&str,key:&str)->String {
    for line in contents.lines().map(str::trim) {
        if line.is_empty() || line.starts_with('#') {continue;}
        let Some((name,value))=line.split_once('=') else {continue;};
        if name.trim()!=key {continue;}
        let value=value.trim();
        let value=if value.len()>=2 && ((value.starts_with('"') && value.ends_with('"')) || (value.starts_with('\'') && value.ends_with('\''))) {&value[1..value.len()-1]} else {value};
        return value.trim().into();
    }
    String::new()
}

pub fn platform_capabilities()->Value {
    let roots=steam_paths::discover_steam_roots();
    json!({"platform":std::env::consts::OS,"os_name":if cfg!(unix) {"posix"} else {"nt"},
        "is_linux":cfg!(target_os="linux"),"is_steamos":steam_paths::is_steamos(),
        "steam_root":roots.first().map(|path| path.to_string_lossy().into_owned()).unwrap_or_default(),"steam_roots":roots,
        "supports_metadata":true,"supports_steam_activity":true})
}
