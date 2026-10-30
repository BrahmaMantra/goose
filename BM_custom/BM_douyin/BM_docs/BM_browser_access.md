# 通过创作者中心页面读取基础信息

本模块直接复用 Playwright CLI 的命名会话，通过官方创作者中心页面读取账号头部信息。无需 Goose 会话或模型推理；它不实现 OpenAPI OAuth。

## 当前能力

`BM_browser_account.py` 只读取账号昵称和页面标注的抖音号。页面上的抖音号不是开放平台 `open_id`，两者不可混用。统计指标、作品、评论、发布、Cookie、storage state 与内部接口均不在此工具的读取范围。

工具检查当前页面是否位于 `https://creator.douyin.com`，在 `main` 中定位可见的“抖音号：”标签，再读取同一账号头部的唯一昵称按钮。定位方式依据真实页面结构核验，不使用具体账号值、快照 ref 或完整 CSS 哈希类名。布局不符合预期时返回未支持状态，避免猜测数据。

| 状态 | 含义 |
| --- | --- |
| `authenticated` | 找到可见账号头部，昵称和抖音号均非空 |
| `login_required` | 缺少账号头部且出现可见登录按钮 |
| `unsupported_page` | 当前来源或页面结构未支持，不能直接判定为退出登录 |
| `ambiguous_layout` | 标签、可见性或昵称按钮结构存在歧义 |

这是页面观察结果，不是对 Cookie 有效期、用户授权 Scope 或官方账号 API 的验证。页面尚未加载、出现验证码或其他登录形态时也可能返回未支持状态，需在官方页面查看并完成交互。

## 使用步骤

1. 按 [Playwright CLI 官方说明](https://github.com/microsoft/playwright-cli)安装已核验的 `@playwright/cli@0.1.22`，使用独立浏览器 Profile 和仓库外工作目录。
2. 打开[抖音创作者中心](https://creator.douyin.com/)，用户在官方页面扫码登录。保持命名会话开启。
3. 参考 [BM_browser.example.json](../BM_config/BM_browser.example.json)，在仓库外创建 `BM_browser.local.json`，填写本地 Node、CLI 脚本、私有工作目录和会话名。配置必须为 `0600` 或更严格权限，工作目录必须为 `0700` 或更严格权限。
4. 执行账号检查，可选将真实结果保存到仓库外的私有目录：

```bash
python3 BM_custom/BM_douyin/BM_scripts/BM_browser_account.py \
  --config /path/to/BM_private/BM_browser.local.json \
  --output /path/to/BM_private/BM_artifacts/BM_account.local.json
```

输出目录需要事先创建并限制为 `0700`。结果以 `0600` 权限原子替换写入，包含昵称、抖音号、来源路径和观察时间。来源 URL 不保存 query 或 fragment。

终端只输出状态、字段是否存在和是否保存结果，不回显账号值。未指定 `--output` 时不写账号结果文件。退出码 `0` 表示读取成功，`2` 表示页面状态尚不满足读取条件，`1` 表示本地配置、权限或浏览器调用失败。

本脚本不负责启动浏览器，也不会自动重新登录。运行时通过现有命名会话调用 `run-code`；浏览器 CLI 自身可能产生页面快照等文件，因此其工作目录也必须在仓库外。页面快照、会话和浏览器 Profile 均适用 [隐私约定](BM_privacy.md)。

## 验证与边界

已在真实创作者中心页面验证账号头部结构与只读提取。公开代码、配置示例、提交与 PR 不包含实际账号值、页面快照、登录资料、本机路径或内部文档。

后续改版需重新核验页面结构并更新定位逻辑。将本读取能力接入 Goose 工具层、实现更多页面能力和验证更多登录形态，属于后续工作；本次不宣称完整的抖音业务助手已经可用。
