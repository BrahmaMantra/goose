# 抖音官方接入核查

调查日期：2026-10-29。本文基于联网读取的抖音开放平台公开规范、能力页、OAuth 文档与官方公告检索结果。未登录用户的创作者中心或应用控制台，未调用带用户 Token 的业务接口；因此不宣称用户已具备某项权限。

普通创作者场景不默认采用企业号专属接口。账号身份本身不代表符合应用或能力准入；具体账号与权限状态保存在本地私有配置。

## 1. 先区分三类官方入口

| 入口 | 职责 | 对 Goose 助手的意义 |
| --- | --- | --- |
| [抖音创作者中心](https://creator.douyin.com/) | 创作者使用的产品入口 | 可以作为用户实际操作入口；其页面功能不能自动视作公开 API。本次公开页为动态页面，未取得登录后的功能与数据 |
| [抖音开放平台](https://developer.open-douyin.com/) | 开发者入驻、应用、能力申请、OAuth、SDK/OpenAPI | 自动接入工具首先依据这里的真实能力与授权 |
| 开放平台控制台的具体应用 | 当前应用主体、类型、审核、已获批权限与配额 | 决定某个工具实际上能执行什么，公开文档只是能力说明 |

开发者身份、应用类型、用户账号类型是三个维度。企业主体不等于每个被授权账号都是企业号；普通用户 OAuth 也不等于可使用企业号专属接口。

## 2. 官方材料显示的能力边界

| 能力 | 本次获得的官方依据 | 接入结论 |
| --- | --- | --- |
| 用户授权 | [抖音获取授权码](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/douyin-get-permission-code)说明扫码授权、code、Scope 与回调 | 可以设计授权流程；实际开发前需有应用 client_key 和已登记的 HTTPS redirect_uri |
| 投稿 | [发布能力使用规范](https://developer.open-douyin.com/docs/resource/zh-CN/dop/operation-standard/platform-capabilities/useclue)区分 SDK 投稿/H5 投稿，用户在抖音编辑/发布页操作 | 不能把投稿或二维码交接当作服务端自动发布成功 |
| 投稿 Scope | [角色概述](https://developer.open-douyin.com/docs/resource/zh-CN/developer/introduction/type-and-permission)列出 aweme.share、h5.share、open.get.ticket 等 | 实现以具体获批能力为准，不能继续硬编码旧 video.create 作为必然可用路径 |
| 投稿准入 | 发布规范对企业主体、正式应用、应用类别、使用场景有具体要求 | 需核验实际主体与应用是否符合准入 |
| 视频数据 | [视频数据管理](https://developer.open-douyin.com/docs/resource/zh-CN/dop/ability/open-data/video-data-solution)官方检索内容提示“能力改造中，暂不开放申请”，旧 Scope 为 data.external.item | 不能直接承诺新网站应用能取得该数据；应核对替代能力和具体应用状态 |
| 投稿作品的数据 | 当前角色概述列出投稿任务、posting.behavior 等能力 | 是特定投稿任务/作品范围，不能推断可读取账号全部历史内容或全站指标 |
| 视频评论 | [评论能力中心](https://developer.open-douyin.com/m/capacity-center-page/capacity-detail/7180530418775490619)列出不同应用类型和申请路径，检索准入条件显示可申请；[旧评论说明](https://developer.open-douyin.com/m/docs/resource/zh-CN/dop/ability/interaction-management/video-comment-management-solution)含 item.comment | 公开材料存在不同时间/入口的状态描述，应查控制台并申请/核验，不笼统判定永久不可用，也不直接判定当前已可用 |
| 企业号评论回复 | [企业号回复评论接口](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/enterprise-open-ability/comment-management-enterprise/video-comment-reply)官方检索内容明确用户需为企业号 | 不作为普通账号默认实现 |

当前发布规范还明确：H5 投稿需同时具备“发布内容至抖音”和“开通 H5 场景”，单独 H5 场景不等于有发布能力。H5/网页生成二维码后，由用户用抖音 App 扫码进入编辑/发布页，用户可修改内容并手动发布。

发布规范对 SDK/H5 投稿描述的准入包括：不向个体工商户主体开放；企业主体注册资本不低于 50 万且注册时间不低于 1 年；正式应用；适用创作工具、社区、硬件配套、游戏等类别，使用场景也有要求。这些是该投稿能力的要求，不应外推为全部抖音能力的入驻门槛。申请时以最新规范和控制台为准。

## 3. 旧文档与能力回收的处理

[移动/网站应用部分能力权限下线/回收公告](https://developer.open-douyin.com/announcement/289)的官方检索正文列出：2025-02-13 起停止部分新增申请，2025-03-13 起分批回收相应历史权限；其中存在特殊标记说明。检索条目涉及 video.create、数据与评论等旧权限。

本次公告页面 HTML 为动态外壳，完整列表/特别说明未取得可直接核对的正文；日期和上述概述来自官方页面的搜索索引。因此不把整份列表都推断成永久下线，也不根据旧 API 链接就认为权限仍开放。

[发布能力回收与规范调整通知](https://developer.open-douyin.com/announcement/348)的公开检索内容与当前可读取的发布能力规范对准入要求一致。实施时记录能力页 URL、更新时间、应用类型和控制台状态；冲突时由当前控制台/官方工单确认具体权限。

## 4. 正式接入流程

1. 在本地确认账号类型、开发者主体与应用类型。根据业务需求选择移动、网站或小程序，不能为了某个旧 Scope 任意混用应用路径。
2. 在开放平台控制台创建/选择应用，核对当前实际可申请的能力、准入和审核要求。
3. 明确最小 Scope 和对应接口，记录申请状态、配额、用户授权要求。不把全部官方能力一次性暴露给模型。
4. 配置应用重定向地址，按该应用的官方 OAuth 文档完成用户授权，服务端交换和保管 Token。
5. 用已授权账号做最小只读接口验证，得到真实请求/响应后实现 MCP 工具和参数 Schema。
6. 按实际允许的能力分别实现评论回复、投稿交接或其他动作。只有得到明确最终回执才能记录完成。
7. 编写对应 Skill/Recipe，引用真实工具、输入范围、来源、错误与结果状态。

授权文档的地址是 `https://open.douyin.com/platform/oauth/connect/`，参数含 client_key、response_type=code、scope、redirect_uri、state。redirect_uri 必须是应用已登记的 HTTPS 地址；文档明确不支持自定义 query。生成地址必须正确 URL 编码，不把 client_secret 放进浏览器/模型上下文。

正式实现应将 state 与服务端授权请求绑定，校验回调并交换凭据，按响应记录过期时间与撤销状态；Token 续期按照对应应用文档实现，不能混淆用户 access_token 和应用 client_token。此处只描述流程，未创建假凭据或未授权调用接口。

## 5. Skill 和工具应该怎样落地

| 层 | 内容 |
| --- | --- |
| 配置 | 应用类型、账号、已获批能力、接口版本、配额与执行规则 |
| MCP 工具 | 实际调用授权接口、取得内容/评论/指标或提交投稿；参数、结果与错误来自真实接口 |
| 业务服务 | 持久化账号、Action、幂等、配额、回执与回查 |
| Skill | 使用哪些真实能力、怎样分析与生成、何时需要用户补信息或完成平台交接 |
| Recipe | 固定一个已验证任务需要的模型和工具集合 |

如果只有创作者中心产品可用而没有公开 API 权限，可以先生成用户可用的分析或创作产物，由用户在官方入口完成操作。尚未验证官方有数据导出能力，不能把“导出 CSV”当作已确认步骤。

本阶段不默认抓取登录 Cookie、复刻创作者中心私有接口，也不将浏览器自动化作为缺少 API 权限的隐式替代。若未来确需自动化，应单独确认具体操作、平台要求、会话与结果恢复，再评估工具。

## 6. 官方来源与核查记录

- [创作者中心](https://creator.douyin.com/)
- [角色概述](https://developer.open-douyin.com/docs/resource/zh-CN/developer/introduction/type-and-permission)：本次读取到正文，确认当前基础权限和投稿任务范围。
- [发布能力使用规范](https://developer.open-douyin.com/docs/resource/zh-CN/dop/operation-standard/platform-capabilities/useclue)：本次读取到完整正文，确认 SDK/H5 和准入。
- [OAuth 授权码](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/douyin-get-permission-code)：本次读取到正文，确认地址、参数与回调要求。
- [能力回收公告 289](https://developer.open-douyin.com/announcement/289)：页面动态外壳；相关结论取自官方搜索索引。
- [发布调整公告 348](https://developer.open-douyin.com/announcement/348)：页面动态外壳；准入结论另与可读取的发布规范交叉核对。
- [视频数据管理](https://developer.open-douyin.com/docs/resource/zh-CN/dop/ability/open-data/video-data-solution)：相关状态来自官方搜索索引。
- [评论能力中心](https://developer.open-douyin.com/m/capacity-center-page/capacity-detail/7180530418775490619)：申请路径与准入来自官方搜索索引。
- [企业号回复评论](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/enterprise-open-ability/comment-management-enterprise/video-comment-reply)：账号要求来自官方搜索索引。

能力开放状态会变化，本文不是权限开通承诺。实际接入时核验应用与获批权限，再确定真实工具范围；个人接入状态不记录在公开仓库。
