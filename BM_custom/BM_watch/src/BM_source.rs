use crate::{BM_store::BM_Store, BM_worker::BM_Rules};
use anyhow::{ensure, Result};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    process::Stdio,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BM_SourceStatus {
    pub BM_state: String,
    pub BM_seen: usize,
    pub BM_added: usize,
    pub BM_complete: bool,
    pub BM_checked_at: u64,
}
impl Default for BM_SourceStatus {
    fn default() -> Self {
        Self {
            BM_state: "manual".into(),
            BM_seen: 0,
            BM_added: 0,
            BM_complete: false,
            BM_checked_at: 0,
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BM_ReadResult {
    BM_state: String,
    BM_comments: Vec<crate::BM_store::BM_Comment>,
    BM_complete: bool,
}
struct BM_Reader {
    BM_child: Child,
    BM_stdin: ChildStdin,
    BM_stdout: BufReader<ChildStdout>,
}
impl BM_Reader {
    async fn BM_open(BM_config: &Path) -> Result<Self> {
        let BM_executable = std::env::var_os("BM_READER_EXECUTABLE")
            .ok_or_else(|| anyhow::anyhow!("reader unavailable"))?;
        ensure!(
            Path::new(&BM_executable).is_absolute(),
            "reader executable must be absolute"
        );
        let mut BM_command = Command::new(BM_executable);
        if let Some(BM_app) = std::env::var_os("BM_READER_APP") {
            BM_command.arg(BM_app);
        }
        let mut BM_child = BM_command
            .env("BM_COMMENT_READER", "1")
            .env("BM_READER_CONFIG", BM_config)
            .env_remove("ELECTRON_RUN_AS_NODE")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()?;
        let BM_stdin = BM_child.stdin.take().unwrap();
        let BM_stdout = BufReader::new(BM_child.stdout.take().unwrap());
        let mut BM_reader = Self {
            BM_child,
            BM_stdin,
            BM_stdout,
        };
        let BM_ready = tokio::time::timeout(Duration::from_secs(30), BM_reader.BM_read()).await??;
        ensure!(
            BM_ready.BM_state == "booted" && BM_ready.BM_comments.is_empty(),
            "reader boot failed"
        );
        Ok(BM_reader)
    }
    async fn BM_read(&mut self) -> Result<BM_ReadResult> {
        let mut BM_bytes = Vec::new();
        loop {
            let BM_chunk = self.BM_stdout.fill_buf().await?;
            ensure!(!BM_chunk.is_empty(), "reader closed");
            let BM_size = BM_chunk
                .iter()
                .position(|BM_byte| *BM_byte == b'\n')
                .map(|BM_position| BM_position + 1)
                .unwrap_or(BM_chunk.len());
            ensure!(
                BM_bytes.len() + BM_size <= 4 * 1024 * 1024,
                "reader response too large"
            );
            let BM_done = BM_chunk[BM_size - 1] == b'\n';
            BM_bytes.extend_from_slice(&BM_chunk[..BM_size]);
            self.BM_stdout.consume(BM_size);
            if BM_done {
                break;
            }
        }
        let BM_result: BM_ReadResult = serde_json::from_slice(&BM_bytes)?;
        ensure!(BM_result.BM_comments.len() <= 200, "too many comments");
        ensure!(
            [
                "booted",
                "ready",
                "partial",
                "login_required",
                "account_mismatch",
                "page_unavailable",
                "reader_failed"
            ]
            .contains(&BM_result.BM_state.as_str()),
            "invalid source state"
        );
        Ok(BM_result)
    }
    async fn BM_poll(&mut self, BM_work: &str) -> Result<BM_ReadResult> {
        let BM_request = serde_json::to_vec(&serde_json::json!({"BM_work":BM_work}))?;
        self.BM_stdin.write_all(&BM_request).await?;
        self.BM_stdin.write_all(b"\n").await?;
        self.BM_stdin.flush().await?;
        tokio::time::timeout(Duration::from_secs(120), self.BM_read()).await?
    }
    async fn BM_stop(&mut self) {
        let _ = self.BM_child.kill().await;
        let _ = self.BM_child.wait().await;
    }
}

pub async fn BM_ingest(
    BM_store: &BM_Store,
    BM_rules: &BM_Rules,
    BM_work: &str,
    BM_comments: &[crate::BM_store::BM_Comment],
) -> Result<usize> {
    ensure!(
        BM_comments
            .iter()
            .all(|BM_comment| BM_rules.BM_target(BM_comment) && BM_comment.BM_work == BM_work),
        "source scope mismatch"
    );
    let mut BM_added = 0;
    for BM_comment in BM_comments {
        BM_added += usize::from(BM_store.BM_enqueue(BM_comment).await?);
    }
    Ok(BM_added)
}

pub async fn BM_collect(
    BM_config: std::path::PathBuf,
    BM_store: BM_Store,
    BM_rules: BM_Rules,
    BM_interval: u64,
    BM_cancel: CancellationToken,
) {
    let mut BM_reader: Option<BM_Reader> = None;
    let mut BM_tick = tokio::time::interval(Duration::from_secs(BM_interval));
    BM_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {_=BM_cancel.cancelled()=>break,_=BM_tick.tick()=>{}}
        if !BM_store.BM_enabled().await.unwrap_or(false) {
            if let Ok(mut BM_status) = BM_store.BM_source_status().await {
                BM_status.BM_state = "paused".into();
                let _ = BM_store.BM_set_source_status(&BM_status).await;
            }
            continue;
        }
        for BM_work in &BM_rules.BM_works {
            let BM_poll = async {
                if BM_reader.is_none() {
                    BM_reader = Some(BM_Reader::BM_open(&BM_config).await?);
                }
                BM_reader.as_mut().unwrap().BM_poll(BM_work).await
            };
            let BM_result =
                tokio::select! {_=BM_cancel.cancelled()=>break,BM_result=BM_poll=>BM_result};
            let mut BM_status = BM_SourceStatus {
                BM_checked_at: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
                ..Default::default()
            };
            match BM_result {
                Ok(BM_result) => {
                    BM_status.BM_state = BM_result.BM_state;
                    BM_status.BM_complete = BM_result.BM_complete;
                    BM_status.BM_seen = BM_result.BM_comments.len();
                    if ["ready", "partial"].contains(&BM_status.BM_state.as_str()) {
                        match BM_ingest(&BM_store, &BM_rules, BM_work, &BM_result.BM_comments).await
                        {
                            Ok(BM_added) => BM_status.BM_added = BM_added,
                            Err(_) => BM_status.BM_state = "reader_failed".into(),
                        }
                    }
                }
                Err(_) => {
                    BM_status.BM_state = "reader_failed".into();
                    if let Some(mut BM_failed) = BM_reader.take() {
                        BM_failed.BM_stop().await;
                    }
                }
            }
            let BM_retry_later = !["ready", "partial"].contains(&BM_status.BM_state.as_str());
            let _ = BM_store.BM_set_source_status(&BM_status).await;
            if BM_retry_later {
                break;
            }
        }
    }
    if let Some(mut BM_reader) = BM_reader {
        BM_reader.BM_stop().await;
    }
}
