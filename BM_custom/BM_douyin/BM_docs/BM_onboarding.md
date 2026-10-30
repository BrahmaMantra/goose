# 不启动模型的抖音接入流程

先验证 MCP 通信、配置、官方 OAuth 和最小只读调用，再接入模型。普通创作者账号与开发者主体是不同维度，账号类型本身不代表应用权限已开通。

## 接入条件

账号、开发者主体、应用和部署状态仅保存在本地私有配置，不写入公开文档。

官方[入驻开发者平台](https://developer.open-douyin.com/m/docs/resource/zh-CN/developer/join/join-into-developer-platform)、[入驻常见问题](https://developer.open-douyin.com/m/docs/resource/zh-CN/developer/join/issues)与[个人入驻帮助](https://developer.open-douyin.com/helpCenter/home/detail/94/819)的搜索索引均说明：个人主体仅支持小玩法，移动/网站应用需要企业主体。本次未取到完整正文，具体准入应在控制台核验。

OpenAPI 路线需要合适主体、应用、获批 Scope 与登记的 HTTPS 回调。网页路线使用用户已有账号登录官方创作者中心，不等于开放平台 OAuth。公网临时隧道能否登记尚未核验，不作为已确认方案。

## 当前可选的下一步

| 路线 | 所需条件 | 当前边界 |
| --- | --- | --- |
| 原 OpenAPI OAuth 流程 | 合适主体、应用与获批 Scope，登记的 HTTPS 回调 | 适用条件需在实际接入时核验 |
| 创作者中心网页验证 | 用户选择此路线，在专用本地浏览器中登录官方创作者中心 | 复用浏览器扩展验证页面显示的基础信息；不是 OpenAPI OAuth，无须本项目创建开放平台应用或 OAuth 回调 |
| 无登录能力 | 公开官方资料或用户主动提供的内容 | 可验证来源处理等能力，不能读取登录后的账号信息 |

使用网页路线时，先核对平台要求与页面实际支持的操作，再由用户在官方页面完成扫码/验证；初始验证只读取页面实际显示的基础信息。登录会话留在专用本地浏览器，不要求用户发送 Cookie，不复刻创作者中心私有接口，不绕过验证码。页面自动化对布局和会话状态有依赖，不能承诺与官方 API 相同的稳定性。

Goose 官方提供 [Playwright 扩展接入说明](https://goose-docs.ai/docs/mcp/playwright-mcp/)，可复用上游浏览器能力，无需修改 Goose 内核。独立的 [网页基础信息读取](BM_browser_access.md)已通过 Playwright CLI 验证真实页面结构与只读提取；目前直接调用命名会话，尚未绑定到 Goose 工具层，验证时保持模型不启动。

## 当前进度

| 步骤 | 状态 | 完成标准 |
| --- | --- | --- |
| Python MCP 扩展 | 已实现并验证 | 官方 SDK 客户端完成 initialize、tools/list、tools/call |
| 接入配置预检 | 已实现并验证 | 列出缺项，未授权账号不标记为可用 |
| 独立网页基础信息读取 | 已实现并验证 | 通过已有浏览器会话读取昵称和页面抖音号，真实结果留在私有目录 |
| Goose 加载扩展 | 待验证 | 安装 Goose CLI/桌面端后验证加载；当前只验证 SDK 客户端通信 |
| 官方 OAuth | 待应用与回调信息 | 扫码、校验一次性 state、回调换取 Token，处理拒绝和过期 |
| 最小只读 API | 待获批权限 | 用户授权后直接调用对应官方接口，核对真实响应 |
| 业务工具与 Skill/Recipe | 待首条流程和接口验证 | 根据真实能力、错误和结果状态实现，再接入模型 |

当前唯一暴露的 MCP 工具是 `BM_check_access`，只读取非敏感配置并列出缺项，不连接抖音账号。尚未实现 OAuth 回调、Token 交换或业务接口。

## 用户需要提供的信息

先提供状态和非敏感信息即可，不需要账号密码、Cookie、client_secret 或 Token。

| 信息 | 要提供的内容 | 用途 |
| --- | --- | --- |
| 开发者与应用 | 是否已入驻；主体类型；应用类型和审核状态 | 判断适用的授权流程与准入 |
| 已获批权限 | 控制台能力名称、Scope、核对日期 | 确定实际可调用的接口 |
| 首条真实流程 | 授权/基础信息、自己作品的数据或评论，或投稿交接 | 选择最小 Scope 和验证路径 |
| 回调条件 | 是否有域名、服务器；是否有已登记的 HTTPS 回调地址 | 确定回调服务部署方式 |

推荐先做“账号授权 + 一个已获批的只读接口”。只有基础信息能力确实获批，才将它作为首条接口；不预设普通创作者必然拥有某个 Scope。

尚未入驻时，先在[抖音开放平台](https://developer.open-douyin.com/)确认当前主体可创建的应用和可申请能力。身份核验、扫码授权需用户在官方页面完成；应用审核与权限审批由平台处理。

## 无模型验证命令

从仓库根目录运行预检，不需要额外依赖：

```bash
python3 BM_custom/BM_douyin/BM_scripts/BM_access_check.py
```

默认读取 [BM_access.example.json](../BM_config/BM_access.example.json)，未知字段保持空值。退出码 `0` 表示配置满足预检条件，`2` 表示信息尚缺，`1` 表示文件或格式有误。即使返回 `0`，也不代表官方批准、回调网络可达或账号已授权。

安装依赖后，使用仓库外的隔离 Python 环境直接验证 MCP 通信：

```bash
PYTHONDONTWRITEBYTECODE=1 /path/to/BM_venv/bin/python BM_custom/BM_douyin/BM_scripts/BM_mcp_check.py
```

其他环境可用 Python 3.13+ 建立虚拟环境，安装 [BM_requirements.txt](../BM_config/BM_requirements.txt)，再使用该环境的 Python 执行 `BM_mcp_check.py`。采用 Goose 官方教程使用的 MCP 1.x API，固定 `mcp==1.25.0`，暂不自动升级到 2.x。

真实配置存放在仓库外，以 `BM_` 命名，例如 `/path/to/BM_private/BM_access.local.json`。沿用示例字段，通过环境变量选择：

```bash
BM_DOUYIN_CONFIG=/path/to/BM_private/BM_access.local.json python3 BM_custom/BM_douyin/BM_scripts/BM_access_check.py

BM_DOUYIN_CONFIG=/path/to/BM_private/BM_access.local.json PYTHONDONTWRITEBYTECODE=1 /path/to/BM_venv/bin/python BM_custom/BM_douyin/BM_scripts/BM_mcp_check.py
```

应用类型填 `website` 或 `mobile`；完成开发者入驻后填 `verified`，应用通过审核后填 `approved`。Scope 来自实际获批列表；确认回调登记后才将 `BM_redirect_registered` 设为 `true`。模板不存放 secret 或 Token，预检结果不回显 client_key 和回调地址。

## Goose 扩展参数

待安装 Goose 后，按官方方式添加 STDIO 扩展：

| 参数 | 通用示例 |
| --- | --- |
| 名称 | `BM_douyin` |
| 类型 | STDIO |
| 命令 | `/path/to/BM_venv/bin/python` |
| 参数 | `/path/to/goose/BM_custom/BM_douyin/BM_scripts/BM_mcp_server.py` |
| 环境变量 | `BM_DOUYIN_CONFIG` 指向实际配置；未设置时使用示例 |

`BM_mcp_check.py` 直接执行协议调用，无需询问模型“有哪些工具”。Goose 内部加载仍需另行验证。

## 官方依据

2026-10-29 联网重新读取[抖音获取授权码](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/douyin-get-permission-code)，确认先申请 Scope、授权参数与回调登记要求。预检采用无 query、无 fragment 的 HTTPS 回调，便于后端处理授权回调。

- [创建移动应用和网站应用](https://developer.open-douyin.com/m/docs/resource/zh-CN/dop/develop/app-mgmt/create-mobile-and-web-app)：本次未取到正文，创建步骤来自官方搜索索引，实际字段以控制台为准。
- [开发者入驻常见问题](https://developer.open-douyin.com/m/docs/resource/zh-CN/developer/join/issues)：检索到主体认证与资质说明，不能据此承诺个人账号能申请所有应用类型。
- [Goose 官方 Python MCP 扩展教程](https://goose-docs.ai/docs/tutorials/custom-extensions)：独立 MCP 扩展是上游支持的扩展边界。
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)：使用真实客户端和服务端验证通信。

个人信息、凭据、登录会话和运行产物的存储要求见 [BM_privacy.md](BM_privacy.md)。所有公开示例路径均为占位符。
