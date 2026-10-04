# AnyAgents

Keep Claude Code and Codex instructions, skills, and MCP server configuration in sync from one set of files in your repository.

Write shared content in `.ai/`. AnyAgents links instructions and skills into each client's expected location and generates the corresponding MCP configuration.

## Requirements

- Node.js 20 or later.
- Claude Code, Codex, or both.
- On Windows, symlink privileges, normally enabled through Developer Mode.

## Quick start

Inside the repository you want to configure:

```sh
npx anyagents init
npx anyagents check
```

`init` creates the shared sources and project configuration, then applies them to Claude Code and Codex:

```text
.ai/
├── AGENTS.md
├── skills/example/SKILL.md
└── mcp.toml
omniagents.toml
```

Add your project's instructions to `.ai/AGENTS.md`. For example, in a pnpm project:

```md
## Project conventions

Use pnpm for package scripts.
Run `pnpm test` before proposing a change.
```

After editing shared content, synchronize and verify it:

```sh
npx anyagents apply
npx anyagents check
```

Edit `.ai/AGENTS.md` for instructions, `.ai/skills/` for skills, and `.ai/mcp.toml` for MCP servers. Review and commit the shared sources, project configuration, and native files using your normal Git workflow. AnyAgents does not create Git commits; local ownership state is ignored.

If your repository already has instructions, skills, or MCP configuration, AnyAgents refuses conflicting unmanaged files. See [ownership and conflicts](docs/reference.md#ownership-and-git-behavior) before initializing an existing setup. `--force` does not bypass unmanaged-output protection.

The configuration filename `omniagents.toml` is retained for compatibility. See [installation alternatives](docs/installing.md) for tarballs and source builds.

## What each client receives

| Shared source | Claude Code | Codex |
| --- | --- | --- |
| `.ai/AGENTS.md` | `CLAUDE.md` symlink | `AGENTS.md` symlink |
| `.ai/skills/` | `.claude/skills` directory symlink | `.agents/skills` directory symlink |
| `.ai/mcp.toml` | Generated `.mcp.json` | Managed entries in `.codex/config.toml` |

Edit the shared sources rather than the linked or generated destinations. New skills appear through the directory links immediately. Your coding client may require project trust or MCP approval before using the configuration.

## Everyday commands

Run commands with `npx anyagents <command>`.

| Command | Purpose |
| --- | --- |
| `init` | Create shared sources and apply enabled targets |
| `apply --dry-run` | Preview synchronization changes |
| `apply` | Synchronize native files |
| `check` | Validate without changing files; exits with 1 on errors or drift |
| `status` | Show a quick project summary |
| `doctor` | Diagnose configuration and filesystem problems |

Use `npx anyagents --help` for options, or the bundled authoring guides:

```sh
npx anyagents explain authoring
npx anyagents explain skills
npx anyagents explain mcp
```

See the [CLI and project reference](docs/reference.md) for schemas, templates, target selection, JSON output, ownership rules, and MCP examples. Use `check` in CI to catch invalid configuration or drift.

## Safety and scope

AnyAgents runs locally. It does not execute MCP servers, resolve secrets, change global configuration, or run a background service. It has no telemetry. Review MCP commands and URLs before using them in your coding client, and use environment placeholders for credentials.

Existing unrelated Codex settings and MCP entries are preserved. Native symlinks require filesystem support; unavailable privileges produce an actionable error. Live Claude Code and Codex sessions are not part of automated tests.

## Development

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:pack
```

Biome checks lint and formatting. Vitest covers validation, native transforms, ownership, rollback, and the bundled CLI. CI tests Node.js 20 and 22 on Linux, macOS, and Windows, including installation of the packed package.

Feature PRs target `dev` and use Conventional Commit titles. See [release workflow](docs/releasing.md) and [secure npm publishing](docs/npm-publishing.md) for branch and publishing rules.

MIT © 2026 Viktor Gerbert.
