use serde_json::Value;
use sha1::{Digest, Sha1};
use subtle::ConstantTimeEq;

#[derive(Debug, thiserror::Error)]
#[error("webhook authentication or payload rejected")]
pub struct BM_WebhookError;

/// Verify the exact wire bytes before decoding JSON. SDK owns no queue or server.
pub fn BM_verify(
    BM_body: &[u8],
    BM_signature: &str,
    BM_secret: &str,
) -> Result<Value, BM_WebhookError> {
    if BM_secret.is_empty() || BM_body.len() > 256 * 1024 || BM_signature.len() != 40 {
        return Err(BM_WebhookError);
    }
    let BM_wire = BM_signature.as_bytes();
    let mut BM_expected = [0u8; 20];
    for (BM_index, BM_pair) in BM_wire.as_chunks::<2>().0.iter().enumerate() {
        let BM_hex = |BM_x: u8| match BM_x {
            b'0'..=b'9' => Some(BM_x - b'0'),
            b'a'..=b'f' => Some(BM_x - b'a' + 10),
            b'A'..=b'F' => Some(BM_x - b'A' + 10),
            _ => None,
        };
        BM_expected[BM_index] = BM_hex(BM_pair[0]).ok_or(BM_WebhookError)? * 16
            + BM_hex(BM_pair[1]).ok_or(BM_WebhookError)?;
    }
    let mut BM_digest = Sha1::new();
    BM_digest.update(BM_secret.as_bytes());
    BM_digest.update(BM_body);
    if !bool::from(BM_digest.finalize().as_slice().ct_eq(&BM_expected)) {
        return Err(BM_WebhookError);
    }
    let BM_payload: Value = serde_json::from_slice(BM_body).map_err(|_| BM_WebhookError)?;
    if !BM_payload.is_object() {
        return Err(BM_WebhookError);
    }
    Ok(BM_payload)
}
