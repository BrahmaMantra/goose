#![allow(non_snake_case, non_camel_case_types)]
use anyhow::Result;
use async_trait::async_trait;
use bm_watch::{
    BM_store::{BM_Comment, BM_Store},
    BM_worker::{BM_CommentPlatform, BM_Decision, BM_Generator, BM_Rules, BM_Worker},
};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

struct BM_Fixture {
    BM_calls: AtomicUsize,
    BM_replies: Mutex<Vec<String>>,
    BM_fail: bool,
}
#[async_trait]
impl BM_Generator for BM_Fixture {
    async fn BM_generate(
        &self,
        _BM_message: &BM_Comment,
        _BM_cancel: CancellationToken,
    ) -> Result<BM_Decision> {
        self.BM_calls.fetch_add(1, Ordering::SeqCst);
        Ok(BM_Decision {
            BM_send: true,
            BM_text: "BM answer".into(),
        })
    }
}
#[async_trait]
impl BM_CommentPlatform for BM_Fixture {
    async fn BM_submit(&self, BM_message: &BM_Comment, _BM_text: &str) -> Result<()> {
        self.BM_replies
            .lock()
            .await
            .push(BM_message.BM_comment.clone());
        if self.BM_fail {
            anyhow::bail!("synthetic timeout")
        }
        Ok(())
    }
}
fn BM_message(BM_id: &str) -> BM_Comment {
    BM_Comment {
        BM_account: "BM_owner".into(),
        BM_work: "BM_work".into(),
        BM_comment: BM_id.into(),
        BM_author: "BM_reader".into(),
        BM_text: "question".into(),
    }
}
fn BM_make_worker(BM_store: BM_Store, BM_fixture: Arc<BM_Fixture>) -> BM_Worker {
    BM_Worker {
        BM_store,
        BM_rules: BM_Rules {
            BM_account: "BM_owner".into(),
            BM_works: vec!["BM_work".into()],
            BM_allow_contains: vec!["question".into()],
            BM_max_reply_chars: 100,
        },
        BM_generator: BM_fixture.clone(),
        BM_platform: BM_fixture,
        BM_gate: Mutex::new(()),
    }
}

#[tokio::test]
async fn BM_batches_deduplicate_pause_and_recover_unknown() {
    let BM_temp = tempfile::tempdir().unwrap();
    let BM_path = BM_temp.path().join("BM_queue.sqlite");
    let BM_store = BM_Store::BM_open(&BM_path).await.unwrap();
    let BM_fixture = Arc::new(BM_Fixture {
        BM_calls: AtomicUsize::new(0),
        BM_replies: Mutex::new(vec![]),
        BM_fail: true,
    });
    let BM_worker = BM_make_worker(BM_store.clone(), BM_fixture.clone());
    assert!(BM_store.BM_enqueue(&BM_message("BM_1")).await.unwrap());
    assert!(!BM_store.BM_enqueue(&BM_message("BM_1")).await.unwrap());
    assert_eq!(
        BM_worker
            .BM_batch(2, CancellationToken::new())
            .await
            .unwrap(),
        0
    );
    BM_worker.BM_pause(true).await.unwrap();
    assert_eq!(
        BM_worker
            .BM_batch(2, CancellationToken::new())
            .await
            .unwrap(),
        1
    );
    assert_eq!(BM_store.BM_counts().await.unwrap()["unknown"], 1);
    let BM_reopened = BM_Store::BM_open(&BM_path).await.unwrap();
    let BM_worker = BM_make_worker(BM_reopened.clone(), BM_fixture.clone());
    assert_eq!(
        BM_worker
            .BM_batch(2, CancellationToken::new())
            .await
            .unwrap(),
        0
    );
    assert_eq!(BM_fixture.BM_replies.lock().await.len(), 1);
    let mut BM_self = BM_message("BM_2");
    BM_self.BM_author = "BM_owner".into();
    BM_reopened.BM_enqueue(&BM_self).await.unwrap();
    let mut BM_review = BM_message("BM_3");
    BM_review.BM_text = "unmatched".into();
    BM_reopened.BM_enqueue(&BM_review).await.unwrap();
    BM_worker
        .BM_batch(10, CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(BM_fixture.BM_calls.load(Ordering::SeqCst), 1);
    assert_eq!(BM_reopened.BM_counts().await.unwrap()["review"], 1);
    assert_eq!(BM_reopened.BM_counts().await.unwrap()["skipped"], 1);
}

#[tokio::test]
async fn BM_multiple_batches_reuse_generator_and_no_idle_calls() {
    let BM_temp = tempfile::tempdir().unwrap();
    let BM_store = BM_Store::BM_open(&BM_temp.path().join("BM_queue.sqlite"))
        .await
        .unwrap();
    let BM_fixture = Arc::new(BM_Fixture {
        BM_calls: AtomicUsize::new(0),
        BM_replies: Mutex::new(vec![]),
        BM_fail: false,
    });
    let BM_worker = BM_make_worker(BM_store.clone(), BM_fixture.clone());
    BM_worker.BM_pause(true).await.unwrap();
    for BM_id in ["BM_1", "BM_2", "BM_3"] {
        BM_store.BM_enqueue(&BM_message(BM_id)).await.unwrap();
    }
    assert_eq!(
        BM_worker
            .BM_batch(2, CancellationToken::new())
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        BM_worker
            .BM_batch(2, CancellationToken::new())
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        BM_worker
            .BM_batch(2, CancellationToken::new())
            .await
            .unwrap(),
        0
    );
    assert_eq!(BM_fixture.BM_calls.load(Ordering::SeqCst), 3);
    assert_eq!(
        *BM_fixture.BM_replies.lock().await,
        vec!["BM_1", "BM_2", "BM_3"]
    );
    assert_eq!(BM_store.BM_counts().await.unwrap()["accepted"], 3);
}

#[tokio::test]
async fn BM_crash_states_are_recovered_without_resubmission() {
    let BM_temp = tempfile::tempdir().unwrap();
    let BM_path = BM_temp.path().join("BM_queue.sqlite");
    let BM_store = BM_Store::BM_open(&BM_path).await.unwrap();
    BM_store.BM_enqueue(&BM_message("BM_1")).await.unwrap();
    BM_store.BM_claim().await.unwrap();
    BM_store.BM_enqueue(&BM_message("BM_2")).await.unwrap();
    let (BM_id, _) = BM_store.BM_claim().await.unwrap().unwrap();
    BM_store
        .BM_finish(BM_id, "sending", Some("reply"))
        .await
        .unwrap();
    let BM_reopened = BM_Store::BM_open(&BM_path).await.unwrap();
    assert_eq!(BM_reopened.BM_counts().await.unwrap()["queued"], 1);
    assert_eq!(BM_reopened.BM_counts().await.unwrap()["unknown"], 1);
}
