# Product contract

## Goals

OmniAgents solves one narrow problem: repository owners should not maintain duplicate Claude and Codex instructions, skill directories, and MCP definitions.

Canonical model:

```text
Human or coding agent
        |
        v
      .ai/
   instructions
   skills
   MCP definitions
        |
        v
   omniagents apply
        |
        +--> Claude native assets
        +--> Codex native assets
```

## Canonical assets

Default layout:

```text
.ai/
├── AGENTS.md
├── skills/
│   └── example/
│       └── SKILL.md
└── mcp.toml

omniagents.toml
```

The source directory must be configurable with both:

```toml
[source]
dir = ".ai"
```

and a CLI override:

```bash
omniagents apply --source .company-ai
```

Precedence:

```text
CLI option > omniagents.toml > default .ai
```

## Supported targets

v0.1 targets:

- `claude`
- `codex`
- `all`

Target selection precedence:

```text
--target > enabled targets in config > all v0.1 targets
```

Allow repeated targets and comma-separated values if easy, but normalize internally to a set.

## Authoring rule

Humans and agents author only canonical assets:

```text
<source>/AGENTS.md
<source>/skills/**
<source>/mcp.toml
omniagents.toml
```

Native destinations are linked or generated. They must not become independent sources of truth.

## Non-goals

Do not implement in v0.1:

- GitHub Copilot, Cursor, Gemini, Windsurf, or other agents
- custom adapters or plugins
- nested source inheritance
- global user-level synchronization
- downloading or publishing skills
- secret storage
- authentication
- remote MCP discovery
- environment mutation
- a daemon or watch mode
- automatic execution merely because an agent session starts
- automatic commits or pushes
- modification of user-global Claude or Codex configuration

## Product principles

1. Explicit application: mutation happens through `init` or `apply`.
2. Read-only diagnostics: `status`, `check`, `doctor`, `explain`, `schema`, `template`, and `describe` do not modify the repository.
3. Idempotence: repeated `apply` produces the same filesystem state.
4. Conservative ownership: do not overwrite unmanaged files silently.
5. Inspectability: generated output is stable and understandable.
6. Agent authorability: CLI help and schemas are part of the product contract.
7. Small dependency surface.
