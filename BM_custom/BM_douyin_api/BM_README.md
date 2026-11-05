# 独立 Rust 抖音 API library

使用异步 reqwest；不依赖 Goose、模型、队列、persona 或数据库。调用方注入用户 access_token，库不持久化凭据、不自动重试回复 POST、不跟随重定向转发 Token。

实现 `BM_list_comments`、`BM_submit_reply` 和原始字节 Webhook `BM_verify`。必须显式选择移动/网站或小程序协议；路径和响应层级不同，不能互换应用凭据。

小程序协议参考固定版本 [官方 Go SDK](https://github.com/bytedance/douyin-openapi-sdk-go/blob/a50593c5ccdc31ab5b7cb2153947dfad612bbed9/client/client.go)：`/api/apps/v1/item/list_comment/` 与 `/api/apps/v1/item/reply_comment/`，响应 `err_no`、`data.data.list`。移动/网站使用 `/item/comment/list/` 和 `/item/comment/reply/`；当前模拟契约按旧接口模型实现，最新字段与权限需真实接入前确认。

Webhook 依据 [官方总则](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/summarize)，验证 SHA-1(client secret + 原始请求体)，再解析 JSON。SDK 返回平台字段，账号/作品范围和消息队列由调用方负责。

`BM_loopback` 只接受 HTTP 回环 IP，供模拟协议测试使用；生产地址固定为官方域名。`BM_CommentPage` 保留平台记录的原始 JSON；平台适配器负责映射业务类型和字段缺失，不把未经核实的字段标记为完整。

本库尚未用真实账号调用。平台返回成功只表示请求被接受，不证明回复已公开展示；没有实现 OAuth、权限申请、回查、网页抓取或能力绕过。
