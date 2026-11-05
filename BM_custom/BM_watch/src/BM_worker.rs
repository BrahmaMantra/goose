use crate::BM_store::{BM_Comment, BM_Store};
use anyhow::{ensure, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BM_Decision {
    pub BM_send: bool,
    pub BM_text: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BM_Rules {
    pub BM_account: String,
    pub BM_works: Vec<String>,
    pub BM_allow_contains: Vec<String>,
    pub BM_max_reply_chars: usize,
}

impl BM_Rules {
    pub fn BM_validate(&self) -> Result<()> {
        ensure!(
            !self.BM_account.is_empty()
                && !self.BM_works.is_empty()
                && self.BM_works.iter().all(|BM_x| !BM_x.is_empty()),
            "account and works required"
        );
        ensure!(
            self.BM_max_reply_chars > 0 && self.BM_max_reply_chars <= 1000,
            "invalid reply length"
        );
        ensure!(
            self.BM_allow_contains
                .iter()
                .all(|BM_x| !BM_x.trim().is_empty()),
            "empty rule is not allowed"
        );
        Ok(())
    }
    pub fn BM_target(&self, BM_message: &BM_Comment) -> bool {
        BM_message.BM_account == self.BM_account && self.BM_works.contains(&BM_message.BM_work)
    }
}

#[async_trait]
pub trait BM_Generator: Send + Sync {
    async fn BM_generate(
        &self,
        BM_message: &BM_Comment,
        BM_cancel: CancellationToken,
    ) -> Result<BM_Decision>;
}

#[async_trait]
pub trait BM_CommentPlatform: Send + Sync {
    fn BM_write_ready(&self) -> bool {
        true
    }
    async fn BM_submit(&self, BM_message: &BM_Comment, BM_text: &str) -> Result<()>;
}

pub struct BM_Worker {
    pub BM_store: BM_Store,
    pub BM_rules: BM_Rules,
    pub BM_generator: Arc<dyn BM_Generator>,
    pub BM_platform: Arc<dyn BM_CommentPlatform>,
    /// Shared with pause/resume; serializes sending and lifecycle transitions.
    pub BM_gate: Mutex<()>,
}

impl BM_Worker {
    pub async fn BM_pause(&self, BM_enabled: bool) -> Result<()> {
        let _BM_guard = self.BM_gate.lock().await;
        self.BM_store.BM_set_enabled(BM_enabled).await
    }

    pub async fn BM_batch(&self, BM_limit: usize, BM_cancel: CancellationToken) -> Result<usize> {
        ensure!(BM_limit > 0 && BM_limit <= 100, "batch size must be 1..100");
        let mut BM_processed = 0;
        while BM_processed < BM_limit
            && !BM_cancel.is_cancelled()
            && self.BM_store.BM_enabled().await?
        {
            let Some((BM_id, BM_message)) = self.BM_store.BM_claim().await? else {
                break;
            };
            BM_processed += 1;
            if !self.BM_rules.BM_target(&BM_message)
                || BM_message.BM_author == self.BM_rules.BM_account
            {
                self.BM_store.BM_finish(BM_id, "skipped", None).await?;
                continue;
            }
            if !self
                .BM_rules
                .BM_allow_contains
                .iter()
                .any(|BM_rule| BM_message.BM_text.contains(BM_rule))
            {
                self.BM_store.BM_finish(BM_id, "review", None).await?;
                continue;
            }
            let BM_generation = self.BM_store.BM_generation().await?;
            let BM_result = self
                .BM_generator
                .BM_generate(&BM_message, BM_cancel.child_token())
                .await;
            if BM_cancel.is_cancelled() {
                self.BM_store.BM_finish(BM_id, "queued", None).await?;
                break;
            }
            let BM_decision = match BM_result {
                Ok(BM_value) => BM_value,
                Err(_) => {
                    self.BM_store.BM_finish(BM_id, "failed", None).await?;
                    continue;
                }
            };
            if !self.BM_platform.BM_write_ready()
                || !BM_decision.BM_send
                || BM_decision.BM_text.trim().is_empty()
                || BM_decision.BM_text.chars().count() > self.BM_rules.BM_max_reply_chars
            {
                self.BM_store
                    .BM_finish(BM_id, "review", Some(&BM_decision.BM_text))
                    .await?;
                continue;
            }
            let _BM_guard = self.BM_gate.lock().await;
            if BM_cancel.is_cancelled()
                || !self.BM_store.BM_enabled().await?
                || self.BM_store.BM_generation().await? != BM_generation
            {
                self.BM_store
                    .BM_finish(BM_id, "queued", Some(&BM_decision.BM_text))
                    .await?;
                break;
            }
            self.BM_store
                .BM_finish(BM_id, "sending", Some(&BM_decision.BM_text))
                .await?;
            // All submission failures are conservatively unknown; never retry blindly.
            let BM_status = if self
                .BM_platform
                .BM_submit(&BM_message, &BM_decision.BM_text)
                .await
                .is_ok()
            {
                "accepted"
            } else {
                "unknown"
            };
            self.BM_store.BM_finish(BM_id, BM_status, None).await?;
        }
        Ok(BM_processed)
    }
}
