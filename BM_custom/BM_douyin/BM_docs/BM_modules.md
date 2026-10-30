# 模块职责与无模型回归

`BM_douyin` 可执行入口加载 `BM_cli.BM_main`。CLI 负责解析参数、选择操作、输出结果和返回退出码；底层模块不依赖 CLI。

| 模块 | 职责 | 主要依赖 |
| --- | --- | --- |
| `BM_cli.py` | 命令解析与分发 | 下列操作模块 |
| `BM_local_config.py` | 本地配置校验、prepare、doctor、运行环境 | 浏览器配置校验、私有存储 |
| `BM_browser_commands.py` | Playwright 命令、打开与复用会话 | 本地目录准备、浏览器配置校验、私有存储 |
| `BM_browser_session.py` | 浏览器配置校验、带锁的只读调用 | 私有存储 |
| `BM_browser_account.py` / `BM_browser_works.py` | 固定页面读取和字段提取 | 浏览器只读调用、私有存储 |
| `BM_goose_probe.py` | Plugin MCP 无模型探测、账号前置检查及允许字段校验 | 本地运行环境、Plugin 部署 |
| `BM_goose_setup.py` | 原生 Plugin 私有部署、模型配置快照与环境约束 | 私有存储、配置的 Python/YAML |
| `BM_goose_migration.py` | 旧模型文件的一次性导入校验 | 私有存储 |
| `BM_agent.py` | 任务绑定、Goose 执行、日志脱敏和落盘 | 原生资源准备、事件解析、私有存储 |
| `BM_agent_events.py` | 从 Goose 流式事件提取最终答复和允许的工具摘要 | Python 标准库 |
| `BM_private_storage.py` | 仓库外路径约束、私有 JSON 原子写入 | Python 标准库 |

`BM_mcp_server.py` 注册能力并约束 Agent 模式；`BM_plugin/BM_scripts/BM_guard.py` 负责工具执行前的拒绝策略，`BM_agent_guard.py` 保留兼容入口。Goose 继续负责模型调用、Agent 循环与工具调度，Python 模块负责本地接入。

CLI 和浏览器配置格式保持兼容；模型配置已迁移到 Goose 原生机制。Plugin 及 Agent 作品上限为 3，直接 CLI 作品读取上限仍为 10。浏览器使用独立 Profile，复用已打开会话。原生资源结构见 [BM_native_plugin.md](BM_native_plugin.md)。

在本目录运行回归：

```bash
just test
just test-native
just validate
./BM_douyin --help
./BM_douyin doctor
just --list
```

回归使用临时私有目录、合成事件和模拟子进程，覆盖配置与文件权限、会话复用、探测返回字段和临时文件清理、最终答复识别、Agent 超时与密钥脱敏。测试不打开浏览器、不读取账号与模型配置、不连接模型服务。`doctor` 另外检查当前本地依赖，不执行推理。

需要验证真实工具链时可运行 `./BM_douyin goose probe account` 和 `./BM_douyin goose probe works`。它们复用已打开的浏览器，不调用模型；会读取当前页面，真实字段仅写入本地私有结果。
