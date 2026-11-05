use crate::{BM_store::BM_Comment, BM_worker::BM_Worker};
use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use subtle::ConstantTimeEq;
use tokio_util::sync::CancellationToken;

pub struct BM_Service {
    pub BM_interval_seconds: u64,
    pub BM_cancel: CancellationToken,
    pub BM_worker: Arc<BM_Worker>,
    pub BM_admin_token: String,
    pub BM_webhook_secret: String,
    pub BM_client_key: String,
}

pub fn BM_router(BM_state: Arc<BM_Service>) -> Router {
    Router::new()
        .route(
            "/health",
            get(|| async { Json(json!({"BM_pid":std::process::id()})) }),
        )
        .route("/BM/status", get(BM_status))
        .route("/BM/task", get(BM_task))
        .route("/BM/records", get(BM_records))
        .route("/BM/skip", post(BM_skip))
        .route("/BM/shutdown", post(BM_shutdown))
        .route("/BM/messages", post(BM_message))
        .route("/BM/pause", post(BM_pause))
        .route("/BM/resume", post(BM_resume))
        .route("/BM/webhook", post(BM_webhook))
        .layer(DefaultBodyLimit::max(256 * 1024))
        .with_state(BM_state)
}

async fn BM_task(
    State(BM_state): State<Arc<BM_Service>>,
    BM_headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    BM_authorize(&BM_headers, &BM_state)?;
    Ok(Json(
        json!({"BM_rules":BM_state.BM_worker.BM_rules,"BM_interval_seconds":BM_state.BM_interval_seconds}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BM_RecordQuery {
    BM_before: Option<i64>,
}

async fn BM_records(
    State(BM_state): State<Arc<BM_Service>>,
    BM_headers: HeaderMap,
    Query(BM_query): Query<BM_RecordQuery>,
) -> Result<Json<Value>, StatusCode> {
    BM_authorize(&BM_headers, &BM_state)?;
    if BM_query.BM_before.is_some_and(|BM_id| BM_id <= 0) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let BM_records = BM_state
        .BM_worker
        .BM_store
        .BM_records(BM_query.BM_before)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({"BM_records":BM_records})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BM_RecordAction {
    BM_id: i64,
}

async fn BM_skip(
    State(BM_state): State<Arc<BM_Service>>,
    BM_headers: HeaderMap,
    Json(BM_action): Json<BM_RecordAction>,
) -> Result<Json<Value>, StatusCode> {
    BM_authorize(&BM_headers, &BM_state)?;
    if BM_action.BM_id <= 0 {
        return Err(StatusCode::BAD_REQUEST);
    }
    if !BM_state
        .BM_worker
        .BM_store
        .BM_skip(BM_action.BM_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        return Err(StatusCode::CONFLICT);
    }
    Ok(Json(json!({"BM_skipped":true})))
}

async fn BM_shutdown(
    State(BM_state): State<Arc<BM_Service>>,
    BM_headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    BM_authorize(&BM_headers, &BM_state)?;
    BM_state
        .BM_worker
        .BM_pause(false)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    BM_state.BM_cancel.cancel();
    Ok(Json(json!({"BM_enabled":false})))
}

fn BM_authorize(BM_headers: &HeaderMap, BM_state: &BM_Service) -> Result<(), StatusCode> {
    if BM_headers.contains_key("origin") {
        return Err(StatusCode::FORBIDDEN);
    }
    let BM_token = BM_headers
        .get("authorization")
        .and_then(|BM_h| BM_h.to_str().ok())
        .and_then(|BM_h| BM_h.strip_prefix("Bearer "))
        .ok_or(StatusCode::UNAUTHORIZED)?;
    if BM_state.BM_admin_token.len() < 24
        || !bool::from(
            BM_token
                .as_bytes()
                .ct_eq(BM_state.BM_admin_token.as_bytes()),
        )
    {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(())
}

async fn BM_status(
    State(BM_state): State<Arc<BM_Service>>,
    BM_headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    BM_authorize(&BM_headers, &BM_state)?;
    Ok(Json(
        json!({"BM_enabled":BM_state.BM_worker.BM_store.BM_enabled().await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?,
        "BM_counts":BM_state.BM_worker.BM_store.BM_counts().await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?,"BM_pid":std::process::id()}),
    ))
}

async fn BM_message(
    State(BM_state): State<Arc<BM_Service>>,
    BM_headers: HeaderMap,
    Json(BM_message): Json<BM_Comment>,
) -> Result<Json<Value>, StatusCode> {
    BM_authorize(&BM_headers, &BM_state)?;
    if !BM_state.BM_worker.BM_rules.BM_target(&BM_message) {
        return Err(StatusCode::FORBIDDEN);
    }
    let BM_added = BM_state
        .BM_worker
        .BM_store
        .BM_enqueue(&BM_message)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    Ok(Json(json!({"BM_added":BM_added})))
}

async fn BM_pause(
    State(BM_state): State<Arc<BM_Service>>,
    BM_headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    BM_authorize(&BM_headers, &BM_state)?;
    BM_state
        .BM_worker
        .BM_pause(false)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({"BM_enabled":false})))
}

async fn BM_resume(
    State(BM_state): State<Arc<BM_Service>>,
    BM_headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    BM_authorize(&BM_headers, &BM_state)?;
    BM_state
        .BM_worker
        .BM_pause(true)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({"BM_enabled":true})))
}

async fn BM_webhook(
    State(BM_state): State<Arc<BM_Service>>,
    BM_headers: HeaderMap,
    BM_body: Bytes,
) -> Result<Json<Value>, StatusCode> {
    let BM_signature = BM_headers
        .get("X-Douyin-Signature")
        .and_then(|BM_x| BM_x.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let BM_payload =
        bm_douyin_api::BM_webhook::BM_verify(&BM_body, BM_signature, &BM_state.BM_webhook_secret)
            .map_err(|_| StatusCode::UNAUTHORIZED)?;
    if BM_state.BM_client_key.is_empty()
        || BM_payload["client_key"].as_str() != Some(&BM_state.BM_client_key)
    {
        return Err(StatusCode::FORBIDDEN);
    }
    if BM_payload["event"] == "verify_webhook" {
        let BM_challenge = BM_payload
            .pointer("/content/challenge")
            .filter(|BM_x| BM_x.is_number() || BM_x.is_string())
            .ok_or(StatusCode::BAD_REQUEST)?;
        return Ok(Json(json!({"challenge":BM_challenge})));
    }
    if BM_payload["event"] != "item_comment_reply"
        || BM_payload["to_user_id"].as_str() != Some(&BM_state.BM_worker.BM_rules.BM_account)
    {
        return Err(StatusCode::FORBIDDEN);
    }
    let BM_id = BM_headers
        .get("Msg-Id")
        .and_then(|BM_x| BM_x.to_str().ok())
        .ok_or(StatusCode::BAD_REQUEST)?;
    // Wire events are retained privately until the application's exact content schema is verified.
    BM_state
        .BM_worker
        .BM_store
        .BM_record_webhook(BM_id, &BM_payload)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({"BM_recorded":true})))
}
