# Rust 评论队列与 Goose 运行时

当前实现包含独立 API library、单个常驻后台、持久化队列、进程内 Goose 执行，以及 Goose 桌面管理页面。真实账号接入尚未完成。

## 已实现

- 一个 `BM_watch` 进程持有共享的 Goose `StateMachineServices`，按批次处理评论；不调用 `goose run` 子进程。
- 账号/作品/评论标识去重，SQLite 私有落盘；暂停状态持久化，空队列不调用模型。
- external 专用会话显式设置空扩展集合，只有 Goose 原生 `recipe__final_output`；不加载管理员 Plugin、Skill 发现或代码执行工具。


原生测试证实当前 Goose 在状态机里自动提供 `load_skill`，不受扩展列表控制。因此增加了最小的 `StateMachineServicesConfig.BM_disable_skills`：默认 false；本后台设置 true，不注册 SkillOperation 的发现、加载和快捷命令路径。它是运行时级开关，不是完整角色系统。评论后台不在同一 Runtime 内执行管理员工具会话。

- 候选回复仅从已被 Goose 接受的结构化输出提取，受长度和关键词规则约束。
- 本地管理 API 使用 Bearer Token，拒绝带 Origin 的管理请求；状态接口只返回计数，记录接口仅向授权管理员返回私有评论与候选回复。
- 官方 Webhook 按原始请求体验签，校验应用/账号，按 Msg-Id 私有记录，支持 challenge。
- 发送尝试状态先落盘；发送中崩溃转为 unknown，不自动重发。

实际二进制目前使用禁用写入的平台适配器，因此候选回复进入 review，不能发送真实评论。合成测试通过模拟平台验证提交、失败与恢复语义。Webhook content 的实际应用字段尚未核实，原始事件只记录，不猜测解码后自动回复。认证的 `/BM/messages` 接收归一化评论，供后续适配器和本地测试使用。

## 本地命令

在 `BM_custom` 运行 `just` 查看中文说明：

```sh
just watch-build
just watch-test
just watch-start /path/to/private/BM_watch.local.json
just watch-status /path/to/private/BM_watch.local.json
just watch-resume /path/to/private/BM_watch.local.json
just watch-stop /path/to/private/BM_watch.local.json
```

`watch-start` 前台启动服务，新队列默认暂停；`watch-resume` 才启用消费。符合关键词规则的队列内容会通过 Goose 调用配置的 LLM，其他内容进入 review。`watch-stop` 暂停消费和新的提交，保留进程及数据。桌面端启动的后台使用 detached 进程和私有日志，关闭窗口或退出桌面应用后继续运行；没有自动安装 launchd，机器重启后需要重新启动后台。

测试只使用临时目录、回环 HTTP、合成评论和模拟模型。`watch-test` 中包含真实 Goose Runtime 与模拟 OpenAI 响应的测试，不调用外部模型服务。

## Goose 桌面入口

在 `BM_custom` 运行 `just watch-build`，会同时准备桌面需要的后台二进制。已有桌面构建产物时用 `just start_goose_desk_debug` 启动；首次准备桌面环境用 `just build_goose_desk_debug`。

侧栏选择“评论值守”，然后：

1. 选择仓库外、权限为 0600 的私有 JSON 配置。页面只显示配置文件名和任务信息，管理 Token 留在 Electron 主进程。
2. 点击“启动后台”，或连接已经启动的同一后台。新队列默认暂停；点击“开始值守”才启用消费。
3. 查看队列计数、私有评论和候选回复，支持分页与跳过待审核/失败记录。
4. “暂停值守”保留进程；“停止后台”先暂停、再请求退出。关闭窗口不停止后台，重新打开页面会读取私有绑定并重新连接。

运行时的作品范围、关键词规则和间隔由认证后的任务接口返回。修改配置文件不会自动改变正在运行的任务，停止并重启后台后才生效。后台未连接时页面不加载记录，数据仍保存在原私有目录。

调用链是 `BM_WatchView → preload → BM_ipc/BM_manager → BM_watch HTTP API → 队列/Goose Runtime`。IPC 复用 Goose 的已注册主窗口/主 frame 来源校验，不提供任意路径、URL 或命令代理。原有 Goose 聊天后端和模型配置入口保持独立，评论监控仍只有一个 Rust 进程。

桌面调试构建中的后台二进制和中间产物被 Git 忽略，原子替换不会覆盖正在运行的可执行文件内容。

## 私有配置

复制 [BM_watch.example.json](BM_config/BM_watch.example.json) 到仓库外目录，再按本地环境修改。配置文件权限必须为 0600，数据目录必须为 0700 且位于 Git checkout 外。管理 Token 至少 24 字符，请使用随机值；不把配置、队列、评论、凭据或 Goose 会话加入 Git。

`BM_goose_root` 指向已有 Goose 配置根，模型由 Goose 原生配置解析；不更改桌面端配置，也不在代码中内置模型密钥。`BM_data_dir` 保存业务 SQLite 与评论运行的独立会话记录。运行时每条评论创建逻辑会话，不创建进程或复制模型配置。

本地接口：

| 接口 | 用途 |
| --- | --- |
| `GET /health` | PID；不含业务数据 |
| `GET /BM/status` | 认证后读取启用状态与队列计数 |
| `GET /BM/task` | 认证后读取进程实际使用的任务规则和间隔，无凭据 |
| `GET /BM/records?BM_before=id` | 认证后分页读取私有评论与候选，每页最多 50 条 |
| `POST /BM/skip` | 认证后跳过待审核/失败记录，其他状态返回冲突 |
| `POST /BM/shutdown` | 认证后暂停并请求后台退出 |
| `POST /BM/messages` | 认证后写入归一化评论；只接受配置的账号和作品 |
| `POST /BM/resume` / `/BM/pause` | 认证后启用或暂停 |
| `POST /BM/webhook` | 独立平台验签；原始事件私有记录与去重，不运行模型 |

服务仅监听回环地址。真实 Webhook 仍需要平台注册并可达的入口；不能把本地监听地址当作已完成平台订阅。

## 下一阶段的验收前提

核实当前应用的权限、评论字段、分页覆盖与发送回执，然后实现实际适配器和事件归一化。API library 的模拟协议测试不证明当前账号有权限。官方回复接受与审核/展示状态必须区分；缺少幂等或回查能力时不能承诺 exactly-once。

架构见 [单进程设计](../BM_docs/BM_comment_watch_design.md) 与 [API 分层](../BM_docs/BM_douyin_api_design.md)。新增 Rust API 不依赖 Goose、persona、队列或数据库；队列通过平台和生成器接口验证，Goose 适配集中在一个模块。
