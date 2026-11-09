use crate::BM_review::{BM_Assessment, BM_Reason, BM_ReviewAudit, BM_Risk};
use anyhow::{ensure, Result};
use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    Row, SqlitePool,
};
use std::{os::unix::fs::OpenOptionsExt, path::Path};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BM_Comment {
    pub BM_account: String,
    pub BM_work: String,
    pub BM_comment: String,
    pub BM_author: String,
    pub BM_text: String,
    #[serde(default)]
    pub BM_is_ai_reply: bool,
}

#[derive(Clone)]
pub struct BM_Store {
    BM_pool: SqlitePool,
}

#[derive(Serialize)]
pub struct BM_Record {
    pub BM_id: i64,
    pub BM_status: String,
    pub BM_message: BM_Comment,
    pub BM_reply: Option<String>,
    pub BM_review: Option<BM_ReviewAudit>,
}

impl BM_Store {
    pub async fn BM_set_source_status(
        &self,
        BM_status: &crate::BM_source::BM_SourceStatus,
    ) -> Result<()> {
        sqlx::query("INSERT INTO BM_source(BM_id,BM_state) VALUES(1,?) ON CONFLICT(BM_id) DO UPDATE SET BM_state=excluded.BM_state")
            .bind(serde_json::to_string(BM_status)?).execute(&self.BM_pool).await?;
        Ok(())
    }
    pub async fn BM_source_status(&self) -> Result<crate::BM_source::BM_SourceStatus> {
        let BM_state: Option<String> =
            sqlx::query_scalar("SELECT BM_state FROM BM_source WHERE BM_id=1")
                .fetch_optional(&self.BM_pool)
                .await?;
        Ok(match BM_state {
            Some(BM_value) => serde_json::from_str(&BM_value)?,
            None => Default::default(),
        })
    }

    pub async fn BM_is_recorded_reply(&self, BM_message: &BM_Comment) -> Result<bool> {
        Ok(sqlx::query_scalar::<_, i64>("SELECT EXISTS(SELECT 1 FROM BM_inbox WHERE BM_account=? AND BM_work=? AND BM_reply=? AND BM_status IN ('sending','accepted','unknown'))")
            .bind(&BM_message.BM_account).bind(&BM_message.BM_work).bind(BM_message.BM_text.trim())
            .fetch_one(&self.BM_pool).await? != 0)
    }
    pub async fn BM_records(&self, BM_before: Option<i64>) -> Result<Vec<BM_Record>> {
        ensure!(BM_before.is_none_or(|BM_id| BM_id > 0), "invalid cursor");
        let BM_rows = sqlx::query("SELECT BM_id,BM_status,BM_payload,BM_reply,(SELECT BM_audit FROM BM_reviews WHERE BM_record=BM_inbox.BM_id ORDER BY BM_id DESC LIMIT 1) AS BM_audit FROM BM_inbox WHERE (? IS NULL OR BM_id < ?) ORDER BY BM_id DESC LIMIT 50")
            .bind(BM_before).bind(BM_before).fetch_all(&self.BM_pool).await?;
        BM_rows
            .into_iter()
            .map(|BM_row| {
                Ok(BM_Record {
                    BM_id: BM_row.get("BM_id"),
                    BM_status: BM_row.get("BM_status"),
                    BM_message: serde_json::from_str(BM_row.get::<&str, _>("BM_payload"))?,
                    BM_reply: BM_row.get("BM_reply"),
                    BM_review: BM_row
                        .get::<Option<&str>, _>("BM_audit")
                        .map(serde_json::from_str)
                        .transpose()?,
                })
            })
            .collect()
    }

    pub async fn BM_skip(&self, BM_id: i64) -> Result<bool> {
        ensure!(BM_id > 0, "invalid record reference");
        let mut BM_tx = self.BM_pool.begin().await?;
        let BM_result = sqlx::query("UPDATE BM_inbox SET BM_status='skipped' WHERE BM_id=? AND BM_status IN ('review','failed','approved')")
            .bind(BM_id).execute(&mut *BM_tx).await?;
        if BM_result.rows_affected() == 1 {
            let BM_audit = BM_ReviewAudit::BM_new(
                BM_Assessment::BM_new(BM_Risk::Uncertain, BM_Reason::ManualRejected),
                "admin",
            );
            sqlx::query("INSERT INTO BM_reviews(BM_record,BM_audit,BM_reply) SELECT BM_id,?,BM_reply FROM BM_inbox WHERE BM_id=?")
                .bind(serde_json::to_string(&BM_audit)?).bind(BM_id).execute(&mut *BM_tx).await?;
        }
        BM_tx.commit().await?;
        Ok(BM_result.rows_affected() == 1)
    }

    pub async fn BM_auto_review(&self) -> Result<bool> {
        Ok(
            sqlx::query_scalar::<_, bool>("SELECT BM_auto_review FROM BM_policy WHERE BM_id=1")
                .fetch_one(&self.BM_pool)
                .await?,
        )
    }

    pub async fn BM_set_auto_review(&self, BM_enabled: bool) -> Result<()> {
        let mut BM_tx = self.BM_pool.begin().await?;
        sqlx::query("UPDATE BM_policy SET BM_auto_review=? WHERE BM_id=1")
            .bind(BM_enabled)
            .execute(&mut *BM_tx)
            .await?;
        sqlx::query("UPDATE BM_control SET BM_generation=BM_generation+1 WHERE BM_id=1")
            .execute(&mut *BM_tx)
            .await?;
        if !BM_enabled {
            let BM_audit = BM_ReviewAudit::BM_new(
                BM_Assessment::BM_new(BM_Risk::Uncertain, BM_Reason::PolicyChanged),
                "system",
            );
            let BM_rows = sqlx::query("UPDATE BM_inbox SET BM_status='review' WHERE BM_status='approved' AND json_extract((SELECT BM_audit FROM BM_reviews WHERE BM_record=BM_inbox.BM_id ORDER BY BM_id DESC LIMIT 1),'$.BM_actor')='auto' RETURNING BM_id,BM_reply")
                .fetch_all(&mut *BM_tx).await?;
            for BM_row in BM_rows {
                sqlx::query("INSERT INTO BM_reviews(BM_record,BM_audit,BM_reply) VALUES(?,?,?)")
                    .bind(BM_row.get::<i64, _>("BM_id"))
                    .bind(serde_json::to_string(&BM_audit)?)
                    .bind(BM_row.get::<Option<&str>, _>("BM_reply"))
                    .execute(&mut *BM_tx)
                    .await?;
            }
        }
        BM_tx.commit().await?;
        Ok(())
    }

    pub async fn BM_save_review(
        &self,
        BM_id: i64,
        BM_reply: &str,
        BM_audit: &BM_ReviewAudit,
        BM_approved: bool,
    ) -> Result<()> {
        let mut BM_tx = self.BM_pool.begin().await?;
        let BM_result = sqlx::query(
            "UPDATE BM_inbox SET BM_status=?,BM_reply=? WHERE BM_id=? AND BM_status='processing'",
        )
        .bind(if BM_approved { "approved" } else { "review" })
        .bind(BM_reply)
        .bind(BM_id)
        .execute(&mut *BM_tx)
        .await?;
        ensure!(BM_result.rows_affected() == 1, "record state changed");
        sqlx::query("INSERT INTO BM_reviews(BM_record,BM_audit,BM_reply) VALUES(?,?,?)")
            .bind(BM_id)
            .bind(serde_json::to_string(BM_audit)?)
            .bind(BM_reply)
            .execute(&mut *BM_tx)
            .await?;
        BM_tx.commit().await?;
        Ok(())
    }

    pub async fn BM_approve(&self, BM_id: i64, BM_reply: &str) -> Result<bool> {
        let mut BM_tx = self.BM_pool.begin().await?;
        let BM_result = sqlx::query("UPDATE BM_inbox SET BM_status='approved' WHERE BM_id=? AND BM_status='review' AND BM_reply=?")
            .bind(BM_id).bind(BM_reply).execute(&mut *BM_tx).await?;
        if BM_result.rows_affected() == 1 {
            let BM_audit = BM_ReviewAudit::BM_new(
                BM_Assessment::BM_new(BM_Risk::Uncertain, BM_Reason::ManualApproved),
                "admin",
            );
            sqlx::query("INSERT INTO BM_reviews(BM_record,BM_audit,BM_reply) VALUES(?,?,?)")
                .bind(BM_id)
                .bind(serde_json::to_string(&BM_audit)?)
                .bind(BM_reply)
                .execute(&mut *BM_tx)
                .await?;
        }
        BM_tx.commit().await?;
        Ok(BM_result.rows_affected() == 1)
    }

    pub async fn BM_next_approved(&self) -> Result<Option<(i64, BM_Comment, String)>> {
        let BM_row = sqlx::query("SELECT BM_id,BM_payload,BM_reply FROM BM_inbox WHERE BM_status='approved' ORDER BY BM_id LIMIT 1")
            .fetch_optional(&self.BM_pool).await?;
        BM_row
            .map(|BM_row| {
                Ok((
                    BM_row.get("BM_id"),
                    serde_json::from_str(BM_row.get::<&str, _>("BM_payload"))?,
                    BM_row.get("BM_reply"),
                ))
            })
            .transpose()
    }

    pub async fn BM_begin_send(&self, BM_id: i64, BM_reply: &str) -> Result<bool> {
        let BM_result = sqlx::query("UPDATE BM_inbox SET BM_status='sending' WHERE BM_id=? AND BM_status='approved' AND BM_reply=?")
            .bind(BM_id).bind(BM_reply).execute(&self.BM_pool).await?;
        Ok(BM_result.rows_affected() == 1)
    }
    pub async fn BM_open(BM_path: &Path) -> Result<Self> {
        let BM_file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .open(BM_path)?;
        use std::os::unix::fs::PermissionsExt;
        ensure!(
            BM_file.metadata()?.permissions().mode() & 0o077 == 0,
            "queue file must be private"
        );
        let BM_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(BM_path)
                    .create_if_missing(true)
                    .journal_mode(SqliteJournalMode::Wal),
            )
            .await?;
        sqlx::query("CREATE TABLE IF NOT EXISTS BM_inbox (BM_id INTEGER PRIMARY KEY, BM_account TEXT NOT NULL, BM_work TEXT NOT NULL, BM_comment TEXT NOT NULL, BM_payload TEXT NOT NULL, BM_status TEXT NOT NULL DEFAULT 'queued', BM_reply TEXT, UNIQUE(BM_account,BM_work,BM_comment))").execute(&BM_pool).await?;
        sqlx::query("CREATE TABLE IF NOT EXISTS BM_reviews (BM_id INTEGER PRIMARY KEY, BM_record INTEGER NOT NULL, BM_audit TEXT NOT NULL, BM_reply TEXT)").execute(&BM_pool).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS BM_reviews_record ON BM_reviews(BM_record,BM_id)")
            .execute(&BM_pool)
            .await?;
        sqlx::query("CREATE TABLE IF NOT EXISTS BM_policy (BM_id INTEGER PRIMARY KEY CHECK(BM_id=1), BM_auto_review INTEGER NOT NULL DEFAULT 0)").execute(&BM_pool).await?;
        sqlx::query("INSERT OR IGNORE INTO BM_policy(BM_id) VALUES(1)")
            .execute(&BM_pool)
            .await?;
        sqlx::query("CREATE TABLE IF NOT EXISTS BM_source (BM_id INTEGER PRIMARY KEY CHECK(BM_id=1), BM_state TEXT NOT NULL)").execute(&BM_pool).await?;
        sqlx::query("CREATE TABLE IF NOT EXISTS BM_webhooks (BM_id TEXT PRIMARY KEY, BM_payload TEXT NOT NULL)").execute(&BM_pool).await?;
        sqlx::query("CREATE TABLE IF NOT EXISTS BM_control (BM_id INTEGER PRIMARY KEY CHECK(BM_id=1), BM_enabled INTEGER NOT NULL DEFAULT 0, BM_generation INTEGER NOT NULL DEFAULT 0)").execute(&BM_pool).await?;
        sqlx::query("INSERT OR IGNORE INTO BM_control(BM_id,BM_enabled) VALUES(1,0)")
            .execute(&BM_pool)
            .await?;
        sqlx::query("UPDATE BM_inbox SET BM_status=CASE WHEN BM_status='sending' THEN 'unknown' ELSE 'queued' END WHERE BM_status IN ('processing','sending')").execute(&BM_pool).await?;
        Ok(Self { BM_pool })
    }

    pub async fn BM_enqueue(&self, BM_message: &BM_Comment) -> Result<bool> {
        ensure!(
            [
                &BM_message.BM_account,
                &BM_message.BM_work,
                &BM_message.BM_comment,
                &BM_message.BM_author
            ]
            .iter()
            .all(|BM_x| !BM_x.is_empty() && BM_x.len() <= 512),
            "invalid comment reference"
        );
        ensure!(
            !BM_message.BM_text.is_empty() && BM_message.BM_text.len() <= 16_000,
            "invalid comment length"
        );
        let BM_result = sqlx::query("INSERT OR IGNORE INTO BM_inbox(BM_account,BM_work,BM_comment,BM_payload) VALUES(?,?,?,?)")
            .bind(&BM_message.BM_account).bind(&BM_message.BM_work).bind(&BM_message.BM_comment)
            .bind(serde_json::to_string(BM_message)?).execute(&self.BM_pool).await?;
        Ok(BM_result.rows_affected() == 1)
    }

    pub async fn BM_enabled(&self) -> Result<bool> {
        Ok(
            sqlx::query_scalar::<_, i64>("SELECT BM_enabled FROM BM_control WHERE BM_id=1")
                .fetch_one(&self.BM_pool)
                .await?
                != 0,
        )
    }

    pub async fn BM_set_enabled(&self, BM_enabled: bool) -> Result<()> {
        sqlx::query(
            "UPDATE BM_control SET BM_enabled=?,BM_generation=BM_generation+1 WHERE BM_id=1",
        )
        .bind(BM_enabled)
        .execute(&self.BM_pool)
        .await?;
        Ok(())
    }

    pub async fn BM_generation(&self) -> Result<i64> {
        Ok(
            sqlx::query_scalar("SELECT BM_generation FROM BM_control WHERE BM_id=1")
                .fetch_one(&self.BM_pool)
                .await?,
        )
    }

    pub async fn BM_record_webhook(
        &self,
        BM_id: &str,
        BM_payload: &serde_json::Value,
    ) -> Result<bool> {
        ensure!(
            !BM_id.is_empty() && BM_id.len() <= 512,
            "invalid event reference"
        );
        let BM_result =
            sqlx::query("INSERT OR IGNORE INTO BM_webhooks(BM_id,BM_payload) VALUES(?,?)")
                .bind(BM_id)
                .bind(serde_json::to_string(BM_payload)?)
                .execute(&self.BM_pool)
                .await?;
        Ok(BM_result.rows_affected() == 1)
    }

    pub async fn BM_claim(&self) -> Result<Option<(i64, BM_Comment)>> {
        let BM_row = sqlx::query("UPDATE BM_inbox SET BM_status='processing' WHERE BM_id=(SELECT BM_id FROM BM_inbox WHERE BM_status='queued' ORDER BY BM_id LIMIT 1) RETURNING BM_id,BM_payload")
            .fetch_optional(&self.BM_pool).await?;
        BM_row
            .map(|BM_row| {
                Ok((
                    BM_row.get("BM_id"),
                    serde_json::from_str(BM_row.get::<&str, _>("BM_payload"))?,
                ))
            })
            .transpose()
    }

    pub async fn BM_finish(
        &self,
        BM_id: i64,
        BM_status: &str,
        BM_reply: Option<&str>,
    ) -> Result<()> {
        ensure!(
            ["queued", "review", "skipped", "failed", "sending", "accepted", "unknown"]
                .contains(&BM_status),
            "invalid queue state"
        );
        sqlx::query("UPDATE BM_inbox SET BM_status=?,BM_reply=CASE WHEN ?='skipped' THEN NULL ELSE COALESCE(?,BM_reply) END WHERE BM_id=?")
            .bind(BM_status)
            .bind(BM_status)
            .bind(BM_reply)
            .bind(BM_id)
            .execute(&self.BM_pool)
            .await?;
        Ok(())
    }

    pub async fn BM_counts(&self) -> Result<serde_json::Value> {
        let BM_rows =
            sqlx::query("SELECT BM_status,COUNT(*) AS BM_count FROM BM_inbox GROUP BY BM_status")
                .fetch_all(&self.BM_pool)
                .await?;
        let mut BM_counts = serde_json::Map::new();
        for BM_row in BM_rows {
            BM_counts.insert(
                BM_row.get::<String, _>("BM_status"),
                serde_json::json!(BM_row.get::<i64, _>("BM_count")),
            );
        }
        Ok(serde_json::Value::Object(BM_counts))
    }
}
