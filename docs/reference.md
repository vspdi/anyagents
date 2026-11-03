# CLI and project reference

Use the [quick start](../README.md#quick-start) for initial setup.

## Project configuration

By default, shared instructions, skills, and MCP definitions live in `.ai/`. The project configuration is `anyagents.yaml`, and local ownership state is `.anyagents/state.json`.

Use `--source .company-ai` or `source.dir` in the project configuration to choose another source directory. CLI options override configuration; configuration overrides defaults.

## Commands

| Command | Purpose |
| --- | --- |
| `init [--no-apply] [--force]` | Scaffold sources, then apply enabled targets |
| `apply [--dry-run] [--force]` | Plan and safely synchronize native assets |
| `status` | Fast informational summary; use check for definitive validation |
| `check [--strict]` | Read-only validation; strict also fails on warnings |
| `doctor [--probe]` | Troubleshooting; optional temporary symlink probe |
| `explain [topic]` | Bundled authoring docs with examples and mistakes; defaults to `concepts` |
| `schema <config\|mcp\|skill\|marketplace\|plugin\|all>` | Emit JSON Schema draft 2020-12 |
| `template <skill\|mcp-stdio\|mcp-http\|config\|marketplace\|plugin\|authoring-skill>` | Print a canonical template |
| `describe` | Product and resolved project metadata |

Project commands support `--cwd`, `--config`, `--source`, and repeated/comma-separated `--target claude,codex,opencode,copilot` or `--target all`. Structured commands support `--json`; `--quiet` suppresses human output. Output contains no ANSI coloring; `--no-color` is accepted for compatibility and has no effect. Exit codes are 0 success, 1 failure/drift, and 2 usage error.

Errors print a stable code, a message and, where known, the path; with `--json` they are a JSON object on stderr. Source values are never included. For an unexpected failure (`APPLY_FAILED` with a generic message), rerun with `--verbose` to print the underlying cause.

| Code | Meaning |
| --- | --- |
| `USAGE_ERROR` | Unknown command, topic, or target, or the project root is not a directory (exit 2) |
| `CONFIG_NOT_FOUND` | An explicit `--config` file does not exist |
| `CONFIG_INVALID` | Invalid configuration, ownership state, path, or native Codex TOML |
| `SOURCE_NOT_FOUND` | A canonical source or referenced plugin asset is missing |
| `SKILL_INVALID` | A skill directory or its frontmatter is invalid |
| `CANONICAL_MCP_INVALID` | Invalid MCP definitions, or a mapping the selected target cannot express |
| `MARKETPLACE_INVALID` | Invalid marketplace, plugin, hook, or bundle layout |
| `DESTINATION_CONFLICT` | An unmanaged or edited file occupies a destination |
| `OUTPUT_DRIFT` | Native output differs from canonical sources |
| `LINK_UNSUPPORTED` | Symlinks cannot be created; enable symlink privileges |
| `APPLY_FAILED` | Locking, writing, or rollback failed |

Explain topics: `concepts`, `config`, `skills`, `mcp`, `authoring`, `ownership`, `marketplaces`, `plugins`, `ci`, `target claude`, `target codex`, `target opencode`, and `target copilot`. Templates, schemas, and explanations are bundled with the CLI and work outside a configured project.

## Ownership and Git behavior

AnyAgents creates native symlinks and generated files for you to review and commit. It does not create Git commits. Commit these files with the shared sources so clients can discover them after clone. `.anyagents/state.json` is Git-ignored through a marked `.gitignore` block. Project instructions and skills use symlinks; marketplace bundles copy their assets. Native outputs are committed.

AnyAgents refuses unmanaged destination conflicts, including with `apply --force`. Move conflicting files yourself. Force can repair drifted managed generated files/entries; a replaced instruction link that became an ordinary file remains protected. `init --force` rewrites the scaffold: `anyagents.yaml` (comments and unknown fields are dropped), `.ai/AGENTS.md`, `.ai/mcp.yaml` (reset to no servers), `.ai/skills/example/`, and `.ai/skills/anyagents-authoring/`. Use it deliberately; back up instructions and MCP definitions first.

Codex settings, unmanaged MCP server entries, comments, and formatting are preserved: only the lines of managed `mcp_servers` entries change, and edited entries are written as `[mcp_servers.<name>]` tables. Entries written as inline tables or dotted keys are converted to tables when they change; a `mcp_servers = { … }` inline table is converted as a whole. Every edit is re-parsed and verified. If verification ever fails, AnyAgents rewrites the file in full and prints a warning that comments were not kept. Unrelated Codex edits do not cause drift. Canonical sources and output parent paths cannot traverse symlinks.

`opencode.json` is shared the same way: only managed entries of its `mcp` object change, comments and unrelated settings are preserved, and edits are made with a JSONC-aware editor. If only `opencode.jsonc` exists it is edited instead. When `opencode.schema` changes, previously managed entries move to the new layout; entries you wrote are never moved or removed.

Targets that write the same destination (`AGENTS.md`, `.agents/skills`, and the Claude/Copilot `.mcp.json`) must agree on its content and are planned once. A path recorded by any target counts as managed, so enabling Copilot after Claude adopts the existing `.mcp.json` without a conflict, while an unmanaged file at a shared destination is still refused.

After clone, correct links and exact generated output can be adopted without prior state. Removing a target leaves existing native output untouched. Removing a canonical server removes only its previously managed native entries. Apply preflights all selected targets, serializes with a lock, writes files atomically, rolls back caught failures, and writes state last. Power loss is not a transaction across all files.

## MCP authoring and security

```yaml
version: 1
mcp:
  playwright:
    transport: stdio
    command: npx
    args: ["-y", "@playwright/mcp@latest"]
  docs:
    transport: http
    url: https://example.invalid/mcp
    headers:
      Authorization: Bearer ${DOCS_TOKEN}
```

MCP commands execute in your coding client and remote servers receive their configured credentials. Review server commands/URLs before use. Prefer environment placeholders to plaintext credentials. AnyAgents never expands placeholders or stores credentials in ownership state or diagnostics.

Codex uses `bearer_token_env_var` for bearer placeholders and `env_http_headers` for whole-header placeholders; static headers use `http_headers`. Same-name STDIO env references become Codex `env_vars`. Codex cannot expand arbitrary embedded placeholders or URL/command/args/cwd placeholders. Unsupported mappings fail before applying. Canonical `cwd` is Codex-only because Claude project MCP has no documented equivalent.

OpenCode maps `stdio` to `type: local` (`command` and `args` become one `command` array, `env` becomes `environment`, `cwd` is kept) and `http` to `type: remote`. It converts `${NAME}` to `{env:NAME}` and rejects `${NAME:-default}`. OpenCode 2 reads servers from `mcp.servers`, OpenCode 1 from `mcp`; `opencode.schema` selects the layout (default `v2`). Copilot reads the same `.mcp.json` as Claude Code; it has no `cwd` and does not expand URL placeholders, so both fail before applying.

Native mappings verified against [Claude MCP docs](https://code.claude.com/docs/en/mcp) and [Codex MCP docs](https://developers.openai.com/codex/mcp) on October 4, 2026, and against the OpenCode ([v2 MCP](https://opencode.ai/v2/docs/mcp-servers/), [v1 MCP](https://opencode.ai/docs/mcp-servers/)) and GitHub Copilot ([CLI MCP](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers), [plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)) documentation on November 3, 2026. Unit/integration fixtures verify generated fields; live client sessions are not part of automated tests.

## Platform limits

CI tests the packaged CLI on Linux, macOS, and Windows with Node.js 22 and 24. Windows requires file symlink privileges, normally enabled through Developer Mode. If links are unavailable, the CLI reports `LINK_UNSUPPORTED` with remediation; it does not switch to copies.

The supported clients are Claude Code, Codex, OpenCode, and GitHub Copilot CLI, using repository-level instructions, skills, STDIO/HTTP MCP, and local-source marketplace authoring. OpenCode and Copilot support has not been exercised in live client sessions; see the smoke-test steps in [validation](validation.md). Global sync, other clients, nested inheritance, skill downloads, watch mode, and uninstall are outside the current scope.
