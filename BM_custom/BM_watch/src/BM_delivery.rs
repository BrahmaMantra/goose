use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BM_Delivery {
    pub BM_state: String,
    pub BM_code: String,
    pub BM_reply_id: Option<String>,
}
impl BM_Delivery {
    pub fn BM_new(BM_state: &str, BM_code: &str) -> Self {
        Self {
            BM_state: BM_state.into(),
            BM_code: BM_code.into(),
            BM_reply_id: None,
        }
    }
    pub fn BM_queue_state(&self) -> &str {
        match self.BM_state.as_str() {
            "accepted" => "accepted",
            "rejected" => "rejected",
            "blocked" => "review",
            _ => "unknown",
        }
    }
}
