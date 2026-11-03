# AnyAgents

Keep Claude Code, Codex, OpenCode, and GitHub Copilot instructions, skills, and MCP server configuration in sync from one set of files in your repository.

Write shared content in `.ai/`. AnyAgents links instructions and skills into each client's expected location and generates the corresponding MCP configuration.

## Requirements

- Node.js 22.12 or later.
- One or more of Claude Code, Codex, OpenCode, and GitHub Copilot CLI.
- On Windows, symlink privileges, normally enabled through Developer Mode.

## Quick start

Inside the repository you want to configure:

```sh
npx anyagents init
npx anyagents check
```

`npx anyagents` downloads the latest release. To pin a version for your team and CI, add `anyagents` as an exact-version dev dependency; `npx anyagents` then runs the installed version.

`init` creates the shared sources and project configuration, then applies them to the enabled targets (Claude Code and Codex by default; add `--target all` or `--target opencode,copilot` for the others):

```text
.ai/
├── AGENTS.md
├── skills/example/SKILL.md
├── skills/anyagents-authoring/
│   ├── SKILL.md
│   └── references/{definitions,ci}.md
└── mcp.yaml
anyagents.yaml
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

Edit `.ai/AGENTS.md` for instructions, `.ai/skills/` for skills, and `.ai/mcp.yaml` for MCP servers. Review and commit the shared sources, project configuration, and native files using your normal Git workflow. AnyAgents does not create Git commits; local ownership state (`.anyagents/`) is Git-ignored.

If your repository already has instructions, skills, or MCP configuration, AnyAgents refuses conflicting unmanaged files. See [ownership and conflicts](docs/reference.md#ownership-and-git-behavior) before initializing an existing setup. `--force` does not bypass unmanaged-output protection.

See [installation alternatives](docs/installing.md) for tarballs and source builds.

## What each client receives

| Shared source | Claude Code | Codex | OpenCode | GitHub Copilot |
| --- | --- | --- | --- | --- |
| `.ai/AGENTS.md` | `CLAUDE.md` symlink | `AGENTS.md` symlink | `AGENTS.md` symlink | `AGENTS.md` symlink |
| `.ai/skills/` | `.claude/skills` directory symlink | `.agents/skills` directory symlink | `.agents/skills` directory symlink | `.agents/skills` directory symlink |
| `.ai/mcp.yaml` | Generated `.mcp.json` | Managed entries in `.codex/config.toml` | Managed entries in `opencode.json` | Generated `.mcp.json` |

Targets can share a destination: Codex, OpenCode, and Copilot all use `AGENTS.md` and `.agents/skills`, and Claude Code and Copilot write the same `.mcp.json`. Each shared file is planned once.

`targets.claude` and `targets.codex` default to on; `targets.opencode` and `targets.copilot` default to off, so upgrading never writes new files.

Edit the shared sources rather than the linked or generated destinations. New skills appear through the directory links immediately. Your coding client may require project trust or MCP approval before using the configuration; Copilot CLI loads project `.mcp.json` only after folder trust.

### OpenCode

OpenCode 2 nests MCP servers under `mcp.servers` in `opencode.json`; OpenCode 1 puts them directly under `mcp`. Set `opencode.schema` to `v2` (default) or `v1` in `anyagents.yaml` to match your OpenCode. AnyAgents edits only its managed servers: your other settings and comments in `opencode.json` (or an existing `opencode.jsonc`) stay. `${NAME}` placeholders become `{env:NAME}`; defaults such as `${NAME:-value}` cannot be expressed and fail. OpenCode starts its own OAuth flow for remote servers that answer 401, which AnyAgents does not disable.

### GitHub Copilot

Instructions are verified for Copilot CLI, which reads `AGENTS.md`; VS Code and GitHub.com instruction files are not covered. Project `.mcp.json` has no `cwd`, and Copilot does not expand placeholders in URLs, so those fail rather than produce broken output.

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

See the [CLI and project reference](docs/reference.md) for schemas, templates, target selection, JSON output, ownership rules, and MCP examples. Use `check --strict` in CI to catch invalid configuration or drift.

## Plugins, marketplaces, and CI

Configure one or more `marketplaces` entries in `anyagents.yaml`, each with a canonical YAML `source` and native `output` root. Set `project: false` for marketplace-only repositories. Each catalog references plugin directories with `plugin.yaml`, optional plugin-scoped `mcp.yaml`, and skills/assets. Local project MCP stays separate.

| Target | Marketplace output |
| --- | --- |
| Claude Code | `.claude-plugin/marketplace.json` and bundles in `plugins/claude/<id>/` |
| Codex | `.agents/plugins/marketplace.json` and bundles in `plugins/codex/<id>/` |
| GitHub Copilot | `.github/plugin/marketplace.json` and Agent Plugins 1.0 bundles in `plugins/copilot/<id>/` |
| OpenCode | No catalog. Each plugin becomes an npm package in `plugins/opencode/<id>/` (`package.json`, a fixed `index.js` loader for OpenCode 1 and 2, skills, generated MCP data) |

AnyAgents only generates files. Publishing the OpenCode package to npm (or installing it from Git with `opencode plugin add`), registering marketplaces, and installing plugins are up to you. Copilot and OpenCode packages carry skills, assets, scripts, and MCP; `hooks/`, `agents/`, and `commands/` are not packaged for them and produce a warning. The OpenCode loader reads environment variables at startup to fill `{env:NAME}` placeholders in memory and never writes them to disk. Set `detail.opencode.packageName` in `plugin.yaml` for a scoped npm name.

```sh
npx anyagents explain marketplaces
npx anyagents explain plugins
npx anyagents explain ci
npx anyagents check --strict
```

`init` installs the bundled authoring skill with definition and CI recipes. See [canonical definitions](skills/anyagents-authoring/references/definitions.md), [GitHub Actions and GitLab CI](skills/anyagents-authoring/references/ci.md), and [migration](docs/migration.md). Checks work on fresh checkouts without local ownership state; CI never needs to apply first.

## Safety and scope

AnyAgents runs locally. It does not execute MCP servers, resolve secrets, change global configuration, or run a background service. It has no telemetry. Review MCP commands and URLs before using them in your coding client, and use environment placeholders for credentials.

Existing unrelated Codex settings and MCP entries are preserved. Native symlinks require filesystem support; unavailable privileges produce an actionable error. Live Claude Code, Codex, OpenCode, and GitHub Copilot sessions are not part of automated tests; OpenCode and Copilot output is verified against their documentation and fixtures only.

## Development

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:pack
pnpm test:coverage   # optional coverage report
```

Biome checks lint and formatting. Vitest covers validation, native transforms, ownership, rollback, and the bundled CLI. CI tests Node.js 22 and 24 on Linux, macOS, and Windows, including installation of the packed package.

Feature PRs target `dev` and use Conventional Commit titles. See [release workflow](docs/releasing.md) and [secure npm publishing](docs/npm-publishing.md) for branch and publishing rules.

MIT © 2026 Viktor Gerbert.
