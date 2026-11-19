use crate::{BM_delivery::BM_Delivery, BM_store::BM_Comment, BM_worker::BM_CommentPlatform};
use anyhow::{ensure, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BM_ReaderLaunch {
    pub BM_executable: PathBuf,
    pub BM_app: Option<PathBuf>,
}
pub fn BM_reader_launch(BM_data: &Path) -> Result<Option<BM_ReaderLaunch>> {
    let BM_launch = if let Some(BM_executable) = std::env::var_os("BM_READER_EXECUTABLE") {
        BM_ReaderLaunch {
            BM_executable: BM_executable.into(),
            BM_app: std::env::var_os("BM_READER_APP").map(Into::into),
        }
    } else {
        let BM_file = BM_data.join("BM_reader.local.json");
        match fs::symlink_metadata(&BM_file) {
            Ok(BM_meta) => ensure!(
                BM_meta.is_file()
                    && !BM_meta.file_type().is_symlink()
                    && BM_meta.permissions().mode() & 0o077 == 0
                    && BM_meta.len() <= 8192,
                "reader settings must be private"
            ),
            Err(BM_error) if BM_error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(BM_error) => return Err(BM_error.into()),
        }
        serde_json::from_slice::<BM_ReaderLaunch>(&fs::read(BM_file)?)?
    };
    ensure!(
        BM_launch.BM_executable.is_absolute()
            && BM_launch
                .BM_app
                .as_ref()
                .is_none_or(|BM_app| BM_app.is_absolute()),
        "reader settings must use absolute paths"
    );
    Ok(Some(BM_launch))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BM_ReadResult {
    pub BM_state: String,
    pub BM_comments: Vec<crate::BM_store::BM_Comment>,
    pub BM_complete: bool,
}
struct BM_Reader {
    BM_child: Child,
    BM_stdin: ChildStdin,
    BM_stdout: BufReader<ChildStdout>,
}
impl BM_Reader {
    async fn BM_open(BM_config: &Path, BM_launch: &BM_ReaderLaunch) -> Result<Self> {
        let mut BM_command = Command::new(&BM_launch.BM_executable);
        if let Some(BM_app) = &BM_launch.BM_app {
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
    async fn BM_line<T: serde::de::DeserializeOwned>(&mut self) -> Result<T> {
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
        Ok(serde_json::from_slice(&BM_bytes)?)
    }
    async fn BM_read(&mut self) -> Result<BM_ReadResult> {
        let BM_result: BM_ReadResult = self.BM_line().await?;
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
    async fn BM_transfer(
        &mut self,
        BM_action: &str,
        BM_message: &crate::BM_store::BM_Comment,
        BM_text: &str,
    ) -> Result<crate::BM_delivery::BM_Delivery> {
        let BM_request = serde_json::to_vec(
            &serde_json::json!({"BM_action":BM_action,"BM_message":BM_message,"BM_reply":BM_text}),
        )?;
        self.BM_stdin.write_all(&BM_request).await?;
        self.BM_stdin.write_all(b"\n").await?;
        self.BM_stdin.flush().await?;
        let BM_result: crate::BM_delivery::BM_Delivery =
            tokio::time::timeout(Duration::from_secs(120), self.BM_line()).await??;
        ensure!(
            ["accepted", "rejected", "blocked", "unknown"].contains(&BM_result.BM_state.as_str())
                && BM_result.BM_code.len() <= 100
                && BM_result
                    .BM_reply_id
                    .as_ref()
                    .is_none_or(|BM_id| BM_id.len() <= 512),
            "invalid delivery result"
        );
        Ok(BM_result)
    }
    async fn BM_stop(&mut self) {
        let _ = self.BM_child.kill().await;
        let _ = self.BM_child.wait().await;
    }
}

pub struct BM_Browser {
    BM_config: PathBuf,
    BM_launch: BM_ReaderLaunch,
    BM_reader: Mutex<Option<BM_Reader>>,
}
impl BM_Browser {
    pub fn BM_new(BM_config: PathBuf, BM_launch: BM_ReaderLaunch) -> Self {
        Self {
            BM_config,
            BM_launch,
            BM_reader: Mutex::new(None),
        }
    }
    async fn BM_connect(&self, BM_reader: &mut Option<BM_Reader>) -> Result<()> {
        if BM_reader.is_none() {
            *BM_reader = Some(BM_Reader::BM_open(&self.BM_config, &self.BM_launch).await?);
        }
        Ok(())
    }
    pub async fn BM_poll(&self, BM_work: &str) -> Result<BM_ReadResult> {
        let mut BM_reader = self.BM_reader.lock().await;
        self.BM_connect(&mut BM_reader).await?;
        let BM_result = BM_reader.as_mut().unwrap().BM_poll(BM_work).await;
        if BM_result.is_err() {
            if let Some(mut BM_failed) = BM_reader.take() {
                BM_failed.BM_stop().await;
            }
        }
        BM_result
    }
    pub async fn BM_stop(&self) {
        if let Some(mut BM_reader) = self.BM_reader.lock().await.take() {
            BM_reader.BM_stop().await;
        }
    }
}
#[async_trait]
impl BM_CommentPlatform for BM_Browser {
    async fn BM_submit(&self, BM_message: &BM_Comment, BM_text: &str) -> Result<()> {
        ensure!(
            self.BM_deliver(BM_message, BM_text).await.BM_state == "accepted",
            "delivery was not accepted"
        );
        Ok(())
    }
    async fn BM_verify(&self, BM_message: &BM_Comment, BM_text: &str) -> BM_Delivery {
        let mut BM_reader = self.BM_reader.lock().await;
        if self.BM_connect(&mut BM_reader).await.is_err() {
            return BM_Delivery::BM_new("unknown", "BM_browser_unavailable");
        }
        match BM_reader
            .as_mut()
            .unwrap()
            .BM_transfer("verify", BM_message, BM_text)
            .await
        {
            Ok(BM_result) => BM_result,
            Err(_) => {
                if let Some(mut BM_failed) = BM_reader.take() {
                    BM_failed.BM_stop().await;
                }
                BM_Delivery::BM_new("unknown", "BM_reply_not_confirmed")
            }
        }
    }
    async fn BM_deliver(&self, BM_message: &BM_Comment, BM_text: &str) -> BM_Delivery {
        let mut BM_reader = self.BM_reader.lock().await;
        if self.BM_connect(&mut BM_reader).await.is_err() {
            return BM_Delivery::BM_new("blocked", "BM_browser_unavailable");
        }
        match BM_reader
            .as_mut()
            .unwrap()
            .BM_transfer("send", BM_message, BM_text)
            .await
        {
            Ok(BM_result) => BM_result,
            Err(_) => {
                if let Some(mut BM_failed) = BM_reader.take() {
                    BM_failed.BM_stop().await;
                }
                BM_Delivery::BM_new("unknown", "BM_transport_unknown")
            }
        }
    }
}
