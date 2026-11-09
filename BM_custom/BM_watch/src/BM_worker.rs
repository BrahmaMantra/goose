use crate::{
    BM_review::{BM_Assessment, BM_Reason, BM_ReviewAudit, BM_Reviewer, BM_Risk, BM_guard},
    BM_store::{BM_Comment, BM_Store},
};
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
    #[serde(default)]
    pub BM_auto_review: bool,
    pub BM_account: String,
    pub BM_works: Vec<String>,
    #[serde(default, alias = "BM_allow_contains")]
    pub BM_deny_contains: Vec<String>,
    pub BM_max_reply_chars: usize,
    #[serde(default = "BM_default_reply_marker")]
    pub BM_reply_marker: String,
}

pub fn BM_default_reply_marker() -> String {
    "【from DeepSeek-V4.1-Flash-1017】".into()
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
            self.BM_deny_contains
                .iter()
                .all(|BM_x| !BM_x.trim().is_empty()),
            "empty rule is not allowed"
        );
        ensure!(
            self.BM_reply_marker.starts_with('【')
                && self.BM_reply_marker.ends_with('】')
                && !self.BM_reply_marker[3..self.BM_reply_marker.len() - 3]
                    .trim()
                    .is_empty()
                && !self.BM_reply_marker.chars().any(char::is_control)
                && self.BM_reply_marker.chars().count() <= 120
                && self.BM_reply_marker.chars().count() + 1 < self.BM_max_reply_chars,
            "invalid reply marker or reply length budget"
        );
        Ok(())
    }
    pub fn BM_target(&self, BM_message: &BM_Comment) -> bool {
        BM_message.BM_account == self.BM_account && self.BM_works.contains(&BM_message.BM_work)
    }
    pub fn BM_mark_reply(&self, BM_text: &str) -> String {
        let BM_text = BM_text.trim();
        if BM_text.is_empty() || BM_text.starts_with(&self.BM_reply_marker) {
            return BM_text.into();
        }
        format!("{} {}", self.BM_reply_marker, BM_text)
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
    async fn BM_deliver(
        &self,
        BM_message: &BM_Comment,
        BM_text: &str,
    ) -> crate::BM_delivery::BM_Delivery {
        if self.BM_submit(BM_message, BM_text).await.is_ok() {
            crate::BM_delivery::BM_Delivery::BM_new("accepted", "BM_platform_accepted")
        } else {
            crate::BM_delivery::BM_Delivery::BM_new("unknown", "BM_transport_unknown")
        }
    }
}

pub struct BM_Worker {
    pub BM_store: BM_Store,
    pub BM_rules: BM_Rules,
    pub BM_generator: Arc<dyn BM_Generator>,
    pub BM_reviewer: Arc<dyn BM_Reviewer>,
    pub BM_platform: Arc<dyn BM_CommentPlatform>,
    /// Shared with pause/resume; serializes sending and lifecycle transitions.
    pub BM_gate: Mutex<()>,
}

impl BM_Worker {
    pub async fn BM_pause(&self, BM_enabled: bool) -> Result<()> {
        let _BM_guard = self.BM_gate.lock().await;
        self.BM_store.BM_set_enabled(BM_enabled).await
    }

    pub async fn BM_set_auto_review(&self, BM_enabled: bool) -> Result<()> {
        let _BM_guard = self.BM_gate.lock().await;
        self.BM_store.BM_set_auto_review(BM_enabled).await
    }

    pub fn BM_valid_reply(&self, BM_reply: &str) -> bool {
        !BM_reply.trim().is_empty()
            && BM_reply.chars().count() <= self.BM_rules.BM_max_reply_chars
            && !BM_reply.chars().any(char::is_control)
    }

    pub async fn BM_approve(&self, BM_id: i64, BM_reply: &str) -> Result<bool> {
        ensure!(
            BM_id > 0 && self.BM_valid_reply(BM_reply),
            "invalid approval"
        );
        let _BM_guard = self.BM_gate.lock().await;
        self.BM_store.BM_approve(BM_id, BM_reply).await
    }

    pub async fn BM_skip(&self, BM_id: i64) -> Result<bool> {
        let _BM_guard = self.BM_gate.lock().await;
        self.BM_store.BM_skip(BM_id).await
    }

    async fn BM_send_approved(&self, BM_cancel: &CancellationToken) -> Result<bool> {
        let _BM_guard = self.BM_gate.lock().await;
        if BM_cancel.is_cancelled()
            || !self.BM_store.BM_enabled().await?
            || !self.BM_platform.BM_write_ready()
        {
            return Ok(false);
        }
        let Some((BM_id, BM_message, BM_reply)) = self.BM_store.BM_next_approved().await? else {
            return Ok(false);
        };
        if !self.BM_rules.BM_target(&BM_message) || !self.BM_valid_reply(&BM_reply) {
            self.BM_store
                .BM_finish(BM_id, "review", Some(&BM_reply))
                .await?;
            return Ok(true);
        }
        if !self.BM_store.BM_begin_send(BM_id, &BM_reply).await? {
            return Ok(true);
        }
        let BM_result = self.BM_platform.BM_deliver(&BM_message, &BM_reply).await;
        self.BM_store.BM_finish_delivery(BM_id, &BM_result).await?;
        Ok(true)
    }

    pub async fn BM_batch(&self, BM_limit: usize, BM_cancel: CancellationToken) -> Result<usize> {
        ensure!(BM_limit > 0 && BM_limit <= 100, "batch size must be 1..100");
        let mut BM_processed = 0;
        while BM_processed < BM_limit
            && !BM_cancel.is_cancelled()
            && self.BM_store.BM_enabled().await?
        {
            if self.BM_send_approved(&BM_cancel).await? {
                BM_processed += 1;
                continue;
            }
            let Some((BM_id, BM_message)) = self.BM_store.BM_claim().await? else {
                break;
            };
            BM_processed += 1;
            let BM_own_ai = BM_message.BM_author == self.BM_rules.BM_account
                && (BM_message.BM_is_ai_reply
                    || BM_message
                        .BM_text
                        .trim_start()
                        .starts_with(&self.BM_rules.BM_reply_marker)
                    || self.BM_store.BM_is_recorded_reply(&BM_message).await?);
            if !self.BM_rules.BM_target(&BM_message) || BM_own_ai {
                self.BM_store.BM_finish(BM_id, "skipped", None).await?;
                continue;
            }
            let BM_text_lower = BM_message.BM_text.to_lowercase();
            if self
                .BM_rules
                .BM_deny_contains
                .iter()
                .any(|BM_rule| BM_text_lower.contains(&BM_rule.to_lowercase()))
            {
                self.BM_store.BM_finish(BM_id, "skipped", None).await?;
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
            if !BM_decision.BM_send {
                self.BM_store.BM_finish(BM_id, "skipped", None).await?;
                continue;
            }
            let BM_reply = self.BM_rules.BM_mark_reply(&BM_decision.BM_text);
            let BM_auto = self.BM_store.BM_auto_review().await?;
            let BM_assessment = if !self.BM_valid_reply(&BM_reply) {
                BM_Assessment::BM_new(BM_Risk::Uncertain, BM_Reason::InvalidReply)
            } else if let Some(BM_risk) = BM_guard(&BM_message.BM_text, &BM_reply) {
                BM_risk
            } else if !BM_auto {
                BM_Assessment::BM_new(BM_Risk::Uncertain, BM_Reason::ManualRequired)
            } else {
                self.BM_reviewer
                    .BM_review(&BM_message, &BM_reply, BM_cancel.child_token())
                    .await
                    .unwrap_or_else(|_| {
                        BM_Assessment::BM_new(BM_Risk::Uncertain, BM_Reason::ReviewerFailed)
                    })
            };
            let _BM_guard = self.BM_gate.lock().await;
            if BM_cancel.is_cancelled()
                || !self.BM_store.BM_enabled().await?
                || self.BM_store.BM_generation().await? != BM_generation
            {
                self.BM_store
                    .BM_finish(BM_id, "queued", Some(&BM_reply))
                    .await?;
                break;
            }
            let BM_approved = BM_auto && BM_assessment.BM_auto_allowed();
            let BM_audit =
                BM_ReviewAudit::BM_new(BM_assessment, if BM_approved { "auto" } else { "system" });
            self.BM_store
                .BM_save_review(BM_id, &BM_reply, &BM_audit, BM_approved)
                .await?;
            drop(_BM_guard);
            if BM_approved {
                self.BM_send_approved(&BM_cancel).await?;
            }
        }
        Ok(BM_processed)
    }
}
