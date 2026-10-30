# 独立本地 CLI

进入 `BM_custom/BM_douyin`，运行 `just prepare` 即可准备本地入口并确保专用浏览器已打开。后续直接运行 `./BM_douyin`，无需在终端 source Shell 函数。模型不属于这些启动步骤。

```bash
cd /path/to/goose/BM_custom/BM_douyin
just prepare
./BM_douyin account check
./BM_douyin works list --limit 3
./BM_douyin goose probe works
```

## 本地目录

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
