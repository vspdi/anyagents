# Canonical definitions

All canonical configuration is YAML 1.2. Native output remains JSON or TOML as required by the client. Duplicate keys, aliases, custom tags, and unsafe object keys fail parsing. Use `version: 1` for the DSL schema, and `release` for a plugin's semantic version.

`anyagents.yaml`:

```yaml
version: 1
project: false
targets:
  claude: true
  codex: true
marketplaces:
  personal:
    source: .ai/marketplace.yaml
    output: .
```

`project` defaults to true: validate and synchronize project instructions, skills, and `.ai/mcp.yaml`. Set it false for a standalone marketplace repository. Config source/output paths resolve relative to the config file. Multiple marketplaces use additional entries with disjoint output roots, such as `marketplaces/personal` and `marketplaces/team`. Map keys become native marketplace names.

`.ai/marketplace.yaml`:

```yaml
version: 1
owner:
  name: Example Team
plugins:
  review:
    source:
      kind: local
      path: ./plugins/review
    detail:
      codex:
        category: Productivity
        policy:
          installation: AVAILABLE
          authentication: ON_INSTALL
detail:
  codex:
    interface:
      displayName: Personal Tools
```

Plugin source paths resolve relative to the catalog YAML file. Only canonical local plugin sources are supported in this version. A plugin identifier is its catalog map key; do not duplicate `name` in `plugin.yaml`. Reuse the same identifier when referencing a plugin from several catalogs.

`.ai/plugins/review/plugin.yaml`:

```yaml
version: 1
release: 0.1.0
description: Code review tools
author:
  name: Example Team
detail:
  codex:
    interface:
      displayName: Code Review
```

A plugin directory contains `plugin.yaml`, optional `mcp.yaml`, and assets under `skills/`, `assets/`, `scripts/`, `hooks/`, `agents/`, or `commands/`. Symlinks are rejected. Skills have ordinary `<id>/SKILL.md` directories and validated YAML frontmatter. Scripts and binary assets are copied; no commands are executed.

Plugin `mcp.yaml` uses exactly the project MCP schema but only configures that plugin. Use `${PLUGIN_ROOT}/scripts/server.js` for bundled script paths; Claude output translates the root placeholder. Project MCP retains the project's native transform rules. Claude does not support canonical `cwd`; selected-target incompatibilities fail before writing.

`detail.claude` and `detail.codex` describe native additions on their containing object. Catalog details extend the catalog; entry details extend that catalog entry; plugin details extend its manifest. Codex plugin details become `extensions["com.openai"]` in portable `plugin.json`. Shared identity, source, version, and generated component paths cannot be overridden. Objects merge recursively, arrays replace, and null deletion is unsupported. Unknown fields fail validation; use the emitted schema to see supported details.

Supported plugin detail paths stay inside the plugin, start with `./`, and must exist. Hooks may reference JSON files containing command hooks; unknown events, fields, and hook types are rejected. More vendor features require explicit schema/adapter support, not an arbitrary passthrough.

Each output root receives `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`, and selected-target bundles under `plugins/<target>/<id>/`. Catalog references point to these generated bundles. Outputs cannot overlap canonical inputs, reserved directories, or other marketplace roots. Removed owned artifacts are removed only when unchanged; edited or unmanaged files are preserved with an error. Deselected targets remain untouched.

Validation is offline. Bundled Agent Plugins 1.0.0 JSON Schemas validate portable manifests and MCP. Marketplace documents, Claude manifests, supported vendor details, references, and hooks use explicitly maintained validators derived from vendor documentation. These are not complete official vendor schemas and do not prove live-client compatibility. Codex catalog policy and category are required explicitly; AnyAgents does not silently choose install/authentication policy.

Use `anyagents template marketplace`, `plugin`, `config`, `mcp-stdio`, or `mcp-http` for complete examples. `anyagents check --strict` validates definitions and committed outputs without requiring local ownership state. It leaves unrelated local client configuration intact; without prior state it cannot identify formerly managed entries removed from canonical input. Apply removals locally before committing them.
