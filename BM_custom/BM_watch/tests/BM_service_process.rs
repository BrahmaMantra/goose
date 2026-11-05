#![allow(non_snake_case, non_camel_case_types)]
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader},
    os::unix::fs::PermissionsExt,
    path::Path,
    process::{Child, Command, Stdio},
    time::Duration,
};

struct BM_Child(Child);
impl Drop for BM_Child {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn BM_start(BM_config: &Path) -> BM_Child {
    let mut BM_child = BM_Child(
        Command::new(env!("CARGO_BIN_EXE_BM_watch"))
            .arg("--config")
            .arg(BM_config)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let mut BM_line = String::new();
    BufReader::new(BM_child.0.stdout.take().unwrap())
        .read_line(&mut BM_line)
        .unwrap();
    assert!(BM_line.starts_with("BM_watch running"));
    BM_child
}

#[tokio::test]
async fn BM_process_auth_batches_and_restart() {
    let BM_temp = tempfile::tempdir().unwrap();
    let BM_root = BM_temp.path();
    std::fs::set_permissions(BM_root, std::fs::Permissions::from_mode(0o700)).unwrap();
    let BM_port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let BM_path = BM_root.join("BM_watch.local.json");
    let BM_token = "BM_synthetic_control_token_12345";
    std::fs::write(&BM_path,serde_json::to_vec(&json!({"BM_data_dir":BM_root.join("BM_data"),"BM_goose_root":BM_root,"BM_admin_token":BM_token,"BM_interval_seconds":1,"BM_batch_size":1,"BM_port":BM_port,"BM_rules":{"BM_account":"BM_owner","BM_works":["BM_work"],"BM_allow_contains":[],"BM_max_reply_chars":100}})).unwrap()).unwrap();
    std::fs::set_permissions(&BM_path, std::fs::Permissions::from_mode(0o600)).unwrap();
    let mut BM_child = BM_start(&BM_path);
    let BM_pid = BM_child.0.id();
    let BM_http = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap();
    let BM_base = format!("http://127.0.0.1:{BM_port}");
    assert_eq!(
        BM_http
            .get(format!("{BM_base}/BM/status"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        BM_http
            .post(format!("{BM_base}/BM/resume"))
            .bearer_auth(BM_token)
            .header("Origin", "https://example.com")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    for BM_id in ["BM_1", "BM_1", "BM_2"] {
        let BM_response=BM_http.post(format!("{BM_base}/BM/messages")).bearer_auth(BM_token).json(&json!({"BM_account":"BM_owner","BM_work":"BM_work","BM_comment":BM_id,"BM_author":"BM_reader","BM_text":"synthetic comment"})).send().await.unwrap();
        assert!(BM_response.status().is_success());
    }
    assert!(BM_http
        .post(format!("{BM_base}/BM/resume"))
        .bearer_auth(BM_token)
        .send()
        .await
        .unwrap()
        .status()
        .is_success());
    tokio::time::timeout(Duration::from_secs(6), async {
        loop {
            let BM_status: Value = BM_http
                .get(format!("{BM_base}/BM/status"))
                .bearer_auth(BM_token)
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            assert_eq!(BM_status["BM_pid"], BM_pid);
            if BM_status["BM_counts"]["review"] == 2 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .unwrap();
    assert!(BM_http
        .post(format!("{BM_base}/BM/pause"))
        .bearer_auth(BM_token)
        .send()
        .await
        .unwrap()
        .status()
        .is_success());
    assert_eq!(
        BM_http
            .get(format!("{BM_base}/BM/records"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let BM_task: Value = BM_http
        .get(format!("{BM_base}/BM/task"))
        .bearer_auth(BM_token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(BM_task["BM_rules"]["BM_works"], json!(["BM_work"]));
    assert!(!BM_task.to_string().contains(BM_token));
    let BM_records: Value = BM_http
        .get(format!("{BM_base}/BM/records"))
        .bearer_auth(BM_token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(BM_records["BM_records"].as_array().unwrap().len(), 2);
    let BM_id = BM_records["BM_records"][0]["BM_id"].as_i64().unwrap();
    let BM_older: Value = BM_http
        .get(format!("{BM_base}/BM/records?BM_before={BM_id}"))
        .bearer_auth(BM_token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(BM_older["BM_records"].as_array().unwrap().len(), 1);
    assert!(BM_http
        .post(format!("{BM_base}/BM/skip"))
        .bearer_auth(BM_token)
        .json(&json!({"BM_id":BM_id}))
        .send()
        .await
        .unwrap()
        .status()
        .is_success());
    assert_eq!(
        BM_http
            .post(format!("{BM_base}/BM/skip"))
            .bearer_auth(BM_token)
            .json(&json!({"BM_id":BM_id}))
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    assert_eq!(
        BM_http
            .post(format!("{BM_base}/BM/shutdown"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let BM_second = Command::new(env!("CARGO_BIN_EXE_BM_watch"))
        .arg("--config")
        .arg(&BM_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .unwrap();
    assert!(!BM_second.success());
    assert!(BM_http
        .post(format!("{BM_base}/BM/shutdown"))
        .bearer_auth(BM_token)
        .send()
        .await
        .unwrap()
        .status()
        .is_success());
    assert!(BM_child.0.wait().unwrap().success());
    drop(BM_child);
    let _BM_restarted = BM_start(&BM_path);
    // A restart invalidates pooled sockets to the previous server instance.
    let BM_http = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap();
    let BM_status: Value = BM_http
        .get(format!("{BM_base}/BM/status"))
        .bearer_auth(BM_token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(BM_status["BM_enabled"], false);
    assert_eq!(BM_status["BM_counts"]["review"], 1);
    assert_eq!(BM_status["BM_counts"]["skipped"], 1);
}
