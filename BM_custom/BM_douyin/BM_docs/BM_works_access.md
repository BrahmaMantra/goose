# 只读获取当前已加载的作品列表

`BM_list_works` 通过已登录的专用 Playwright 会话读取创作者中心作品卡片，支持独立 CLI、Python MCP SDK 和 Goose 无模型诊断调用。模型选择与 Goose 内核保持独立。

## 范围与字段

默认最多读取 3 条，`BM_limit` 允许 1～10。工具在官方来源页面通过“内容管理”菜单进入已核验的 `/creator-micro/content/manage` 路由，只读取当前筛选与排序条件下已渲染、未隐藏的卡片，不翻页、不滚动加载、不修改筛选条件，也不导出、下载媒体或点击作品操作。

| 私有记录字段 | 来源与限制 |
| --- | --- |
| `BM_title_text` | 作品卡片标题/描述的 DOM 文字，最多 500 个 Unicode 字符 |
| `BM_title_truncated` | 是否超过本工具的文字上限 |
| `BM_publish_time_text` | 卡片显示的时间文字，最多 100 字符；不推断时区或转成精确时间戳 |
| `BM_status_text` | 卡片状态标签文字，最多 100 字符；缺失时为 null，不推断为已发布 |

不读取平台内部 ID、媒体或签名链接、账号资料、统计指标、评论、Cookie 或内部接口。卡片定位使用已核验的布局类名前缀，不使用账号值、具体作品标题、完整 CSS 哈希或临时快照 ref。布局变化时返回未支持或歧义状态。

## 部分结果语义

每次结果均带 `BM_scope=current_loaded_list`、`BM_complete=false`。读取数量不是账号作品总量；`BM_more_loaded` 只说明当前 DOM 中是否还有超过限制的可读卡片，即使它为 false，也不能推断账号没有更多作品。

`ready` 表示取得受限的一批卡片；`no_items_visible` 表示等待后仍未发现已渲染条目，可能是空筛选、加载状态或其他页面变化，不代表账号作品库为空。`unsupported_page`、`ambiguous_layout`、`login_required` 不返回作品条目，也不能当作成功的完整查询。

工具会等待列表和首张卡片出现。共享浏览器传输以非阻塞进程锁拒绝同一工作目录的并发 BM_ 调用；忙时等待前一个调用结束后重试。锁不能限制用户手动操作或直接 Playwright 调用。网页检查会切换当前浏览器页面；已有账号头部检查仍要求位于首页。

## 私有配置与运行

复用 [浏览器配置](../BM_config/BM_browser.example.json)。配置与输出保存在仓库外，沿用 `0600` 文件、`0700` 目录和原子写入规则。共享连接与存储位于 `BM_browser_session.py`，账号和作品读取分别定义自己的页面逻辑和字段。

```bash
python3 BM_custom/BM_douyin/BM_scripts/BM_browser_works.py \
  --config /path/to/BM_private/BM_browser.local.json \
  --limit 3 \
  --output /path/to/BM_private/BM_artifacts/BM_works.local.json
```

MCP 使用 `BM_DOUYIN_BROWSER_CONFIG` 选择浏览器配置，`BM_DOUYIN_WORKS_OUTPUT` 可选指定私有结果文件。不配置浏览器时返回 `not_configured`；不配置输出时不保存作品结果。调用参数仅为受限的 `BM_limit`，不接受任意路径或浏览器指令。

终端与 MCP 仅返回状态、范围、读取数量、已加载条目是否超过限制以及保存状态；不返回标题、时间或作品状态的真实值。私有文件额外包含观察时间与字段记录，公开材料不得包含这些数据。

## 无模型验证

使用隔离 Python 环境运行 SDK 检查：

```bash
BM_DOUYIN_BROWSER_CONFIG=/path/to/BM_private/BM_browser.local.json \
BM_DOUYIN_WORKS_OUTPUT=/path/to/BM_private/BM_artifacts/BM_works.local.json \
/path/to/BM_venv/bin/python -B BM_custom/BM_douyin/BM_scripts/BM_mcp_check.py \
  --tool BM_list_works --limit 3 --require-ready
```

Goose 的 `mcp-probe` 使用 [BM_probe_works.json](../BM_config/BM_probe_works.json)，扩展命令中传入上述私有环境变量；隔离 Goose 状态、关闭遥测的方式沿用 [MCP 验证说明](BM_mcp_account.md)。

已验证真实内容管理页面、SDK 与 Goose 调用，以及浏览器 DOM 中的隐藏条目、空渲染、重复列表/标题、Unicode 截断和来源边界。未验证完整作品库、其他布局版本或模型驱动分析。所有真实数据与浏览器测试产物适用 [隐私约定](BM_privacy.md)。
