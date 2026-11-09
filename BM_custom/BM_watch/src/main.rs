#![allow(non_snake_case, non_camel_case_types)]
use anyhow::{ensure, Result};
use async_trait::async_trait;
use bm_watch::{
    BM_runtime::BM_GooseRuntime,
    BM_service::{BM_Service, BM_router},
    BM_store::{BM_Comment, BM_Store},
    BM_worker::{BM_CommentPlatform, BM_Rules, BM_Worker},
};
use serde::Deserialize;
use std::{
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BM_Config {
    BM_data_dir: PathBuf,
    BM_goose_root: Option<PathBuf>,
    BM_admin_token: String,
    #[serde(default)]
    BM_webhook_secret: String,
    #[serde(default)]
    BM_client_key: String,
    BM_rules: BM_Rules,
    #[serde(default = "BM_interval")]
    BM_interval_seconds: u64,
    #[serde(default = "BM_batch_size")]
    BM_batch_size: usize,
    #[serde(default = "BM_port")]
    BM_port: u16,
}
fn BM_interval() -> u64 {
    30
}
fn BM_batch_size() -> usize {
    10
}
fn BM_port() -> u16 {
    8791
}

struct BM_NoWrites;
#[async_trait]
impl BM_CommentPlatform for BM_NoWrites {
    fn BM_write_ready(&self) -> bool {
        false
    }
    async fn BM_submit(&self, _BM_message: &BM_Comment, _BM_text: &str) -> Result<()> {
        anyhow::bail!("platform writes are not configured")
    }
}

fn main() {
    if BM_main().is_err() {
        eprintln!("BM_watch failed; check the private configuration and BM_README.md.");
        std::process::exit(1);
    }
}

fn BM_main() -> Result<()> {
    let mut BM_args = std::env::args_os().skip(1);
    if BM_args.next().as_deref() != Some(std::ffi::OsStr::new("--config")) {
        println!("Usage: BM_watch --config <private-config.json>");
        return Ok(());
    }
    let BM_path = PathBuf::from(
        BM_args
            .next()
            .ok_or_else(|| anyhow::anyhow!("configuration required"))?,
    );
    ensure!(BM_args.next().is_none(), "unexpected argument");
    ensure!(
        std::fs::metadata(&BM_path)?.permissions().mode() & 0o077 == 0,
        "configuration must be private"
    );
    let BM_config_file = BM_path.clone();
    let BM_config: BM_Config = serde_json::from_slice(&std::fs::read(BM_path)?)?;
    BM_config.BM_rules.BM_validate()?;
    ensure!(
        BM_config.BM_admin_token.len() >= 24
            && BM_config.BM_interval_seconds >= 1
            && BM_config.BM_batch_size > 0
            && BM_config.BM_batch_size <= 100,
        "invalid service configuration"
    );
    use std::os::unix::fs::DirBuilderExt;
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(&BM_config.BM_data_dir)?;
    let BM_root = BM_config.BM_data_dir.canonicalize()?;
    ensure!(
        BM_root.ancestors().all(|BM_x| !BM_x.join(".git").exists()),
        "data must be outside checkout"
    );
    ensure!(
        std::fs::metadata(&BM_root)?.permissions().mode() & 0o077 == 0,
        "data directory must be private"
    );
    let BM_lock = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .open(BM_root.join("BM_watch.lock"))?;
    BM_lock
        .try_lock()
        .map_err(|_| anyhow::anyhow!("another worker owns this directory"))?;
    // Set once before creating worker threads, never per message.
    if let Some(BM_goose_root) = &BM_config.BM_goose_root {
        ensure!(
            BM_goose_root.is_absolute() && BM_goose_root.is_dir(),
            "Goose root must exist"
        );
        std::env::set_var("GOOSE_PATH_ROOT", BM_goose_root);
    } else {
        std::env::remove_var("GOOSE_PATH_ROOT");
    }
    std::env::set_var("GOOSE_TELEMETRY_ENABLED", "false");
    std::env::set_var("GOOSE_DISABLE_KEYRING", "1");
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(BM_serve(BM_config, BM_root, BM_config_file))
}

async fn BM_serve(BM_config: BM_Config, BM_root: PathBuf, BM_config_file: PathBuf) -> Result<()> {
    let BM_store = BM_Store::BM_open(&BM_root.join("BM_queue.sqlite")).await?;
    let BM_reply_budget = BM_config.BM_rules.BM_max_reply_chars
        - BM_config.BM_rules.BM_reply_marker.chars().count()
        - 1;
    BM_store
        .BM_set_auto_review(BM_config.BM_rules.BM_auto_review)
        .await?;
    let BM_runtime = Arc::new(BM_GooseRuntime::BM_with_reply_budget(
        BM_root.clone(),
        BM_reply_budget,
    ));
    let BM_worker = Arc::new(BM_Worker {
        BM_store,
        BM_rules: BM_config.BM_rules,
        BM_generator: BM_runtime.clone(),
        BM_reviewer: BM_runtime,
        BM_platform: Arc::new(BM_NoWrites),
        BM_gate: tokio::sync::Mutex::new(()),
    });
    let BM_cancel = CancellationToken::new();
    let (BM_launch, BM_launch_failed) = match bm_watch::BM_source::BM_reader_launch(&BM_root) {
        Ok(BM_launch) => (BM_launch, false),
        Err(_) => (None, true),
    };
    let BM_has_browser = BM_root
        .parent()
        .is_some_and(|BM_profile| BM_profile.join("BM_browser").is_dir());
    let BM_source_state = if BM_launch_failed {
        "reader_failed"
    } else if BM_launch.is_some() && BM_has_browser {
        "starting"
    } else {
        "manual"
    };
    BM_worker
        .BM_store
        .BM_set_source_status(&bm_watch::BM_source::BM_SourceStatus {
            BM_state: BM_source_state.into(),
            ..Default::default()
        })
        .await?;
    let BM_collector = if let Some(BM_launch) = BM_launch.filter(|_| BM_has_browser) {
        Some(tokio::spawn(bm_watch::BM_source::BM_collect(
            BM_config_file,
            BM_launch,
            BM_worker.BM_store.clone(),
            BM_worker.BM_rules.clone(),
            BM_config.BM_interval_seconds,
            BM_cancel.clone(),
        )))
    } else {
        None
    };
    let BM_service = Arc::new(BM_Service {
        BM_interval_seconds: BM_config.BM_interval_seconds,
        BM_cancel: BM_cancel.clone(),
        BM_worker: BM_worker.clone(),
        BM_admin_token: BM_config.BM_admin_token,
        BM_webhook_secret: BM_config.BM_webhook_secret,
        BM_client_key: BM_config.BM_client_key,
    });
    let BM_token = BM_cancel.clone();
    let BM_consumer = tokio::spawn(async move {
        let mut BM_tick = tokio::time::interval(Duration::from_secs(BM_config.BM_interval_seconds));
        BM_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                _=BM_token.cancelled()=>break,
                _=BM_tick.tick()=>{ if BM_worker.BM_batch(BM_config.BM_batch_size,BM_token.clone()).await.is_err(){BM_token.cancel();break;} }
            }
        }
    });
    let BM_listener =
        tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, BM_config.BM_port)).await?;
    println!(
        "BM_watch running; pid={}; loopback port={}",
        std::process::id(),
        BM_config.BM_port
    );
    let BM_shutdown = BM_cancel.clone();
    let mut BM_terminate =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    let BM_result = axum::serve(BM_listener, BM_router(BM_service))
        .with_graceful_shutdown(async move {
            tokio::select! {_=tokio::signal::ctrl_c()=>{},_=BM_terminate.recv()=>{},_=BM_shutdown.cancelled()=>{}}
            BM_shutdown.cancel();
        })
        .await;
    BM_cancel.cancel();
    BM_consumer.await?;
    if let Some(BM_collector) = BM_collector {
        BM_collector.await?;
    }
    BM_result?;
    Ok(())
}
