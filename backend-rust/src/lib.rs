use decky_plugin::{Env, Plugin};
use serde_json::Value;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

pub struct AppState {
    pub env: Env,
    pub cancel: CancellationToken,
}

impl AppState {
    pub fn new(env: Env) -> Arc<Self> {
        Arc::new(Self { env, cancel: CancellationToken::new() })
    }
}

pub fn plugin(state: Arc<AppState>) -> Plugin {
    let migration = Arc::clone(&state);
    let unload = Arc::clone(&state);
    Plugin::new()
        .method("get_plugin_version", move |_, _| {
            let state = Arc::clone(&state);
            async move { Ok(Value::String(state.env.plugin_version.clone())) }
        })
        .on_migration(move |_| async move {
            tokio::fs::create_dir_all(&migration.env.plugin_settings_dir)
                .await.map_err(|error| error.to_string())?;
            Ok(())
        })
        .on_unload(move |_| async move {
            unload.cancel.cancel();
            Ok(())
        })
}
