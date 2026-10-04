# Target adapters

Implement native paths and exact transforms behind adapters. Keep platform assumptions in these files.

## Claude adapter

### Instructions

Desired destination:

```text
CLAUDE.md -> <source>/AGENTS.md
```

Prefer a relative symlink from destination parent to canonical source.

### Skills

Desired destination:

```text
.claude/skills -> ../<source>/skills
```

Link the directory, not every skill. This means newly authored skills are immediately visible without rerunning `apply`, provided the `.claude/skills` link already exists.

If `.claude` exists, preserve unrelated content. Manage only `.claude/skills`.

### MCP

Desired destination:

```text
.mcp.json
```

Generated structure:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "project-docs": {
      "type": "http",
      "url": "https://example.invalid/mcp",
      "headers": {
        "Authorization": "Bearer ${PROJECT_DOCS_TOKEN}"
      }
    }
  }
}
```

Requirements:

- validate exact Claude mappings against the official Claude Code documentation during implementation;
- pretty-print JSON with two-space indentation and final newline;
- do not add fake comment properties;
- use managed state to identify the file as generated;
- deterministic server ordering.

Official Claude documentation confirms project `.mcp.json` support and Claude Code skills use `SKILL.md`; implementation should lock behavior with fixtures and documentation links in the project README.

## Codex adapter

### Instructions

Desired destination:

```text
AGENTS.md -> <source>/AGENTS.md
```

### Skills

Desired destination:

```text
.agents/skills -> ../<source>/skills
```

Preserve unrelated `.agents` content. Manage only `.agents/skills`.

### MCP

Desired destination:

```text
.codex/config.toml
```

This path may contain developer-owned Codex settings. It must use structural TOML merge rather than full overwrite.

For each canonical server, manage only the corresponding `mcp_servers.<name>` entry. Preserve unrelated top-level keys and unmanaged MCP servers.

Conceptual output:

```toml
model = "example-user-setting"

[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]

[mcp_servers.project-docs]
url = "https://example.invalid/mcp"
http_headers = { Authorization = "Bearer ${PROJECT_DOCS_TOKEN}" }
```

Important implementation requirement:

- verify current Codex key names and transport mapping against official Codex configuration documentation while implementing;
- isolate the mapping in `formats/codex-mcp.ts`;
- unit-test every canonical field;
- never destroy unknown Codex settings;
- state tracks names of MCP entries managed by OmniAgents;
- when a canonical server is removed, delete only the previously managed corresponding entry;
- if a currently managed entry is manually modified, `check` reports output drift and `apply` refuses unless the user explicitly resolves or uses the documented managed-force behavior.

## Adapter ownership

Each adapter exposes:

```ts
const claudeAdapter: TargetAdapter
const codexAdapter: TargetAdapter
```

Adapters do not write files directly. They produce desired operations and generated content. Core execution handles collision policy consistently.
