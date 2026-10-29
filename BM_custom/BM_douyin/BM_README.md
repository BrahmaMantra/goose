# 抖音助手接入准备

本目录通过独立脚本和官方能力核查扩展 Goose，不修改 Agent 循环、模型 Provider 或其他内核代码。

本 fork 的定制目录、文件以及自定义函数、变量和常量统一以 `BM_` 开头；上游名称、Python 标准库和外部协议字段保持兼容。

## 本地模型

模型与设备的实际配置仅保存在本地。运行前设置 `BM_LOCAL_MODEL`，或通过 `--model` 指定已安装的 Ollama 模型；公开仓库不包含个人模型标签、硬件规格或本机检查输出。check 只读取服务、模型与驻留状态，不执行推理。

```bash
# 只读检查，不加载模型
python3 BM_custom/BM_douyin/BM_scripts/BM_local_model.py check

# 查看即将使用的环境/命令，不发网络请求、不执行命令
python3 BM_custom/BM_douyin/BM_scripts/BM_local_model.py run --dry-run

# 显式创建限制上下文和输出长度的模型别名，引用已安装权重
python3 BM_custom/BM_douyin/BM_scripts/BM_local_model.py prepare

# 启动已安装的 Goose CLI；默认不加载个人默认扩展
python3 BM_custom/BM_douyin/BM_scripts/BM_local_model.py run

# 明确使用 8K 上下文时，prepare 和 run 必须使用相同选项
python3 BM_custom/BM_douyin/BM_scripts/BM_local_model.py prepare --context 8192
python3 BM_custom/BM_douyin/BM_scripts/BM_local_model.py run --context 8192

# Goose 不在 PATH 时显式指定已安装二进制
python3 BM_custom/BM_douyin/BM_scripts/BM_local_model.py run --goose-bin /path/to/goose
```

默认 4K 上下文、每次最多 256 输出 Token、4 个连续 Agent 步骤。别名由源模型/上下文/输出限制确定，Modelfile 固定这些参数，避免仅依赖兼容 API 的上下文参数。模型选择只存在于脚本与运行环境中。不会下载权重，不会停止已有 Ollama 服务，也不会卸载另一个会话驻留的模型。

脚本使用进程锁串行运行本脚本的 prepare/run；该锁不能限制其他客户端。Ollama 服务端的单并发与单模型限制，应按部署指南设置。`serve` 可启动尚未运行的服务，使用 `OLLAMA_NUM_PARALLEL=1`、`OLLAMA_MAX_LOADED_MODELS=1` 等配置；已有服务不会自动重启。这些服务端变量无法靠启动 Goose 改变。

run 正常结束或被中断后会请求卸载本次别名。模型别名和 Goose 会话仍保留。当前脚本没有承诺 thinking 已关闭：Goose 原生 Ollama Provider 发往 `/v1/chat/completions`，其 thinking 配置与原生 `/api/chat` 的 `think:false` 不等价。需要在真实工具调用验证中检查兼容行为；本次不通过修改内核或虚构环境变量解决。

对 256 Token 的短输出限制，完整报告和较长结构化工具调用可能被截断，首版应使用短任务和少量工具，按实际结果调整分段方式。Recipe 自己指定模型/Provider 或子任务配置时可能覆盖环境，应在正式接入前核查所有调用均使用所选本地部署。当前脚本不是跨任意 Recipe 的模型路由强制器。

## 抖音接入

不启动模型的步骤、用户需要提供的信息和 MCP 直接验证命令见 [接入流程](BM_docs/BM_onboarding.md)。目前增加了 `BM_check_access` 接入预检 MCP 工具，已验证 SDK 通信；它不调用抖音业务接口。

先阅读 [官方接入核查](BM_docs/BM_official_access.md)。以开放平台控制台当前状态、具体应用类型和获批 Scope 为接入依据；创作者中心网页功能不直接等同于公开 API。

普通创作者场景不默认启用企业号专属接口。具体账号、主体、应用和权限状态仅保存在本地配置中。

本阶段提供模型启动脚本、接入预检 MCP 工具和官方接入调查，尚未实现发布/评论/数据 MCP 工具或对应自动操作 Skill。下一阶段以具体应用实际获批的普通账号能力确定工具范围，再编写基于真实工具的 Skill/Recipe；SDK/H5 投稿仍需用户在抖音官方入口完成发布。

公开说明只记录通用验证方法，不发布个人环境的检查结果。隐私存储与提交审查见 [BM_privacy.md](BM_docs/BM_privacy.md)。
