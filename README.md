# AnyAgents

Maintain repository instructions, Agent Skills, and MCP definitions once, then expose them through Claude Code and Codex native discovery files.

```text
.ai/
├── AGENTS.md
├── skills/example/SKILL.md
└── mcp.toml
omniagents.toml
```

AnyAgents is a local TypeScript CLI. No telemetry, cloud service, background process, global config mutation, or secret resolution.

## Quick start

The package is published as [`anyagents`](https://www.npmjs.com/package/anyagents). In the repository you want to configure:

```sh
npx anyagents init
npx anyagents apply
npx anyagents check
```

Alternatively, download an installable `.tgz` from a GitHub release, or build it locally:

```sh
pnpm install --frozen-lockfile
pnpm build
npm pack --ignore-scripts
```

Release tarballs use `anyagents-VERSION.tgz`. The renamed executable starts with version 0.1.1. The historical `anyagents-0.1.0.tgz` uses the executable `agentbridge`; substitute that binary name when installing the old tarball explicitly.

In the repository you want to configure:

```sh
npx --yes --package=/absolute/path/to/anyagents-VERSION.tgz anyagents init
npx --yes --package=/absolute/path/to/anyagents-VERSION.tgz anyagents apply
npx --yes --package=/absolute/path/to/anyagents-VERSION.tgz anyagents check
```

Use `npx anyagents <command>`. The executable is `anyagents`.

Edit canonical sources only. Run `apply` after changes and `check` in CI. Use `--source .company-ai` or `[source] dir` to choose a different source directory. CLI overrides config; config overrides defaults.

For compatibility with v0.1.0 projects, the configuration filename remains `omniagents.toml` and local ownership state remains in `.omniagents/`.

## Native destinations

| Canonical source | Claude Code | Codex |
| --- | --- | --- |
| `.ai/AGENTS.md` | `CLAUDE.md` relative symlink | `AGENTS.md` relative symlink |
| `.ai/skills/` | `.claude/skills` directory symlink | `.agents/skills` directory symlink |
| `.ai/mcp.toml` | Generated `.mcp.json` | Managed entries merged into `.codex/config.toml` |

New skills are visible through the directory links immediately. Codex may require project trust before loading project MCP configuration. Claude may prompt for approval of project MCP servers. AnyAgents does not change those client security settings.

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

Native symlinks and generated output are committed by default for immediate client discovery after clone. `.omniagents/state.json` is ignored through a marked `.gitignore` block. Copy mode and automatic ignoring of native assets are not supported in v0.1.

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

## Compatibility

| Runtime/platform | Support |
| --- | --- |
| Node.js 20+ | Runtime requirement; CI tests 20 and 22 |
| Linux/macOS | Relative file and directory symlinks |
| Windows | Requires file symlink privileges, normally Developer Mode |
| Claude Code / Codex | Repository-level instructions, portable skills, STDIO/HTTP MCP |

If links are unavailable, the CLI reports `LINK_UNSUPPORTED` with remediation. It does not silently switch to copies. Global sync, other clients, nested inheritance, skill downloads, watch mode, and uninstall are out of scope.

## Development

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:pack
npm pack --dry-run --ignore-scripts
```

Biome checks lint/formatting. Vitest covers canonical validation, native transforms, ownership, rollback, and a bundled CLI smoke test in a temporary Git repository. The packed-install smoke test exercises an installed package independently of repository sources. CI runs Linux/macOS/Windows on Node 20/22.

Feature PRs target `dev` and squash. Release promotions merge `dev` into `main`; synchronization merges `main` back into `dev`. Keep Conventional Commit PR titles unchanged in merge dialogs.

See [decisions](docs/decisions.md), the [original handoff](docs/handoff/00-README.md), and [release setup](docs/releasing.md).

MIT © 2026 Viktor Gerbert.

Secure npm setup and owner actions are documented in [docs/npm-publishing.md](docs/npm-publishing.md).
