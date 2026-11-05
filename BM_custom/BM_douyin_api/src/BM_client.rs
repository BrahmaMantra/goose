use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum BM_ApiError {
    #[error("invalid API configuration or request")]
    BM_Invalid,
    #[error("platform transport failed; submission may have been accepted")]
    BM_Transport,
    #[error("platform HTTP status {0}")]
    BM_Http(u16),
    #[error("platform rejected request with code {0}")]
    BM_Platform(i64),
    #[error("unexpected platform response")]
    BM_Response,
}

#[derive(Clone, Copy, Debug)]
pub enum BM_Application {
    BM_MobileWebsite,
    BM_MiniApp,
}

#[derive(Clone)]
pub struct BM_DouyinClient {
    BM_http: Client,
    BM_base: Url,
    BM_application: BM_Application,
}

#[derive(Serialize)]
pub struct BM_ListRequest<'a> {
    #[serde(rename = "open_id")]
    pub BM_open_id: &'a str,
    #[serde(rename = "item_id")]
    pub BM_item_id: &'a str,
    #[serde(rename = "count")]
    pub BM_count: u32,
    #[serde(rename = "cursor")]
    pub BM_cursor: u64,
}

#[derive(Serialize)]
pub struct BM_ReplyRequest<'a> {
    #[serde(rename = "open_id")]
    pub BM_open_id: &'a str,
    #[serde(rename = "item_id")]
    pub BM_item_id: &'a str,
    #[serde(rename = "comment_id")]
    pub BM_comment_id: &'a str,
    #[serde(rename = "content")]
    pub BM_content: &'a str,
}

#[derive(Debug, Deserialize)]
pub struct BM_CommentPage {
    #[serde(rename = "list")]
    pub BM_comments: Vec<Value>,
    #[serde(rename = "cursor")]
    pub BM_cursor: u64,
    #[serde(rename = "has_more")]
    pub BM_has_more: bool,
}

impl BM_DouyinClient {
    pub fn BM_new(BM_application: BM_Application) -> Result<Self, BM_ApiError> {
        Self::BM_build(
            BM_application,
            Url::parse("https://open.douyin.com/").unwrap(),
        )
    }

    /// Loopback-only endpoint for protocol tests; never accepts a remote override.
    pub fn BM_loopback(BM_application: BM_Application, BM_url: &str) -> Result<Self, BM_ApiError> {
        let BM_base = Url::parse(BM_url).map_err(|_| BM_ApiError::BM_Invalid)?;
        let BM_host = BM_base.host_str().ok_or(BM_ApiError::BM_Invalid)?;
        let BM_ip: std::net::IpAddr = BM_host
            .trim_matches(['[', ']'])
            .parse()
            .map_err(|_| BM_ApiError::BM_Invalid)?;
        if BM_base.scheme() != "http"
            || !BM_ip.is_loopback()
            || !BM_base.username().is_empty()
            || BM_base.password().is_some()
            || BM_base.query().is_some()
            || BM_base.fragment().is_some()
            || BM_base.path() != "/"
        {
            return Err(BM_ApiError::BM_Invalid);
        }
        Self::BM_build(BM_application, BM_base)
    }

    fn BM_build(BM_application: BM_Application, BM_base: Url) -> Result<Self, BM_ApiError> {
        let BM_http = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| BM_ApiError::BM_Invalid)?;
        Ok(Self {
            BM_http,
            BM_base,
            BM_application,
        })
    }

    pub async fn BM_list_comments(
        &self,
        BM_token: &str,
        BM_request: &BM_ListRequest<'_>,
    ) -> Result<BM_CommentPage, BM_ApiError> {
        if BM_token.is_empty()
            || BM_request.BM_open_id.is_empty()
            || BM_request.BM_item_id.is_empty()
            || BM_request.BM_count == 0
        {
            return Err(BM_ApiError::BM_Invalid);
        }
        let BM_path = match self.BM_application {
            BM_Application::BM_MobileWebsite => "item/comment/list/",
            BM_Application::BM_MiniApp => "api/apps/v1/item/list_comment/",
        };
        let BM_query = serde_json::to_value(BM_request).map_err(|_| BM_ApiError::BM_Invalid)?;
        let BM_pairs: Vec<(String, String)> = BM_query
            .as_object()
            .unwrap()
            .iter()
            .map(|(BM_key, BM_value)| {
                (
                    BM_key.clone(),
                    BM_value
                        .as_str()
                        .map(str::to_owned)
                        .unwrap_or_else(|| BM_value.to_string()),
                )
            })
            .collect();
        let mut BM_url = self
            .BM_base
            .join(BM_path)
            .map_err(|_| BM_ApiError::BM_Invalid)?;
        BM_url.query_pairs_mut().extend_pairs(BM_pairs);
        let BM_response = self
            .BM_http
            .get(BM_url)
            .header("access-token", BM_token)
            .send()
            .await
            .map_err(|_| BM_ApiError::BM_Transport)?;
        let BM_data = self.BM_data(BM_response).await?;
        serde_json::from_value(BM_data).map_err(|_| BM_ApiError::BM_Response)
    }

    /// Returns the platform receipt; acceptance is not proof of public display.
    /// No automatic POST retry is performed.
    pub async fn BM_submit_reply(
        &self,
        BM_token: &str,
        BM_request: &BM_ReplyRequest<'_>,
    ) -> Result<Value, BM_ApiError> {
        if BM_token.is_empty()
            || [
                BM_request.BM_open_id,
                BM_request.BM_item_id,
                BM_request.BM_comment_id,
                BM_request.BM_content,
            ]
            .iter()
            .any(|BM_x| BM_x.is_empty())
        {
            return Err(BM_ApiError::BM_Invalid);
        }
        let BM_path = match self.BM_application {
            BM_Application::BM_MobileWebsite => "item/comment/reply/",
            BM_Application::BM_MiniApp => "api/apps/v1/item/reply_comment/",
        };
        let BM_response = self
            .BM_http
            .post(
                self.BM_base
                    .join(BM_path)
                    .map_err(|_| BM_ApiError::BM_Invalid)?,
            )
            .header("access-token", BM_token)
            .json(BM_request)
            .send()
            .await
            .map_err(|_| BM_ApiError::BM_Transport)?;
        self.BM_data(BM_response).await
    }

    async fn BM_data(&self, BM_response: reqwest::Response) -> Result<Value, BM_ApiError> {
        if !BM_response.status().is_success() {
            return Err(BM_ApiError::BM_Http(BM_response.status().as_u16()));
        }
        let BM_body: Value = BM_response
            .json()
            .await
            .map_err(|_| BM_ApiError::BM_Response)?;
        let BM_code = BM_body
            .get("err_no")
            .or_else(|| BM_body.pointer("/data/error_code"))
            .and_then(Value::as_i64)
            .ok_or(BM_ApiError::BM_Response)?;
        if BM_code != 0 {
            return Err(BM_ApiError::BM_Platform(BM_code));
        }
        let BM_data = BM_body
            .get("data")
            .filter(|BM_x| BM_x.is_object())
            .ok_or(BM_ApiError::BM_Response)?;
        let BM_data = match self.BM_application {
            BM_Application::BM_MobileWebsite => BM_data,
            BM_Application::BM_MiniApp => BM_data
                .get("data")
                .filter(|BM_x| BM_x.is_object())
                .ok_or(BM_ApiError::BM_Response)?,
        };
        if let Some(BM_code) = BM_data.get("error_code").and_then(Value::as_i64) {
            if BM_code != 0 {
                return Err(BM_ApiError::BM_Platform(BM_code));
            }
        }
        Ok(BM_data.clone())
    }
}
