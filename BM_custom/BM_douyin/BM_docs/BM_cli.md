# 独立本地 CLI

## 推荐使用 Just 命令

运行 `just` 或 `just --list` 会显示每个任务的中文用途、参数和模型调用提示。`prepare`、`account` 等便捷名称会以 alias 显示，对应的实现任务保留 `BM_` 前缀。

在 `BM_custom` 或 `BM_custom/BM_douyin` 中都可以运行下列命令，无需直接执行同名目录。父目录的 `Justfile` 将任务转发到应用目录；上游仓库根 Justfile 保持原样。

| 命令 | 用途 |
| --- | --- |
| `just` | 列出任务与参数 |
| `just prepare` | 准备本地入口并打开或复用专用浏览器，不调用模型 |
| `just doctor` | 检查本地依赖与配置 |
| `just browser-open` / `just browser-close` | 打开或关闭专用浏览器 |
| `just account` | 直接读取账号状态，不调用模型 |
| `just works 3` | 直接读取受限作品卡片，不调用模型 |
| `just probe account` / `just probe works` | Goose 无模型工具验证 |
| `just agent "检查登录状态，成功后读取最多3条作品"` | DeepSeek 驱动的任务，产生 API 调用 |
| `just results works` / `just results account` / `just results agent` | 查看最近保存的本地结果，终端可能显示个人数据 |

任务文本作为单个带引号的参数传递。若文本含 `$` 或反引号，建议在终端使用单引号包住完整任务，避免 Shell 展开；Just 转发参数时也进行 Shell 引用。

进入 `BM_custom/BM_douyin`，运行 `just prepare` 即可准备本地入口并确保专用浏览器已打开。后续直接运行 `./BM_douyin`，无需在终端 source Shell 函数。模型不属于这些启动步骤。

```bash
cd /path/to/goose/BM_custom/BM_douyin
just prepare
./BM_douyin account check
./BM_douyin works list --limit 3
./BM_douyin goose probe works
```

## 本地目录

### 专用浏览器是什么

专用浏览器是通过 Playwright 启动的独立 Chrome 会话，使用本项目自己的 Profile（登录 Cookie、网站存储和偏好），不连接日常使用的 Chrome Profile。用户在抖音官方页面扫码登录后，工具通过这个会话读取页面。

它让抖音登录资料与日常浏览器中的邮件、飞书和其他账号分开，并使后续工具调用能复用登录状态。Profile、快照和运行产物都保存在仓库外的私有目录，不上传 GitHub。关闭窗口会结束当前会话，但保留 Profile；重新打开时登录是否仍有效由抖音决定。

专用 Profile 是资料隔离方式，不是加密或完整安全沙箱，也不绕过平台登录或验证码。工具只执行已开放的页面读取；模型不会获得浏览器 Profile 或登录凭据。

### 区分目录与可执行入口

`BM_custom/BM_douyin/` 是目录，其中的 `BM_douyin` 才是可执行文件。下列命令按当前目录选择：

| 当前目录 | 查看结果命令 |
| --- | --- |
| 仓库根目录 | `./BM_custom/BM_douyin/BM_douyin results works` |
| `BM_custom` | `./BM_douyin/BM_douyin results works` |
| `BM_custom/BM_douyin` | `./BM_douyin results works` 或 `just results works` |

如果终端提示当前目录是 `BM_custom`，执行 `./BM_douyin` 会尝试执行目录，Shell 会报 `permission denied`。进入子目录或使用完整入口路径即可；这不是需要修改目录权限的情况。

`prepare` 生成的 `.local/BM_douyin/BM_bin/BM_douyin` 是另一种入口，在任意目录均可使用其完整路径。如果将该目录加入 PATH 或在已有本地 bin 目录创建指向入口的链接，可直接运行 `BM_douyin results works`，省略 `./`。公开源码不修改用户的 Shell 配置。

默认使用 Goose 仓库同级的 `.local/BM_douyin`，位于 Git 仓库外。`--local-dir` 或 `BM_DOUYIN_LOCAL_DIR` 可以选择其他专用目录。目录名需以 `BM_` 开头。

| 位置 | 内容 |
| --- | --- |
| `BM_config.local.json` | CLI 私有配置，权限 0600；公开字段说明见 [示例](../BM_config/BM_cli.example.json) |
| `BM_bin/BM_douyin` | 本地安装入口，可以在任意工作目录直接执行 |
| `BM_private/BM_browser` | 浏览器配置、专用 Profile 和工作目录 |
| `BM_private/BM_results` | 真实账号/作品结果与本地诊断文件 |
| `BM_private/BM_goose_state` | Goose 配置、日志与隐藏诊断会话 |

本地入口指向当前源码，适合维护 fork 时使用；移动源码后重新执行 prepare 更新入口。本地目录可以在多个源码版本间复用，但不要同时操作同一个浏览器会话。

`prepare` 保留已存在的私有配置和登录会话，不覆盖个人配置。它复用配置中已安装的 Python/MCP SDK、Node/Playwright CLI 和 Goose，并检查依赖；缺失时返回 `BM_ready=false` 与缺项，不宣称安装成功，也不自动下载模型。

首次使用需要先准备上述工具和 [浏览器私有配置](../BM_config/BM_browser.example.json)。prepare 生成的默认路径对应本地目录布局；其他安装位置可以编辑仓库外的 `BM_config.local.json`。`doctor` 不读取账号内容、不加载模型。

## 命令

自然语言任务使用 `./BM_douyin agent run "任务"` 或 `just agent "任务"`，需要私有 DeepSeek 配置并调用远端 API；`./BM_douyin results works`（或 `just results works`）只查看最近的本地记录。执行边界和日志说明见 [BM_agent.md](BM_agent.md)。

| 命令 | 行为 |
| --- | --- |
| `just prepare` | 创建本地入口、检查配置与依赖，复用已有会话或打开专用 Chrome |
| `./BM_douyin prepare` | 只准备 CLI 与配置；`--open-browser` 可同时打开浏览器 |
| `./BM_douyin doctor` | 依赖与本地配置检查 |
| `./BM_douyin browser open` | 打开或复用专用会话；已打开时保持当前页面 |
| `./BM_douyin browser close` | 关闭专用会话，持久化 Profile 留在本地 |
| `./BM_douyin account check` / `just account` | 自行从内容管理切回首页，读取账号头部，终端仅显示脱敏状态 |
| `./BM_douyin works list --limit 3` / `just works 3` | 读取当前已加载的受限作品卡片，不宣称完整作品库 |
| `./BM_douyin goose probe account` / `just probe account` | Goose 自身无模型账号工具验证 |
| `./BM_douyin goose probe works --limit 3` / `just probe works` | Goose 自身无模型作品工具验证 |
| `./BM_douyin mcp serve` | 作为 STDIO MCP 扩展运行，stdout 仅用于 MCP 协议 |

首页和内容管理是已验证的只读路由；账号/作品读取不从发布编辑页或其他未支持页面自动导航，避免影响正在编辑的内容。需要在官方页面完成扫码或验证码时，由用户操作。

专用 `Justfile` 使用 task runner 约定名称，定制 recipe 以 `BM_` 开头，`prepare` 等是便捷别名。它不修改上游根 Justfile，也不运行 Rust 构建、Goose 模型会话或模型启动脚本。

## Goose 扩展入口

配置 STDIO 扩展时，命令使用本地 `BM_bin/BM_douyin` 的实际路径，参数为 `mcp serve`。本地入口自带私有目录选择，不需要把个人路径或环境变量写到公开代码中。

Goose probe 使用已有的隐藏诊断命令；升级版本后需重新验证。网页字段、私有权限、部分结果范围与模型关闭的边界分别沿用 [账号读取](BM_browser_access.md)、[作品读取](BM_works_access.md)及[隐私约定](BM_privacy.md)。
