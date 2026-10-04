# Filesystem, state, and safety

## Symlink policy

Use relative symlinks calculated from the destination's parent directory.

Examples with default source:

```text
CLAUDE.md          -> .ai/AGENTS.md
AGENTS.md          -> .ai/AGENTS.md
.claude/skills     -> ../.ai/skills
.agents/skills     -> ../.ai/skills
```

Rules:

- if the correct symlink already exists, no-op;
- if a broken OmniAgents-managed symlink exists, repair it;
- if another symlink or ordinary file/directory occupies the destination, report `DESTINATION_CONFLICT`;
- do not recursively delete arbitrary directories;
- Windows: use `junction` for directory links if ordinary directory symlinks are unavailable and it is semantically safe; use file symlinks for files;
- surface clear remediation if link creation is not permitted;
- optional copy fallback should be a deliberate config mode, not an automatic silent change.

## State location

Do not put changing state inside canonical source inputs. Use:

```text
.omniagents/state.json
```

Add `.omniagents/` to the managed `.gitignore` block.

State example:

```json
{
  "schemaVersion": 1,
  "toolVersion": "0.1.0",
  "sourceHash": "sha256:...",
  "managed": {
    "claude": {
      "links": ["CLAUDE.md", ".claude/skills"],
      "generated": {
        ".mcp.json": "sha256:..."
      },
      "managedMcpServers": ["playwright", "project-docs"]
    },
    "codex": {
      "links": ["AGENTS.md", ".agents/skills"],
      "generated": {
        ".codex/config.toml": "sha256:..."
      },
      "managedMcpServers": ["playwright", "project-docs"]
    }
  }
}
```

For mixed-ownership files such as `.codex/config.toml`, the whole-file hash is informational only because unrelated user changes are valid. Store a canonical hash of only OmniAgents-managed subtrees/entries and use that for drift decisions.

## Source hashing

Hash inputs deterministically:

```text
omniagents.toml
<source>/AGENTS.md
<source>/mcp.toml
<source>/skills/**/*
```

Algorithm:

1. enumerate regular files;
2. sort normalized POSIX-style relative paths;
3. normalize text line endings to LF;
4. hash path length, path bytes, content length, and content bytes;
5. include config schema version and tool version;
6. SHA-256 result prefixed with `sha256:`.

Do not use source hash alone as correctness proof. `check` must inspect the actual destinations. A link can be replaced or generated output edited without source changes.

## Atomic generation

For generated files:

1. render to memory;
2. validate rendered JSON/TOML by reparsing;
3. write a sibling temporary file;
4. fsync/close if practical;
5. rename over the destination;
6. update state only after all target operations succeed.

Avoid leaving temporary files after failure.

## `.gitignore` management

Manage an exact marked block in the root `.gitignore`:

```gitignore
# BEGIN OmniAgents managed outputs
.omniagents/
# END OmniAgents managed outputs
```

Do not ignore linked native instruction or skill paths by default. Git can version symlink entries, and committing them gives cloned repositories immediate discovery. Do not ignore generated `.mcp.json` by default because project MCP configuration may be intentionally shared and reviewed. Do not ignore `.codex/config.toml` wholesale because it may contain project configuration.

Therefore v0.1 should make Git behavior explicit through config:

```toml
[git]
managed_outputs = "commit"
```

Supported initial policies:

- `commit`: generated native assets and symlinks may be committed; CI detects drift.
- `ignore`: add fully owned generated destinations to managed ignore block, but never ignore mixed-ownership `.codex/config.toml` wholesale.

Default to `commit` because it bootstraps agents immediately after clone and makes MCP changes reviewable. State remains ignored.

If `ignore` is deemed too complex for v0.1, support only `commit` and document it. Do not pretend automatic ignore is always correct.

## Uninstall/removal

No `uninstall` command in v0.1. `apply` may remove stale outputs only if state proves OmniAgents managed them. Removing a target from config should produce a warning and leave existing native assets untouched until a future explicit cleanup feature exists.
