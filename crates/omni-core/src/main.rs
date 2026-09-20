use anyhow::Result;
use omni_core::{
    config::Config,
    http::{app, AppState},
    vault::Vault,
};
use std::sync::{Arc, Mutex};

#[tokio::main]
async fn main() -> Result<()> {
    let config = Config::from_env()?;
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().is_some_and(|a| a == "token") {
        println!("{}", config.local_token);
        return Ok(());
    }
    if args.first().is_some_and(|a| a == "agent-token") {
        println!("{}", config.agent_token);
        return Ok(());
    }
    let key = config.load_vault_key()?;
    let vault = Vault::open(&config.data_dir.join("vault.db"), &key)?;
    if args.first().is_some_and(|a| a == "init") {
        println!("Encrypted SQLCipher vault ready. Key storage: {}. No analytics network export configured.",config.key_storage);
        return Ok(());
    }
    let port = config.port;
    let (client, local_client) = omni_core::http::clients(&config)?;
    let state = AppState {
        config: Arc::new(config),
        vault: Arc::new(Mutex::new(vault)),
        client,
        local_client,
    };
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    println!("OMNI core listening on http://127.0.0.1:{port}; encrypted vault; development runtime without OS process isolation");
    axum::serve(listener, app(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
