# DeepSeek 驱动的只读 Agent

`BM_douyin agent run` 使用 Goose 正常的 Agent 执行流程，通过官方 DeepSeek Provider 选择并调用本地 MCP 工具。它与无模型的 `goose probe` 分开，不启动本地 Ollama 模型。

```bash
cd /path/to/goose/BM_custom/BM_douyin
just prepare
./BM_douyin agent run "检查登录状态，成功后读取最多3条作品，简短报告结果"
# 同一入口的 Just 别名
just agent "检查登录状态，成功后读取最多3条作品，简短报告结果"
```

## 私有模型配置

在 CLI 配置的 `BM_data_dir` 下保存 `BM_deepseek.local.json`，权限必须为 `0600` 或更严格。格式参考 [公开示例](../BM_config/BM_deepseek.example.json)。目前只支持官方 `https://api.deepseek.com`（允许 `/v1` 基础路径）；实际调用由 Goose 的 `custom_deepseek` Provider 完成。其他网关需单独核验，不会自动替换请求目标。

密钥通过进程环境供 Provider 鉴权，不放入命令参数、Recipe、Prompt 或工具返回。配置、日志、任务、结果都在仓库外。调用远端模型会产生 API 费用；不要将敏感信息写入用户任务，任务文本本身会发送给服务方。

## 执行限制

- 每次运行使用新的私有 Recipe、工作目录和 Goose 状态，显式扩展列表只包含抖音只读 MCP 服务，不复用以前的会话。
- Agent 模式 MCP 只注册 `BM_check_account` 和 `BM_list_works`。先确认本次服务实例的账号检查返回 authenticated，才允许读取作品；上限固定为3条。
- Goose `PreToolUse` 钩子只放行这两个工具及受限参数；钩子执行失败时阻止调用。`load_skill` 仍可能被 Goose 核心提供，但钩子拒绝它；不宣称工具从模型可见列表中完全消失。
- 限制5个连续 Agent 步骤、每轮512输出 Token、重复调用次数，单次运行超时180秒。进程锁拒绝同时启动两个本地 Agent；这些是运行限制，不是 API 费用的精确预算。
- 模型收到状态、字段存在性、读取数量与部分结果范围；真实昵称、抖音号和作品文字只由工具保存在本地结果文件。

Recipe 使用 Goose 上游的配置结构。运行时生成的 `plugin.json`、`hooks/hooks.json`、`.agents` 等名称是上游发现机制要求，均位于私有运行目录；公开自定义文件和函数使用 `BM_` 前缀。Goose 未修改。

工具会在已支持的首页与内容管理间导航，不执行发布、修改、删除、评论、导出、翻页或任意 Shell 操作。网站布局、会话和网络失败仍可能导致无法完成。钩子和部署配置属于本地可信边界，不防御具有本机配置修改权限的操作者。

## 本地结果与日志

下列 `./BM_douyin` 命令要求当前目录为 `BM_custom/BM_douyin`。在父目录 `BM_custom` 中需要使用 `./BM_douyin/BM_douyin`；入口路径与权限排查见 [CLI 说明](BM_cli.md#区分目录与可执行入口)。

```bash
./BM_douyin results works
./BM_douyin results account
./BM_douyin results agent
```

结果查看是显式的本地操作，会在终端显示真实作品/账号数据；不会调用模型、重新读取浏览器或上传 GitHub。请勿把该终端输出复制到公开材料。它显示最近保存的一次结果，需核对观察时间；未执行作品读取时，不能把先前结果当成本次结果。

`BM_results/BM_agent.local.json` 保存最近一次 Agent 状态、回答、实际调用记录、工具返回和模型可见工具名。每次运行的 `BM_agent_*` 私有目录保留独立日志和记录。终端默认只显示模型最终答复；过程错误、超时或工具失败使用脱敏的未完成提示并返回非零退出码。模型的自然语言答复不替代工具执行证据。

Goose 可能在步数上限前生成解释或拒绝答复；进程正常退出不意味着任何业务成功，需结合 `BM_tool_calls` 和 `BM_tool_results` 判断。模型原始流式输出保存在私有日志中，不向终端回放思考文本。保存前会移除配置密钥字面量，日志仍按敏感资料管理。

## 验证范围

已验证官方 DeepSeek 请求、Goose 真实工具调用和账号检查后的受限作品读取。提示规则区分“本地读取真实值”与“模型获得脱敏摘要”，以及部分列表与完整作品库。异常和授权状态必须以真实结果为准，不保证模型所有表述均准确。配置和执行边界遵循 [隐私约定](BM_privacy.md)。
