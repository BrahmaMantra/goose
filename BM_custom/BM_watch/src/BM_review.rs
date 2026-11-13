use crate::BM_store::BM_Comment;
use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

pub const BM_REVIEW_VERSION: &str = "BM_comment_review_v1";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BM_Risk {
    Low,
    Risky,
    Uncertain,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BM_Reason {
    Benign,
    Injection,
    Privacy,
    Harmful,
    SensitiveAdvice,
    Commitment,
    Unclear,
    InvalidReply,
    ManualRequired,
    ReviewerFailed,
    PolicyChanged,
    ManualApproved,
    ManualDefault,
    ManualCustom,
    ManualRejected,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BM_Assessment {
    pub BM_risk: BM_Risk,
    pub BM_reason: BM_Reason,
}

impl BM_Assessment {
    pub fn BM_new(BM_risk: BM_Risk, BM_reason: BM_Reason) -> Self {
        Self { BM_risk, BM_reason }
    }
    pub fn BM_auto_allowed(&self) -> bool {
        self.BM_risk == BM_Risk::Low && self.BM_reason == BM_Reason::Benign
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BM_ReviewAudit {
    pub BM_assessment: BM_Assessment,
    pub BM_actor: String,
    pub BM_at: u64,
    pub BM_policy_version: String,
}

impl BM_ReviewAudit {
    pub fn BM_new(BM_assessment: BM_Assessment, BM_actor: &str) -> Self {
        Self {
            BM_assessment,
            BM_actor: BM_actor.into(),
            BM_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            BM_policy_version: BM_REVIEW_VERSION.into(),
        }
    }
}

#[async_trait]
pub trait BM_Reviewer: Send + Sync {
    async fn BM_review(
        &self,
        BM_message: &BM_Comment,
        BM_reply: &str,
        BM_cancel: CancellationToken,
    ) -> Result<BM_Assessment>;
}

pub fn BM_guard(BM_comment: &str, BM_reply: &str) -> Option<BM_Assessment> {
    let BM_text = format!("{BM_comment}\n{BM_reply}").to_lowercase();
    for (BM_reason, BM_terms) in [
        (
            BM_Reason::Injection,
            &[
                "/clear",
                "ignore previous",
                "ignore all",
                "system prompt",
                "忽略之前",
                "忽略以上",
                "系统提示词",
                "执行命令",
                "管理员权限",
            ] as &[&str],
        ),
        (
            BM_Reason::Privacy,
            &[
                "cookie",
                "token",
                "api_key",
                "client_secret",
                "密码",
                "身份证",
                "手机号",
                "家庭住址",
                "私钥",
            ] as &[&str],
        ),
        (
            BM_Reason::Unclear,
            &["http://", "https://", "www."] as &[&str],
        ),
    ] {
        if BM_terms.iter().any(|BM_term| BM_text.contains(BM_term)) {
            return Some(BM_Assessment::BM_new(
                if BM_reason == BM_Reason::Unclear {
                    BM_Risk::Uncertain
                } else {
                    BM_Risk::Risky
                },
                BM_reason,
            ));
        }
    }
    None
}
