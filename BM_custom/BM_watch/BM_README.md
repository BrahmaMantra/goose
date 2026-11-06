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

1. 点击“创建新配置”，在独立的抖音官方窗口扫码登录；回到页面点击“已扫码，读取账号”，填写自己的作品完整链接或 ID 与处理关键词，再保存。也可直接“选择私有配置”。管理 Token 和配置路径留在 Electron 主进程。
2. 点击“启动后台”，或连接已经启动的同一后台。新队列默认暂停；点击“开始值守”才启用消费。
3. 查看队列计数、私有评论和候选回复，支持分页与跳过待审核/失败记录。
4. “暂停值守”保留进程；“停止后台”先暂停、再请求退出。关闭窗口不停止后台，重新打开页面会读取私有绑定并重新连接。

运行时的作品范围、关键词规则和间隔由认证后的任务接口返回。修改配置文件不会自动改变正在运行的任务，停止并重启后台后才生效。后台未连接时页面不加载记录，数据仍保存在原私有目录。

调用链是 `BM_WatchView → preload → BM_ipc/BM_manager → BM_watch HTTP API → 队列/Goose Runtime`。IPC 复用 Goose 的已注册主窗口/主 frame 来源校验，不提供任意路径、URL 或命令代理。原有 Goose 聊天后端和模型配置入口保持独立，评论监控仍只有一个 Rust 进程。

桌面调试构建中的后台二进制和中间产物被 Git 忽略，原子替换不会覆盖正在运行的可执行文件内容。

## 私有配置

### 桌面创建与账号切换

创建目录优先使用当前绝对路径 `GOOSE_PATH_ROOT` 下的 `BM_watch/`，未配置时使用 `~/.goose/BM_watch/`。“选择私有配置”的文件选择器默认打开同一目录。目录必须位于 Git checkout 外，检测到仓库、符号链接或不符合要求的权限时拒绝创建，不自动修改已有目录权限。

每次新建生成独立的 `BM_profile_<random-id>/`，其中保存：

| 文件或目录 | 内容 |
| --- | --- |
| `BM_watch.local.json` | 值守范围、规则、随机管理 Token 与数据目录 |
| `BM_account.local.json` | 官方首页显示的昵称、抖音号、观察时间与浏览器目录引用 |
| `BM_browser/` | Electron 持久化登录状态，含 Cookie 与页面存储 |
| `BM_data/` | 该配置独立的队列、日志与评论会话 |

JSON 为 `0600`，私有目录为 `0700`；浏览器内部文件由 Electron 管理，并由外层私有目录限制访问。真实资料不写入公开源码或测试。Git 忽略规则只作额外防护，主要保证是拒绝在任何 Git checkout 内保存。

扫码窗口没有 Goose preload、Node 权限或管理 IPC；限制 HTTPS 抖音域名的顶层导航，禁用新窗口、下载和设备权限。账号读取复用 `BM_browser_account.py` 已核验的可见账号头部约定；页面结构不符时拒绝猜测。关闭未保存的扫码窗口、取消创建或离开创建页，会清除该未完成会话的认证存储；目录可能保留，但没有可选的值守配置。保存前再次读取账号，防止扫码期间切换账号。

保存成功会绑定配置，不启动后台或模型。作品链接仅解析完整的 `https://www.douyin.com/video/<id>`，不自动访问短链接。当前作品归属尚未做真实平台校验，平台读写仍未启用。页面抖音号不是 OpenAPI `open_id`，网页登录状态不能当作开放平台授权，真实平台适配器接入前必须确认身份映射。

“已扫码，读取账号”是页面观察，不执行自定义抖音鉴权，也不写配置：抖音官方页面负责扫码登录，Electron 主进程检查请求来自 Goose 已注册主窗口及主 frame，并确认扫码窗口属于该窗口、页面位于官方首页，然后读取可见账号头部。包含图标或嵌套文本的账号标签按最深匹配元素定位。昵称按官方首页组件的 `header > left > name` 结构提取，兼容普通 `div` 和账号切换按钮内的 `span`；CSS module 类名只匹配字段前缀，不依赖构建哈希。保留此前核验的直接父节点昵称按钮布局，无法唯一确定时拒绝猜测。

该结构依据 2026-11-06 在线读取的[官方首页入口](https://creator.douyin.com/goofy/douyin_creator_pc/home/index.html)及其公开加载的首页组件资源确认。资源只用于核对可见 DOM 布局，不执行资源代码，不访问其中的内部 API，不将真实页面或账号资料写入仓库。

读取有 8 秒超时，失败不会一直阻塞后续取消操作。页面在扫码按钮附近显示具体原因，终端仅记录固定状态码，例如 `BM_account_header_missing`、`BM_account_name_missing`、`BM_window_unavailable` 或 `BM_read_timeout`；不记录账号值、完整 URL、HTML、Cookie 或原始异常。开发版主进程热重载后需要重新打开扫码窗口。

扫码窗口由 Electron 内置 Chromium 提供，不依赖额外安装系统浏览器。窗口机制本身跨平台；当前私有文件权限检查和 Rust 后台仍有 Unix 平台假设，Windows 整体值守流程尚未适配验证。

切换账号：先“停止后台”，再“选择私有配置”，进入另一个 profile 选择 JSON，然后启动后台并开始值守。每份配置的数据和登录状态独立保留，不复用另一个账号的浏览器；选择配置本身不自动重新登录。登录过期后需要重新扫码创建配置，目前不提供已保存 profile 的重新授权入口。

模型仍由 Goose 原生配置管理。创建时有 `GOOSE_PATH_ROOT` 就引用它；没有时 `BM_goose_root` 保存为 `null`，后台使用 Goose 的操作系统默认配置位置，不创建第二套模型配置。

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
