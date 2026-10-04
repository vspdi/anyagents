# CLI contract

## Package and executable

```json
{
  "name": "omniagents",
  "bin": {
    "omniagents": "./dist/cli.js"
  }
}
```

Primary usage:

```bash
npx omniagents <command>
```

Do not add a second short executable in v0.1. It creates avoidable namespace and documentation ambiguity.

## Global options

```text
--cwd <path>        project root, default process.cwd()
--config <path>     explicit config path
--source <path>     override canonical source directory
--target <target>   claude, codex, or all
--json              machine-readable output
--quiet             suppress non-error human output
--no-color          disable ANSI colors
-V, --version
-h, --help
```

Only commands where an option is meaningful need to expose it. `--json` should be broadly consistent.

## Commands

### `init`

```bash
omniagents init
omniagents init --source .company-ai
omniagents init --target claude
```

Creates canonical scaffolding and configuration. Refuse to overwrite existing authored files unless `--force` is passed. Then call `apply` for enabled targets unless `--no-apply` is passed.

Initial files:

```text
omniagents.toml
<source>/AGENTS.md
<source>/mcp.toml
<source>/skills/example/SKILL.md
```

The initial `AGENTS.md` must explain the canonical authoring contract and tell agents to run `omniagents explain <topic>` before authoring unfamiliar canonical assets.

### `apply`

```bash
omniagents apply
omniagents apply --target claude
omniagents apply --target codex
omniagents apply --target all
omniagents apply --force
omniagents apply --dry-run
```

Behavior:

1. Resolve project and config.
2. Validate canonical inputs.
3. Build target operation plans.
4. Detect unmanaged conflicts before making changes.
5. If `--dry-run`, print the plan and exit without mutation.
6. Execute operations atomically where feasible.
7. Write managed state only after all selected targets succeed.

`--force` may replace drifted OmniAgents-managed outputs, but must not replace arbitrary unmanaged content without an explicit, clearly reported policy. The safest v0.1 policy is to refuse any unmanaged destination even with `--force` and require the user to move/remove it.

### `status`

Fast, read-only summary. Do not fully validate every schema if not necessary.

```text
Source      .ai                  ok
Claude      instructions        linked
Claude      skills              linked
Claude      MCP                 current
Codex       instructions        linked
Codex       skills              linked
Codex       MCP                 current
```

Exit `0` even when drift exists; status is informational. Return non-zero only for operational failure such as unreadable config.

### `check`

Strict, read-only CI command.

- validate canonical config, MCP, and every skill;
- verify expected symlinks;
- regenerate expected MCP content in memory and compare;
- verify ownership state;
- exit `1` on invalidity or drift;
- never mutate.

### `doctor`

Deep troubleshooting. Include Node version, platform, config resolution, writable parent directories, source validation, target inspection, link capability, and suggested fixes. Do not create test links unless explicitly run with `--probe`; default must remain read-only.

### `explain`

```bash
omniagents explain
omniagents explain concepts
omniagents explain config
omniagents explain skills
omniagents explain mcp
omniagents explain target claude
omniagents explain target codex
omniagents explain authoring
omniagents explain ownership
```

The text must be bundled with the package and versioned with the implementation. Each topic should include:

- purpose;
- canonical path;
- supported fields or structure;
- complete minimal example;
- native outputs;
- validation/apply commands;
- common mistakes.

Support `--json`:

```json
{
  "topic": "mcp",
  "summary": "...",
  "canonicalPath": ".ai/mcp.toml",
  "examples": [...],
  "commands": [...]
}
```

### `schema`

```bash
omniagents schema config
omniagents schema mcp
omniagents schema skill
omniagents schema all
```

JSON Schema is already JSON. `--json` is unnecessary here. Output exactly one schema for a named topic. For `all`, emit an object keyed by topic.

Schemas must be generated from or tested against the same runtime definitions to prevent drift. Exact automatic conversion from Zod is optional; checked-in/bundled schema constants plus conformance tests are acceptable and simpler.

### `template`

```bash
omniagents template skill
omniagents template mcp-stdio
omniagents template mcp-http
omniagents template config
```

Print templates to stdout. No filesystem mutation. This lets agents redirect output intentionally.

### `describe`

Machine-readable product and project description:

```bash
omniagents describe
omniagents describe --json
```

JSON form should include version, resolved source, enabled targets, canonical paths, target outputs, available explain/schema/template topics, and ownership policy.

## Exit codes

```text
0 success/current
1 invalid configuration, drift, conflict, or command failure
2 CLI usage error
```

Do not invent a large exit-code taxonomy in v0.1. Error codes in JSON provide detail.
