#![allow(non_snake_case)]
use bm_watch::{
    BM_browser::{BM_Browser, BM_ReaderLaunch},
    BM_store::BM_Comment,
    BM_worker::BM_CommentPlatform,
};
use std::{os::unix::fs::PermissionsExt, path::PathBuf};
#[tokio::test]
async fn BM_reader_and_sender_share_one_child_and_transport_errors_are_unknown() {
    let BM_temp = tempfile::tempdir().unwrap();
    let BM_script = BM_temp.path().join("BM_browser.py");
    let BM_marker = BM_temp.path().join("BM_starts");
    std::fs::write(&BM_script,format!(r#"import json,sys
with open({:?},'a') as f:f.write('start\n')
print(json.dumps({{'BM_state':'booted','BM_comments':[],'BM_complete':False}}),flush=True)
for line in sys.stdin:
 request=json.loads(line)
 if request.get('BM_action')=='send':
  if request['BM_message']['BM_comment']=='BM_disconnect':sys.exit(0)
  print(json.dumps({{'BM_state':'accepted','BM_code':'BM_platform_accepted','BM_reply_id':'BM_reply'}}),flush=True)
 else:print(json.dumps({{'BM_state':'ready','BM_comments':[],'BM_complete':True}}),flush=True)
"#,BM_marker.to_str().unwrap())).unwrap();
    std::fs::set_permissions(&BM_script, std::fs::Permissions::from_mode(0o600)).unwrap();
    let BM_browser = BM_Browser::BM_new(
        BM_temp.path().join("BM_private.json"),
        BM_ReaderLaunch {
            BM_executable: PathBuf::from("/usr/bin/python3"),
            BM_app: Some(BM_script),
        },
    );
    assert_eq!(
        BM_browser.BM_poll("12345678").await.unwrap().BM_state,
        "ready"
    );
    let mut BM_comment = BM_Comment {
        BM_account: "BM_owner".into(),
        BM_work: "12345678".into(),
        BM_comment: "BM_comment".into(),
        BM_author: "BM_reader".into(),
        BM_text: "你好".into(),
        BM_is_ai_reply: false,
    };
    assert_eq!(
        BM_browser
            .BM_deliver(&BM_comment, "合成回复")
            .await
            .BM_state,
        "accepted"
    );
    assert_eq!(
        std::fs::read_to_string(&BM_marker).unwrap().lines().count(),
        1
    );
    BM_comment.BM_comment = "BM_disconnect".into();
    assert_eq!(
        BM_browser
            .BM_deliver(&BM_comment, "合成回复")
            .await
            .BM_state,
        "unknown"
    );
    BM_browser.BM_stop().await;
}
