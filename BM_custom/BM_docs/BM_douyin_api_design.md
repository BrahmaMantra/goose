# Rust 抖音 API 与值守分层

状态：第一份代码 PR 已实现 API library 与单进程合成验证；尚未调用真实账号。

## 1. 当前决策

按最新决定，使用 Rust 小型 API library，监控评论的后台保持单个常驻进程。官方 SDK 当前列出 Java、NodeJS、Go，没有 Rust；参考官方文档与固定版本 Go SDK，不引入额外语言运行时。

实现位于 `BM_custom/BM_douyin_api`，通过异步 reqwest 调用已声明接口。只包装评论列表、回复提交和原始字节 Webhook 验签，不维护整个抖音开放平台 SDK。

## 2. 依赖方向

值守消费者依赖通用 `BM_CommentPlatform`；平台适配负责账号引用与官方 DTO 的转换，再调用独立 API library。API library 不依赖 Goose、persona、任务、队列或数据库。

`BM_custom/BM_watch` 管理消息队列、批次、规则、运行时与控制入口。Goose Runtime 是同进程 library，不通过 goose run 启动每条评论。API library 同样编译进进程。

## 3. 已实现与限制

| 内容 | 状态 |
| --- | --- |
| HTTP Client、固定官方地址、超时、禁止重定向 | 已实现 |
| 移动/网站与小程序评论路径选择 | 显式区分，不互换凭证 |
| 列表请求编码、错误检查、分页结果 | 合成 HTTP 已验证；最新平台参数与配额未真实验收 |
| 回复 POST 与错误分类 | 已实现，不自动重试；调用结果不等同公开展示 |
| Webhook 原始请求体验签与 JSON 解析 | 已实现，SHA-1(client secret + 原始字节)与常量时间比较 |
| OAuth、评论回复列表、平台回查 | 未实现；无公开权限就不启用真实工具 |
| 事件归一化与实际发送适配器 | 待核验当前应用协议；可运行后台只记录原始事件、生成待处理候选，不发送真实评论 |

小程序响应依据固定版本 [官方 Go SDK client.go](https://github.com/bytedance/douyin-openapi-sdk-go/blob/a50593c5ccdc31ab5b7cb2153947dfad612bbed9/client/client.go)，包括 err_no、data.data.list；移动/网站使用不同路径和响应。模拟契约通过不证明当前账号已获权限或接口最新版本完全一致。

官方资料：[SDK 总览](https://developer.open-douyin.com/m/docs/resource/zh-CN/dop/develop/openapi/sdk-overview)、[Webhook 总则](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/summarize)。

## 4. 业务边界

Token 由调用方注入，不写文件、不默认输出请求/响应。SDK 保留平台数据，值守消息只含通用账号/作品/评论引用，不含凭据。Raw Webhook 先验签，再校验应用/账号，按 Msg-Id 私有落盘；不猜测 content 字段后调用模型。

接口不自动无限重试。回复响应丢失或发送期间崩溃记录为 unknown，回查能力缺失时待人工处理，不承诺 exactly-once。规则与目标由值守控制，external Runtime 不持有平台发送工具。

## 5. 模拟验证与下一步

独立 library 使用回环 HTTP 测试请求编码、路径、两种响应、平台错误和重定向；Webhook 使用合成请求测试原始字节与篡改。值守使用模拟平台与真实 Goose 加模拟模型测试。

下一步核实当前应用的评论字段、Scope、分页覆盖、回复回执与可达回调入口，完成事件归一化和真实适配器，再接桌面管理页。真实数据、密钥、日志和队列保留在仓库外，公开代码与 PR 只用通用例子。
