#[tokio::main(worker_threads = 2)]
async fn main() -> std::io::Result<()> {
    let state = decky_metadata_backend::AppState::new(decky_plugin::Env::from_env()).map_err(std::io::Error::other)?;
    decky_metadata_backend::plugin(state).run().await
}
