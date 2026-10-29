> **Fork 维护说明**
>
> 本仓库是 [aaif-goose/goose](https://github.com/aaif-goose/goose) 的个人 fork，由 [BrahmaMantra](https://github.com/BrahmaMantra) 维护。
>
> - 定期通过 **merge** 同步上游，**不使用 rebase** 同步上游，保留本仓库与上游的提交历史。
> - 尽量以小范围、低侵入的方式修改代码；优先使用配置、Skill/Recipe、MCP 扩展和独立业务模块，减少对上游核心代码的修改。
> - 保持上游目录结构、许可与版权声明；将定制改动集中在明确的扩展边界，降低后续合并冲突和维护成本。
> - 合并上游时解决冲突并完成与改动相关的验证，再推送更新。
>
> 同步上游的基本流程：
> ```bash
> git fetch upstream
> git switch main
> git merge upstream/main
> git push origin main
> ```

---

<div align="center">

# goose

_your native open source AI agent — desktop app, CLI, and API — for code, workflows, and everything in between_

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"
    ><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg"></a>
  <a href="https://discord.gg/n8R5VaWDAn"
    ><img src="https://img.shields.io/discord/1287729918100246654?logo=discord&logoColor=white&label=Join+Us&color=blueviolet" alt="Discord"></a>
  <a href="https://github.com/aaif-goose/goose/actions/workflows/ci.yml"
     ><img src="https://img.shields.io/github/actions/workflow/status/aaif-goose/goose/ci.yml?branch=main" alt="CI"></a>
  <a href="https://insights.linuxfoundation.org/project/goose"><img src="https://insights.linuxfoundation.org/api/badge/health-score?project=goose"></a>
  <a href="https://repology.org/project/goose-cli/versions"><img src="https://repology.org/badge/tiny-repos/goose-cli.svg" alt="Packaging status"></a>
</p>

<a href="https://trendshift.io/repositories/25298?utm_source=repository-badge&amp;utm_medium=badge&amp;utm_campaign=badge-repository-25298" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/repositories/25298" alt="aaif-goose%2Fgoose | Trendshift" width="250" height="55"/></a>

</div>


goose is a general-purpose AI agent that runs on your machine. Not just for code — use it for research, writing, automation, data analysis, or anything you need to get done.

A native desktop app for macOS, Linux, and Windows. A full CLI for terminal workflows. An API to embed it anywhere. Built in Rust for performance and portability.

goose works with 15+ providers — Anthropic, OpenAI, Google, Ollama, OpenRouter, Azure, Bedrock, and more. Use API keys or your existing Claude, ChatGPT, or Gemini subscriptions via [ACP](https://goose-docs.ai/docs/guides/acp-providers). Connect to 70+ extensions via the [Model Context Protocol](https://modelcontextprotocol.io/) open standard.

goose is part of the [Agentic AI Foundation (AAIF)](https://aaif.io/) at the Linux Foundation.

# Get started

**[Download the desktop app](https://goose-docs.ai/docs/getting-started/installation)** for macOS, Linux, and Windows.

Or install the CLI:

```bash
curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash
```

# Quick links
- [Quickstart](https://goose-docs.ai/docs/quickstart)
- [Installation](https://goose-docs.ai/docs/getting-started/installation)
- [Tutorials](https://goose-docs.ai/docs/category/tutorials)
- [Documentation](https://goose-docs.ai/docs/category/getting-started)
- [Governance](https://github.com/aaif-goose/goose/blob/main/GOVERNANCE.md)
- [Custom Distributions](https://github.com/aaif-goose/goose/blob/main/CUSTOM_DISTROS.md) — build your own goose distro with preconfigured providers, extensions, and branding

## Need help?
- [Diagnostics & Reporting](https://goose-docs.ai/docs/troubleshooting/diagnostics-and-reporting)
- [Known Issues](https://goose-docs.ai/docs/troubleshooting/known-issues)

# a little goose humor 🪿

> Why did the developer choose goose as their AI agent?
> 
> Because it always helps them "migrate" their code to production! 🚀

# goose around with us
- [Discord](https://discord.gg/n8R5VaWDAn)
- [YouTube](https://www.youtube.com/@goose-oss)
- [LinkedIn](https://www.linkedin.com/company/goose-oss)
- [Twitter/X](https://x.com/goose_oss)
