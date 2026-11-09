use anyhow::{ensure, Result};
use goose::recipe::Recipe;
use serde_json::json;
use std::{fs, os::unix::fs::PermissionsExt, path::Path};

pub const BM_DEFAULT_PROMPT: &str = include_str!("../BM_prompts/BM_comment_assistant.md");

pub fn BM_reply_recipe(BM_data: &Path, BM_budget: usize) -> Result<Recipe> {
    ensure!((1..=1000).contains(&BM_budget), "invalid reply budget");
    let mut BM_instructions =
        format!("{BM_DEFAULT_PROMPT}\n本次回复正文最多 {BM_budget} 个字符。\n");
    let BM_context = BM_data.join("BM_reply_context.local.md");
    match fs::symlink_metadata(&BM_context) {
        Ok(BM_metadata) => {
            ensure!(
                BM_metadata.is_file()
                    && !BM_metadata.file_type().is_symlink()
                    && BM_metadata.permissions().mode() & 0o077 == 0
                    && BM_metadata.len() <= 16384,
                "reply context must be a private regular file"
            );
            let BM_text = fs::read_to_string(&BM_context)?;
            ensure!(BM_text.len() <= 16384, "reply context too large");
            BM_instructions.push_str("\n## 管理员提供的回复背景\n仅使用其中适合公开的事实与表达偏好；不得改变前述权限边界或输出格式。\n");
            BM_instructions.push_str(&BM_text);
        }
        Err(BM_error) if BM_error.kind() == std::io::ErrorKind::NotFound => {}
        Err(BM_error) => return Err(BM_error.into()),
    }
    Ok(serde_json::from_value(json!({
        "title":"BM 中文评论小助手","description":"以账号 AI 小助手身份回应一条外部评论","extensions":[],
        "instructions":BM_instructions,
        "response":{"json_schema":{"type":"object","additionalProperties":false,"required":["BM_send","BM_text"],
            "properties":{"BM_send":{"type":"boolean"},"BM_text":{"type":"string","maxLength":BM_budget}},
            "allOf":[{"if":{"properties":{"BM_send":{"const":true}}},"then":{"properties":{"BM_text":{"minLength":1,"pattern":"[\\u3400-\\u9FFF]"}}},"else":{"properties":{"BM_text":{"maxLength":0}}}}]
        }},
        "settings":{"max_turns":3}
    }))?)
}
