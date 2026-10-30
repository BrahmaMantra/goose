# AGENTS Instructions

goose is an AI agent framework in Rust with CLI and Electron desktop interfaces.

## Contribution Workflow

The issue is the source of truth for work intended for an upstream pull request. Track issue status on the [Goose Issues board](https://github.com/orgs/aaif-goose/projects/1).

- Before implementing an issue for a pull request, confirm that it is on the board with Status **Ready**.
- Do not implement issues in **Inbox**, **Needs info**, or **Accepted / design**. Help resolve the issue discussion instead.
- Read the agreed design, constraints, non-goals, and verification plan before changing code.
- Keep the implementation within the issue's agreed scope.
- If implementation reveals a material design change, return to the issue before continuing.
- Every external pull request must link the Ready issue it implements and explain how the verification plan was performed.
- Structure new issues on the matching template in `.github/ISSUE_TEMPLATE/` and set the issue type (e.g. Bug, Feature). `gh issue create` does not apply templates automatically.

Maintainer-directed work, urgent security fixes, release automation, and local or exploratory changes do not require a Ready issue.

## MCP Server Directory

goose is retiring its project-specific MCP server directory in favor of the [official MCP Registry](https://github.com/modelcontextprotocol/registry) and its `server.json` format.

- Do not add new third-party servers to `documentation/static/servers.json`; these contributions are no longer accepted.
- Direct server authors to publish to the official MCP Registry instead.
- Treat the existing goose directory as legacy data while registry-backed discovery and installation are implemented.
- Changes that maintain, migrate, or remove existing directory entries are allowed when they support the migration and are within an approved issue's scope.

See [Discussion #10830](https://github.com/aaif-goose/goose/discussions/10830) for the decision and migration direction.

## GitHub Communication

Write issue and pull request comments for humans, not as exhaustive work logs.

- Lead with the conclusion or action needed.
- Keep comments concise; do not repeat context already present in the thread.
- Use short paragraphs or bullets, and include implementation details only when they affect a decision or review.
- Prefer one clear summary over multiple incremental comments.

## Setup
```bash
source bin/activate-hermit
cargo build
```

## Commands

### Build
```bash
cargo build                   # debug
cargo build --release         # release  
just release-binary           # release binary
```

### Test
```bash
export GOOSE_DISABLE_KEYRING=1  # avoid system keyring prompts
cargo test                   # all tests
cargo test -p goose          # specific crate
cargo test --package goose --test mcp_integration_test
just record-mcp-tests        # record MCP
```

### Lint/Format
```bash
cargo fmt
cargo clippy --all-targets -- -D warnings
```

### UI
```bash
just run-ui                  # start desktop
cd ui/desktop && pnpm run typecheck
cd ui/desktop && pnpm test   # test UI
```

## Structure
```
crates/       # Rust workspace members — see root Cargo.toml (`members = ["crates/*"]`)
ui/desktop/   # Electron app
ui/text/      # deprecated ACP TUI (see ui/text/README.md)
```

Some workspace crates, including those that make up the GDK, are published to crates.io and expose public APIs. The authoritative list of GDK crates is the `release = true`, `version_group = "gdk"` package set in `release-plz.toml`, which drives the GDK release; run `python3 crates/goose-sdk/scripts/gdk-release.py crates` to print it. Other crates, such as `goose` and `goose-cli`, do not provide stable public APIs; their `pub` items are internal implementation details and may change without notice.

## Development Loop
```bash
# 1. source bin/activate-hermit
# 2. Make changes
# 3. cargo fmt
```

### Run these only if the user has asked you to build/test your changes:
```
# 1. cargo build
# 2. GOOSE_DISABLE_KEYRING=1 cargo test -p <crate>
# 3. cargo clippy --all-targets -- -D warnings
```

## Rules

- Test: Prefer tests/ folder, e.g. crates/goose/tests/
- Test: When adding features, update goose-self-test.yaml, rebuild, then run `goose run --recipe goose-self-test.yaml` to validate
- Error: Use anyhow::Result
- Provider: Implement Provider trait see providers/base.rs
- MCP: Extensions in crates/goose-mcp/
- UI Desktop: Use ACP SDK types or local `src/types/*` types. Do not import generated OpenAPI types/client code from `ui/desktop/src/api`

## Code Quality

- Comments: Write self-documenting code - prefer clear names over comments
- Comments: Never add comments that restate what code does
- Comments: Only comment for complex algorithms, non-obvious business logic, or "why" not "what"
- Simplicity: Don't make things optional that don't need to be - the compiler will enforce
- Simplicity: Booleans should default to false, not be optional
- Errors: Don't add error context that doesn't add useful information (e.g., `.context("Failed to X")` when error already says it failed)
- Simplicity: Avoid overly defensive code - trust Rust's type system
- Logging: Clean up existing logs, don't add more unless for errors or security events

## Never

- Never: Recreate `ui/desktop/src/api` or add `@hey-api/openapi-ts` to `ui/desktop`
- Cargo.toml: For human-authored dependency changes, use `cargo add` instead of manually editing dependency entries unless there is a specific reason not to.
- Cargo.toml: Automated dependency bump PRs are exempt; when manual edits are necessary, keep `Cargo.lock` consistent.
- Never: Skip cargo fmt
- Never: Merge without running clippy
- Never: Comment self-evident operations (`// Initialize`, `// Return result`), getters/setters, constructors, or standard Rust idioms
- Never: Overwrite a live binary in place (e.g. `cp`/`fs.copyFileSync` onto an existing executable) - unlink or atomic-rename the destination first, otherwise macOS SIGKILLs running processes with "Code Signature Invalid"

## Entry Points
- CLI: crates/goose-cli/src/main.rs
- UI: ui/desktop/src/main.ts
- Agent: crates/goose/src/agents/agent.rs

## BM_ Fork Conventions

- This project's final goal is to learn Goose internals progressively through real applications. Start with application integration, trace the actual source and execution path, then pursue bounded, validated core experiments when appropriate. Follow [the architecture and learning roadmap](BM_custom/BM_docs/BM_architecture_and_goose_learning.md); source paths in older guidance may have changed.
- Keep platform business rules in application modules. Core experiments should address reusable mechanisms with a concrete question and verification plan; learning internals is an explicit project goal, not a reason to keep all future work permanently outside the core.
- Make custom changes on a dedicated `BM_` branch and open a pull request against this fork's `main`. Commit and push only the feature branch; do not commit or push directly to `main`, and do not merge the PR without user authorization. This also applies to documentation changes.
- Synchronize this fork with upstream using merge, never rebase.
- Prefix all newly added custom directories, files, functions, types, variables, constants, and other owned identifiers with `BM_`. Keep additions under `BM_custom/` where practical.
- Preserve existing upstream filenames and required names from external protocols, CLI options, environment variables, framework entrypoints, and imported APIs. Do not rename these just to add the prefix.
- Prefer scripts, configuration, Skills/Recipes, and MCP extensions with small changes to upstream code. Keep local model selection and lifecycle controls in independent scripts.
- Douyin custom documentation starts at `BM_custom/BM_douyin/BM_README.md`. Enable official platform tools only after verifying the application's approved capabilities.
- This fork is public. Keep personal account details, onboarding status, device/model configuration, absolute local paths, credentials, browser profiles, QR codes, screenshots, downloads, tool output, logs and session data outside the repository. Public files, commit messages, PR titles/descriptions/comments and test evidence must contain generic examples only.
- Store local configuration and browser artifacts in a private directory outside the checkout with restrictive filesystem permissions. Never force-add ignored private files. Review staged changes for privacy before committing, and review PR text before publishing.
- `.gitignore` does not protect already tracked files or published history. If private data was published, report the exposure and prepare a cleanup; obtain authorization before rewriting or force-pushing shared history.
