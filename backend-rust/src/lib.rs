pub mod http;
pub mod logging;
pub mod matching;
pub mod shortcuts_vdf;
pub mod steam_paths;
pub mod storage;
pub mod rpc;
pub mod state;
pub mod cef_bridge;
pub mod metadata;
pub mod providers;

use decky_plugin::Plugin;
use std::sync::Arc;
pub use state::AppState;

pub fn plugin(state: Arc<AppState>) -> Plugin {
    let migration = Arc::clone(&state);
    let unload = Arc::clone(&state);
    let mut plugin=Plugin::new();
    for &method in rpc::METHODS {
        let state=Arc::clone(&state);
        plugin=plugin.method(method,move |_,args| {
            let state=Arc::clone(&state);
            async move {rpc::dispatch(state,method,args).await}
        });
    }
    plugin.on_migration(move |_| async move {migration.initialize().await})
        .on_unload(move |_| async move {unload.shutdown().await})
}
