# CLI and project reference

Use the [quick start](../README.md#quick-start) for initial setup.

## Project configuration

By default, shared instructions, skills, and MCP definitions live in `.ai/`. The project configuration is `omniagents.toml`, and local ownership state is `.omniagents/state.json`. These paths retain their original names for compatibility with existing projects.

Use `--source .company-ai` or `[source] dir` in the project configuration to choose another source directory. CLI options override configuration; configuration overrides defaults.

## Commands

| Command | Purpose |
| --- | --- |
| `init [--no-apply]` | Scaffold sources, then apply enabled targets |
| `apply [--dry-run] [--force]` | Plan and safely synchronize native assets |
| `status` | Fast informational summary; use check for definitive validation |
| `check` | Strict read-only validation; exit 1 on invalidity or drift |
| `doctor [--probe]` | Troubleshooting; optional temporary symlink probe |
| `explain <topic>` | Bundled authoring docs with examples and mistakes |
| `schema <config\|mcp\|skill\|all>` | Emit JSON Schema draft 2020-12 |
| `template <skill\|mcp-stdio\|mcp-http\|config>` | Print a canonical template |
| `describe --json` | Product and resolved project metadata |

Project commands support `--cwd`, `--config`, `--source`, and repeated/comma-separated `--target claude,codex` or `--target all`. Structured commands support `--json`; `--quiet` suppresses human output. Output contains no ANSI coloring. Exit codes are 0 success, 1 failure/drift, and 2 usage error. JSON errors include stable codes and paths without source values.

Explain topics: `concepts`, `config`, `skills`, `mcp`, `authoring`, `ownership`, `target claude`, and `target codex`. Templates, schemas, and explanations are bundled with the CLI and work outside a configured project.

## Ownership and Git behavior

AnyAgents creates native symlinks and generated files for you to review and commit. It does not create Git commits. Commit these files with the shared sources so clients can discover them after clone. `.omniagents/state.json` is ignored through a marked `.gitignore` block. Copy mode and automatic ignoring of native assets are not supported in v0.1.

AnyAgents refuses unmanaged destination conflicts, including with `apply --force`. Move conflicting files yourself. Force can repair drifted managed generated files/entries; a replaced instruction link that became an ordinary file remains protected. `init --force` explicitly replaces authored scaffold files and should be used deliberately.

Codex settings and unmanaged MCP server entries are preserved. TOML comments and formatting may change when managed entries change. Unrelated Codex edits do not cause drift. Canonical sources and output parent paths cannot traverse symlinks.

After clone, correct links and exact generated output can be adopted without prior state. Removing a target leaves existing native output untouched. Removing a canonical server removes only its previously managed native entries. Apply preflights all selected targets, serializes with a lock, writes files atomically, rolls back caught failures, and writes state last. Power loss is not a transaction across all files.

## MCP authoring and security

```toml
version = 1

[mcp.playwright]
transport = "stdio"
command = "npx"
args = ["-y", "@playwright/mcp@latest"]

[mcp.docs]
transport = "http"
url = "https://example.invalid/mcp"
headers = { Authorization = "Bearer ${DOCS_TOKEN}" }
```

MCP commands execute in your coding client and remote servers receive their configured credentials. Review server commands/URLs before use. Prefer environment placeholders to plaintext credentials. AnyAgents never expands placeholders or stores credentials in ownership state or diagnostics.

Codex uses `bearer_token_env_var` for bearer placeholders and `env_http_headers` for whole-header placeholders; static headers use `http_headers`. Same-name STDIO env references become Codex `env_vars`. Codex cannot expand arbitrary embedded placeholders or URL/command/args/cwd placeholders. Unsupported mappings fail before applying. Canonical `cwd` is Codex-only because Claude project MCP has no documented equivalent.

Native mappings verified against [Claude MCP docs](https://code.claude.com/docs/en/mcp) and [Codex MCP docs](https://developers.openai.com/codex/mcp) on October 4, 2026. Unit/integration fixtures verify generated fields; live client sessions are not part of automated tests.

## Platform limits

CI tests the packaged CLI on Linux, macOS, and Windows with Node.js 20 and 22. Windows requires file symlink privileges, normally enabled through Developer Mode. If links are unavailable, the CLI reports `LINK_UNSUPPORTED` with remediation; it does not switch to copies.

The supported clients are Claude Code and Codex, using repository-level instructions, skills, and STDIO/HTTP MCP. Global sync, other clients, nested inheritance, skill downloads, watch mode, and uninstall are outside the current scope.
