#![allow(non_snake_case)]
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode, Uri},
    routing::{get, post},
    Json, Router,
};
use bm_douyin_api::{
    BM_client::{BM_ApiError, BM_Application, BM_DouyinClient, BM_ListRequest, BM_ReplyRequest},
    BM_webhook::BM_verify,
};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

#[tokio::test]
async fn BM_protocol_profiles_and_no_redirect() {
    let BM_seen = Arc::new(Mutex::new(Vec::new()));
    async fn BM_list(
        State(BM_seen): State<Arc<Mutex<Vec<String>>>>,
        BM_headers: HeaderMap,
        BM_uri: Uri,
    ) -> Json<Value> {
        assert_eq!(BM_headers["access-token"], "placeholder");
        assert!(!BM_uri.to_string().contains("placeholder"));
        BM_seen.lock().unwrap().push(BM_uri.to_string());
        if BM_uri.path().starts_with("/api/") {
            Json(json!({"err_no":0,"data":{"data":{"list":[],"cursor":2,"has_more":false}}}))
        } else {
            Json(json!({"data":{"error_code":0,"list":[],"cursor":1,"has_more":true}}))
        }
    }
    async fn BM_reply(
        State(BM_seen): State<Arc<Mutex<Vec<String>>>>,
        BM_headers: HeaderMap,
        BM_uri: Uri,
        Json(BM_body): Json<Value>,
    ) -> Json<Value> {
        assert_eq!(BM_headers["access-token"], "placeholder");
        assert_eq!(BM_body["content"], "reply");
        assert_eq!(BM_body["comment_id"], "BM_comment");
        BM_seen.lock().unwrap().push(BM_uri.path().to_owned());
        Json(json!({"data":{"error_code":1001}}))
    }
    let BM_app = Router::new()
        .route("/item/comment/list/", get(BM_list))
        .route("/api/apps/v1/item/list_comment/", get(BM_list))
        .route("/item/comment/reply/", post(BM_reply))
        .with_state(BM_seen.clone());
    let BM_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let BM_url = format!("http://{}/", BM_listener.local_addr().unwrap());
    let BM_server = tokio::spawn(async move { axum::serve(BM_listener, BM_app).await.unwrap() });
    let BM_mobile =
        BM_DouyinClient::BM_loopback(BM_Application::BM_MobileWebsite, &BM_url).unwrap();
    let BM_mini = BM_DouyinClient::BM_loopback(BM_Application::BM_MiniApp, &BM_url).unwrap();
    let BM_request = BM_ListRequest {
        BM_open_id: "BM_user",
        BM_item_id: "BM_work+/?",
        BM_count: 2,
        BM_cursor: 0,
    };
    assert!(
        BM_mobile
            .BM_list_comments("placeholder", &BM_request)
            .await
            .unwrap()
            .BM_has_more
    );
    assert_eq!(
        BM_mini
            .BM_list_comments("placeholder", &BM_request)
            .await
            .unwrap()
            .BM_cursor,
        2
    );
    let BM_result = BM_mobile
        .BM_submit_reply(
            "placeholder",
            &BM_ReplyRequest {
                BM_open_id: "BM_user",
                BM_item_id: "BM_work",
                BM_comment_id: "BM_comment",
                BM_content: "reply",
            },
        )
        .await;
    assert!(matches!(BM_result, Err(BM_ApiError::BM_Platform(1001))));
    assert_eq!(BM_seen.lock().unwrap().len(), 3);
    assert!(BM_seen.lock().unwrap()[0].contains("item_id=BM_work%2B%2F%3F"));
    assert!(
        BM_DouyinClient::BM_loopback(BM_Application::BM_MobileWebsite, "http://example.com/")
            .is_err()
    );
    BM_server.abort();
}

#[tokio::test]
async fn BM_redirect_does_not_forward_token() {
    let BM_app = Router::new()
        .fallback(|| async { (StatusCode::FOUND, [("location", "https://example.com/")]) });
    let BM_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let BM_url = format!("http://{}/", BM_listener.local_addr().unwrap());
    let BM_server = tokio::spawn(async move { axum::serve(BM_listener, BM_app).await.unwrap() });
    let BM_client =
        BM_DouyinClient::BM_loopback(BM_Application::BM_MobileWebsite, &BM_url).unwrap();
    let BM_result = BM_client
        .BM_list_comments(
            "placeholder",
            &BM_ListRequest {
                BM_open_id: "BM_user",
                BM_item_id: "BM_work",
                BM_count: 1,
                BM_cursor: 0,
            },
        )
        .await;
    assert!(matches!(BM_result, Err(BM_ApiError::BM_Http(302))));
    BM_server.abort();
}

#[test]
fn BM_webhook_wire_signature() {
    use sha1::{Digest, Sha1};
    let BM_body = br#"{ "event": "verify_webhook", "content": {"challenge":123} }"#;
    let BM_signature = format!(
        "{:x}",
        Sha1::digest([b"placeholder".as_slice(), BM_body].concat())
    );
    assert_eq!(
        BM_verify(BM_body, &BM_signature, "placeholder").unwrap()["content"]["challenge"],
        123
    );
    let BM_reencoded =
        serde_json::to_vec(&serde_json::from_slice::<Value>(BM_body).unwrap()).unwrap();
    assert!(BM_verify(&BM_reencoded, &BM_signature, "placeholder").is_err());
    assert!(BM_verify(BM_body, &"z".repeat(40), "placeholder").is_err());
    assert!(BM_verify(BM_body, &BM_signature, "").is_err());
}
