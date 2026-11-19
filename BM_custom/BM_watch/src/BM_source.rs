pub use crate::BM_browser::{BM_ReaderLaunch, BM_reader_launch};
use crate::{BM_browser::BM_Browser, BM_store::BM_Store, BM_worker::BM_Rules};
use anyhow::{ensure, Result};
use serde::{Deserialize, Serialize};
use std::{
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
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
    BM_browser: Arc<BM_Browser>,
    BM_store: BM_Store,
    BM_rules: BM_Rules,
    BM_interval: u64,
    BM_cancel: CancellationToken,
) {
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
            let BM_poll = BM_browser.BM_poll(BM_work);
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
                }
            }
            let BM_retry_later = !["ready", "partial"].contains(&BM_status.BM_state.as_str());
            let _ = BM_store.BM_set_source_status(&BM_status).await;
            if BM_retry_later {
                break;
            }
        }
    }
    BM_browser.BM_stop().await;
}
