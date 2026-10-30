# 无模型验证账号检查 MCP 工具

`BM_mcp_server.py` 暴露两个独立工具：`BM_check_access` 检查 OpenAPI 接入配置；`BM_check_account` 复用本地浏览器读取创作者中心账号头部。网页检查不需要开放平台应用或模型，两个工具的权限与用途不混用。

## 私有运行配置

| 环境变量 | 用途 |
| --- | --- |
| `BM_DOUYIN_CONFIG` | 可选的 OpenAPI 预检配置；省略时使用公开空值示例 |
| `BM_DOUYIN_BROWSER_CONFIG` | 仓库外的浏览器配置；未配置时账号工具返回 `not_configured` |
| `BM_DOUYIN_ACCOUNT_OUTPUT` | 可选的仓库外私有结果文件；省略时不保存账号结果 |

浏览器配置和结果位置遵循 [基础信息读取说明](BM_browser_access.md)：配置 `0600`，工作目录和结果目录 `0700`。运行目录不可在仓库内。工具不接受来自调用者的文件路径或任意浏览器指令，只使用本地部署配置。

MCP 结果只包含 `BM_status`、`BM_fields_present`、`BM_private_result_saved`。昵称、抖音号、来源和观察时间仅在显式配置的私有结果文件中保存，不进入 MCP 返回或模型上下文。异常不回显原始 CLI 输出、配置值或账号信息。

## 使用 SDK 直接验证

从仓库根目录执行，Python 环境安装 [BM_requirements.txt](../BM_config/BM_requirements.txt)：

```bash
BM_DOUYIN_BROWSER_CONFIG=/path/to/BM_private/BM_browser.local.json \
BM_DOUYIN_ACCOUNT_OUTPUT=/path/to/BM_private/BM_artifacts/BM_account.local.json \
/path/to/BM_venv/bin/python -B BM_custom/BM_douyin/BM_scripts/BM_mcp_check.py \
  --tool BM_check_account --require-authenticated
```

该命令进行真实 MCP initialize、tools/list 和 tools/call，要求账号头部可读取。去掉 `--require-authenticated` 可以检查尚未配置或未支持的页面状态。省略 `--tool` 时保持原有 OpenAPI 配置预检行为。

## 使用 Goose 自身验证

已使用官方 Goose CLI `1.57.0` 验证 `mcp-probe`。它是上游隐藏的诊断命令，升级时需核验 `goose mcp-probe --help`，不能视为稳定业务 API。该入口创建 Goose 的 MCP 会话与扩展管理器，不创建模型 Provider。

参考 [BM_probe_account.json](../BM_config/BM_probe_account.json)，在仓库外私有目录运行：

```bash
GOOSE_PATH_ROOT=/path/to/BM_private/BM_goose_state \
GOOSE_TELEMETRY_ENABLED=false \
GOOSE_DISABLE_KEYRING=1 \
/path/to/goose mcp-probe \
  'BM_DOUYIN_BROWSER_CONFIG=/path/to/BM_private/BM_browser.local.json BM_DOUYIN_ACCOUNT_OUTPUT=/path/to/BM_private/BM_artifacts/BM_account.local.json /path/to/BM_venv/bin/python -B /path/to/repo/BM_custom/BM_douyin/BM_scripts/BM_mcp_server.py' \
  --script /path/to/repo/BM_custom/BM_douyin/BM_config/BM_probe_account.json
```

事先创建 `BM_goose_state` 并限制权限为 `0700`。`GOOSE_PATH_ROOT` 将 Goose 配置、会话和状态放到私有目录；诊断输出仅包含工具定义和脱敏状态。不要执行 `goose session` 或模型启动脚本来完成本阶段验证。

## 正式扩展参数

后续在 Goose 中按 STDIO 扩展配置：名称 `BM_douyin`，命令为隔离 Python 环境，参数为 `-B` 与 `BM_mcp_server.py` 的实际路径，环境变量使用上述私有配置。无需修改 Goose 内核或新增 Provider。

已验证 SDK 与 Goose 的实际工具发现和直接调用。模型驱动的工具选择、ReAct 与完整业务流程仍未验证；账号真实值默认不提供给模型。验证与公开材料继续遵循 [隐私约定](BM_privacy.md)。
