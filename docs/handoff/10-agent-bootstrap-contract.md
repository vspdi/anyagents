# Agent bootstrap contract

This file defines how OmniAgents teaches Claude or Codex to author canonical assets.

## Required generated/scaffolded instruction block

`omniagents init` inserts this into the canonical `<source>/AGENTS.md`:

```markdown
## OmniAgents

This repository uses OmniAgents to share instructions, skills, and MCP configuration across coding agents.

Canonical sources:

- `<source>/AGENTS.md`
- `<source>/skills/<name>/SKILL.md`
- `<source>/mcp.toml`
- `omniagents.toml`

Author canonical sources only. Do not edit linked or generated target files directly.

Before authoring an unfamiliar asset, use the CLI as the documentation API:

- `npx omniagents explain authoring`
- `npx omniagents explain skills`
- `npx omniagents explain mcp`
- `npx omniagents schema config`
- `npx omniagents schema mcp`
- `npx omniagents schema skill`
- `npx omniagents template skill`
- `npx omniagents template mcp-stdio`

After canonical changes:

1. Run `npx omniagents apply --target <current-target>` when the current target is known, otherwise run `npx omniagents apply`.
2. Run `npx omniagents check`.
3. Report the changed canonical files and verification output.
```

Replace `<source>` with the configured path during initialization.

## Documentation API requirements

The implementation agent must treat CLI explanations, schemas, and templates as stable public interfaces, not decorative help.

For every custom file OmniAgents asks users to author:

```text
There must be:
- a runtime validator;
- an emitted JSON Schema or explicit structural schema;
- an explain topic;
- a minimal template;
- a valid example in tests;
- an invalid example in tests.
```

## Agent workflow examples

### Create a skill

```text
User: Add a release preparation skill.
Agent:
1. runs `npx omniagents explain skills`;
2. optionally runs `npx omniagents template skill`;
3. creates `<source>/skills/release-preparation/SKILL.md`;
4. runs `npx omniagents apply --target <current-target>`;
5. runs `npx omniagents check`.
```

### Add an MCP server

```text
User: Add the project documentation MCP server.
Agent:
1. runs `npx omniagents explain mcp`;
2. runs `npx omniagents schema mcp` if exact fields are needed;
3. edits `<source>/mcp.toml` without inserting secret values;
4. runs `npx omniagents apply --target <current-target>`;
5. runs `npx omniagents check`.
```

## Help discoverability

Normal help must point to specialized documentation:

```text
Need authoring details?
  omniagents explain authoring
  omniagents explain skills
  omniagents explain mcp
  omniagents schema <config|mcp|skill>
  omniagents template <skill|mcp-stdio|mcp-http|config>
```

Every subcommand supports `--help`. Error messages involving canonical files should mention the exact relevant explain/schema command.
