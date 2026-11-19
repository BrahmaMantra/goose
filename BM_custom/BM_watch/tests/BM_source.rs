#![allow(non_snake_case)]
use bm_watch::{
    BM_source::{BM_SourceStatus, BM_ingest},
    BM_store::{BM_Comment, BM_Store},
    BM_worker::BM_Rules,
};
#[tokio::test]
async fn BM_source_deduplicates_restarts_and_rejects_foreign_work_before_inserting() {
    let BM_temp = tempfile::tempdir().unwrap();
    let BM_path = BM_temp.path().join("BM_queue.sqlite");
    let BM_store = BM_Store::BM_open(&BM_path).await.unwrap();
    let BM_rules:BM_Rules=serde_json::from_value(serde_json::json!({"BM_account":"BM_owner","BM_works":["12345678"],"BM_deny_contains":[],"BM_max_reply_chars":200})).unwrap();
    let BM_comment = BM_Comment {
        BM_account: "BM_owner".into(),
        BM_work: "12345678".into(),
        BM_comment: "1234567890123456789".into(),
        BM_author: "creator_uid:BM_reader".into(),
        BM_text: "test".into(),
        BM_is_ai_reply: false,
    };
    assert_eq!(
        BM_ingest(
            &BM_store,
            &BM_rules,
            "12345678",
            std::slice::from_ref(&BM_comment)
        )
        .await
        .unwrap(),
        1
    );
    let BM_reopened = BM_Store::BM_open(&BM_path).await.unwrap();
    assert_eq!(
        BM_ingest(
            &BM_reopened,
            &BM_rules,
            "12345678",
            std::slice::from_ref(&BM_comment)
        )
        .await
        .unwrap(),
        0
    );
    let mut BM_foreign = BM_comment.clone();
    BM_foreign.BM_work = "99999999".into();
    let mut BM_new = BM_comment;
    BM_new.BM_comment = "BM_new".into();
    assert!(
        BM_ingest(&BM_reopened, &BM_rules, "12345678", &[BM_new, BM_foreign])
            .await
            .is_err()
    );
    assert_eq!(BM_reopened.BM_records(None).await.unwrap().len(), 1);
    let BM_state = BM_SourceStatus {
        BM_state: "ready".into(),
        BM_seen: 1,
        BM_added: 0,
        BM_complete: true,
        BM_checked_at: 1,
    };
    BM_reopened.BM_set_source_status(&BM_state).await.unwrap();
    assert_eq!(BM_store.BM_source_status().await.unwrap().BM_state, "ready");
}
