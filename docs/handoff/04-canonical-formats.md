# Canonical formats

## `omniagents.toml`

Minimal v0.1 schema:

```toml
version = 1

[source]
dir = ".ai"

[targets]
claude = true
codex = true

[links]
mode = "symlink"
```

Runtime type:

```ts
interface OmniAgentsConfig {
  version: 1
  source: {
    dir: string
  }
  targets: {
    claude: boolean
    codex: boolean
  }
  links?: {
    mode?: 'symlink' | 'copy'
  }
}
```

`copy` is a fallback/escape hatch, not the default. If implemented in v0.1, copied outputs must be marked and drift-checked. If not implemented, omit it from the schema rather than accepting a nonfunctional option.

Config requirements:

- paths are resolved relative to the directory containing `omniagents.toml`;
- `source.dir` must remain inside the project root in v0.1;
- unknown fields should produce warnings, not silent behavior;
- unsupported `version` is an error.

## Canonical instructions

Path:

```text
<source>/AGENTS.md
```

This is ordinary Markdown without OmniAgents frontmatter. It should contain repository guidance plus this canonical authoring section:

```markdown
## OmniAgents authoring contract

This repository uses OmniAgents. Canonical AI assets live under `.ai/`.

- Edit `.ai/AGENTS.md` for shared repository instructions.
- Add skills under `.ai/skills/<skill-name>/SKILL.md`.
- Add MCP servers to `.ai/mcp.toml`.
- Do not edit linked or generated Claude/Codex destinations.
- Run `npx omniagents explain authoring` for the complete contract.
- Run `npx omniagents apply` after canonical changes.
- Run `npx omniagents check` to verify synchronization.
```

When the source directory is not `.ai`, `init` must render actual resolved paths.

## Canonical skills

Path:

```text
<source>/skills/<skill-name>/SKILL.md
```

Use portable Agent Skills structure:

```markdown
---
name: review-change
description: Review a code change for correctness, regressions, missing tests, and violated repository rules. Use when the user asks to review a diff, branch, pull request, or completed implementation.
---

# Review change

1. Read applicable repository instructions.
2. Inspect the complete diff.
3. Run the smallest relevant deterministic checks.
4. Report findings by severity with file locations.
```

v0.1 validation:

- directory contains `SKILL.md`;
- frontmatter is present;
- `name` is a non-empty kebab-case identifier;
- directory name equals frontmatter `name`;
- `description` is non-empty;
- reject duplicate names;
- allow arbitrary supporting files and directories;
- preserve all files through directory symlinking;
- warn, but do not reject, unknown frontmatter fields.

A complete formal schema for Markdown bodies is impossible. `omniagents schema skill` should describe the metadata object and include the filesystem/body constraints as schema `description` fields and examples.

## Canonical MCP

Path:

```text
<source>/mcp.toml
```

v0.1 supports STDIO and HTTP servers.

```toml
version = 1

[mcp.playwright]
transport = "stdio"
command = "npx"
args = ["-y", "@playwright/mcp@latest"]

[mcp.project-docs]
transport = "http"
url = "https://example.invalid/mcp"
headers = { Authorization = "Bearer ${PROJECT_DOCS_TOKEN}" }
```

Runtime model:

```ts
type CanonicalMcpServer =
  | {
      transport: 'stdio'
      command: string
      args?: string[]
      env?: Record<string, string>
      cwd?: string
      enabled?: boolean
    }
  | {
      transport: 'http'
      url: string
      headers?: Record<string, string>
      enabled?: boolean
    }

interface CanonicalMcpFile {
  version: 1
  mcp: Record<string, CanonicalMcpServer>
}
```

Rules:

- server names must match `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`;
- `enabled` defaults to `true`;
- STDIO requires `command` and forbids `url`;
- HTTP requires `url` and forbids `command`, `args`, `env`, and `cwd`;
- environment placeholders remain literal; OmniAgents never resolves secrets;
- never write secret values into state or diagnostics;
- sort server names for deterministic output;
- preserve argument order;
- reject unknown transport values;
- warn on suspicious plaintext bearer tokens, but do not attempt secret management.

## Bundled JSON schemas

Use JSON Schema draft 2020-12. Give schemas stable internal IDs such as:

```text
https://omniagents.dev/schema/config-v1.json
https://omniagents.dev/schema/mcp-v1.json
https://omniagents.dev/schema/skill-frontmatter-v1.json
```

These URLs need not be hosted for v0.1, but the schemas must be emitted by the CLI. Do not put a nonfunctional remote `$schema` reference into TOML files. TOML editor schema association is editor-specific and outside v0.1.
