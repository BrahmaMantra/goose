# Goose + LLM 只读 Agent

`BM_douyin agent run` 使用 Goose 原生 Plugin、Recipe 和模型配置。Goose 加载 Skill，调用 Plugin 声明的 MCP 服务，并执行 PreToolUse Hook。我们的 Python 脚本负责本地资源准备、运行隔离、事件摘要和私有结果；未修改 Goose 内核。

## 使用

在 `BM_custom/BM_douyin` 中执行：

```bash
just prepare
just validate
just probe account
just probe works

# 进入 Goose 原生模型配置，可能查询服务元数据；不执行 Agent 任务
just configure

# 调用配置的 LLM；可能产生 API 费用或加载本地服务中的模型
just agent "检查登录状态，成功后读取最多3条作品，简短报告结果"
```

`prepare` 准备本地 CLI 和 Plugin，并打开或复用专用浏览器，不调用模型。首次已有旧模型配置时，在本地导入到 Goose 原生配置；已配置的 Provider 和模型不会被旧文件覆盖。普通 `prepare` 没有 `--open-browser` 时不打开浏览器。

## 模型配置

配置位于本地 `BM_data_dir/BM_goose_state/config/config.yaml`，禁用系统钥匙串时凭据位于同目录 `secrets.yaml`。文件权限为 `0600`，私有目录为 `0700`。使用 `just configure` 调用 Goose 自己的配置界面；修改 Provider 和模型后无需编辑业务代码。

[配置示例](../BM_config/BM_goose.example.json)与[凭据示例](../BM_config/BM_goose_secrets.example.json)仅含通用占位值。JSON 是 YAML 的兼容写法，可以用于原生 `config.yaml` 和 `secrets.yaml`；Goose 配置界面也可以写正常 YAML。YAML 解析依赖固定在 [BM_requirements.txt](../BM_config/BM_requirements.txt)，由配置的 Python 环境执行，CLI 引导入口继续使用标准库。

旧 `BM_deepseek.local.json` 只用于首次迁移；运行入口不再读取它，也不再传固定的 `--provider` 或 `--model`。旧文件保留在本地，完成迁移后可自行归档。其他 Provider 的兼容性以实际服务和 Goose 支持情况为准，本次没有运行真实模型推理。当前边界针对由 Goose 执行工具循环的模型接入；自行管理工具循环的托管 Agent Provider 需要单独验证。

用户任务会发送给所选模型服务，不要包含凭据或个人敏感信息。模型凭据不放在 Recipe、Prompt 或 MCP 返回中；MCP 启动器只传业务环境变量，不继承模型凭据。

## 执行与权限

- 每次执行创建新的私有运行目录，快照 Goose 原生配置和凭据；不复用此前会话。
- 每次运行只部署 `BM_douyin` Plugin，移除配置快照中的其他扩展与 Plugin 条目，并显式禁用已核查的默认平台扩展。Recipe 不列显式扩展，由 Goose 自动发现 Plugin 的 MCP 服务；不使用 `--no-profile`。
- Plugin 提供 `BM_readonly` Skill；Hook 只允许加载这个确切名称，不允许其他 Skill、支持文件路径或附加 Skill 参数。
- MCP 使用 Plugin 命名空间；账号和作品工具实际名称为 `bm_douyin_bm_douyin__BM_check_account` 和 `bm_douyin_bm_douyin__BM_list_works`。工具说明及 Skill 使用业务名称，Goose 负责命名空间。
- Hook 只放行这两个业务工具及严格参数。MCP Agent 模式只注册这两个工具，要求本服务实例先检查账号成功，作品上限为 3。
- Recipe 限制 5 个连续 Agent 步骤，运行限制每轮 512 输出 Token、重复调用次数及 180 秒超时；进程锁拒绝并行本地 Agent。这些限制不能精确保证 API 费用。

当前验证版本中，模型可见工具为 `load_skill` 和两个业务工具。Goose 仍可能列出内置 Skill 的知识条目，Hook 只允许加载指定 Skill。升级后需复测默认扩展集合和工具暴露，不能用当前验证承诺未来所有版本。Hook、配置快照和私有目录不是 OS 沙箱，也不能防御有本机配置修改权限的操作者。

模型仅收到状态、字段存在性、读取数量和范围。真实昵称、抖音号及作品文字只写本地。工具在支持的首页和内容管理页之间导航，不执行发布、修改、删除、评论、翻页或导出。网页布局与登录状态变化仍会造成失败。

## 结果与诊断

```bash
just results works
just results account
just results agent
```

结果查看是显式本地操作，会显示个人数据，不调用模型或重新读取浏览器。显示的是最近保存的一次结果，应核对时间；此前结果不能替代本次工具执行证据。

每次运行保留私有日志和 Agent 报告，最新报告为 `BM_results/BM_agent.local.json`。终端只显示最终答复；错误或超时返回安全提示与非零退出码。事件摘要记录 Skill 加载状态，不将 Skill 正文当作业务 JSON；进程正常退出不等于业务成功，应结合实际工具调用和返回。

Goose 子进程使用 `umask=077`，prepare 会修复本应用原生配置的文件权限。保存日志前移除原生凭据文件和鉴权环境中的凭据字面量，日志仍按敏感资料管理。应用任务与业务结果存储独立于 Goose 会话。

## 无模型验证

```bash
just test
just test-native
just validate
just probe account
just probe works
```

`test` 使用临时目录和合成数据，覆盖原生配置迁移、配置保留、权限、事件解析及超时脱敏。`test-native` 使用真实 Goose CLI、本机回环 HTTP 模拟响应和合成 MCP 服务，验证 Plugin 自动加载、Skill、工具命名空间、参数拒绝及 Hook 失败阻止执行；不连接真实模型服务或抖音，不读取真实账号或模型配置。

`validate` 仅校验 Recipe。`probe` 通过 Plugin 启动器和 Goose mcp-probe 读取真实网页，不调用模型；作品探测先检查账号，上限为 3。直接 CLI `works list` 仍支持最多 10 条，属于无模型手动操作。

结构和学习入口见 [原生 Plugin 说明](BM_native_plugin.md)，隐私约束见 [BM_privacy.md](BM_privacy.md)。
