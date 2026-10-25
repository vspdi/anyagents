# YAML configuration migration

Version 1.0.0 changes canonical configuration to YAML and renames the OmniAgents paths. Existing TOML canonical configuration is not loaded automatically.

| Before 1.0.0 | 1.0.0 and later |
| --- | --- |
| `omniagents.toml` | `anyagents.yaml` |
| `<source>/mcp.toml` | `<source>/mcp.yaml` |
| `.omniagents/` | `.anyagents/` |
| `# BEGIN/END OmniAgents managed outputs` | `# BEGIN/END AnyAgents managed outputs` |

1. Convert `omniagents.toml` to `anyagents.yaml` and `<source>/mcp.toml` to `<source>/mcp.yaml`, preserving the parsed values. Use `anyagents template config` and `anyagents template mcp-http` as examples. Native `.codex/config.toml` stays TOML.
2. Rename `.omniagents/` to `.anyagents/` before applying. Preserve `state.json`; ensure no apply is running and no stale lock is carried over. Existing state without marketplace records remains readable.
3. Replace the `OmniAgents managed outputs` block in `.gitignore` with `# BEGIN AnyAgents managed outputs`, `.anyagents/`, and `# END AnyAgents managed outputs` on separate lines. Keep the state directory ignored.
4. Update project instructions and CI commands to the new filenames. Run `anyagents apply --dry-run`, review the plan, then `anyagents apply` and `anyagents check --strict`.

Do not delete ownership state to bypass conflicts. On a fresh clone, exact native content can be checked or adopted without state, but old managed entries absent from canonical input cannot be distinguished from unrelated user entries. Apply removals locally with preserved ownership state before committing.

For a marketplace-only project, set `project: false`; otherwise project instructions, skills, and MCP remain required. No marketplace install, registration, publishing, or global configuration changes occur during migration.
