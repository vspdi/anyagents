# Offline validation coverage

The following Agent Plugins specification schemas are bundled at version 1.0.0, retrieved October 22, 2026. They validate portable plugin manifests and plugin MCP documents with Ajv draft 2020-12. No schema download happens during CLI execution. SHA-256 values identify the checked-in bytes.

| File | Source | SHA-256 |
| --- | --- | --- |
| `plugin.schema.json` | `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` | `0a4aad95ce337878ad38802ebf0daa3fde76abe3f65400c86bcbb1ec0b3ab883` |
| `mcp.schema.json` | `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json` | `6539175bfcdf43085855183e86da40ea94b166547a72b47ae9a0a390516d3acb` |

The portable plugin schema deliberately does not validate vendor extension contents. Marketplace documents, native manifests for the other target, supported extensions, hooks, path containment, and references use maintained runtime validators, not purported official vendor schemas. References:

- https://developers.openai.com/plugins/build/plugins
- https://code.claude.com/docs/en/plugins/marketplace-reference
- https://code.claude.com/docs/en/plugins-reference

Supported extensions are explicitly enumerated in `anyagents schema marketplace` and `anyagents schema plugin`. Unknown fields fail. Hook validation currently supports referenced JSON files with command handlers and the documented subset of events. MCP follows the existing canonical STDIO/HTTP schema; this release does not add OAuth extension authoring. Local canonical plugin sources are supported; remote plugin fetching and registry publishing are not performed.

Upgrade schema snapshots deliberately, update their hashes, inspect vendor changes, and run schema parity, native generation, integration, and packed CLI tests. Native command-line validators and live client checks may supplement these tests; automated validation alone does not prove client compatibility.

The schema snapshots originate from https://github.com/agentplugins/agent-plugins-spec and are licensed under Apache-2.0. The license is included in `third-party-licenses/agent-plugins-apache-2.0.txt` in the repository and npm package. Formatting is normalized by the repository formatter.

## Live client smoke tests

Automated tests cover generated files and run the generated OpenCode loader against fake host objects. They do not start OpenCode or Copilot. Before relying on a client, run these checks in a scratch repository with `anyagents init --target all`, a skill, and one HTTP and one STDIO server in `.ai/mcp.yaml`, then `anyagents apply`.

**OpenCode project output**

1. `opencode debug config` shows the servers under `mcp.servers` (OpenCode 2) or `mcp` (OpenCode 1, with `opencode.schema: v1`).
2. `opencode mcp list` lists each server; skills from `.agents/skills` appear in the skill list or slash catalog.
3. Confirm `{env:NAME}` values resolve when the variable is set.

**OpenCode plugin package** (`plugins/opencode/<id>/`)

1. Install it as your OpenCode version documents: a path or Git specifier in the `plugins` (OpenCode 2) or `plugin` (OpenCode 1) setting, or `opencode plugin add` with a Git or npm specifier. Restart OpenCode.
2. Confirm the plugin's skills appear and its MCP servers are listed, and that a server or skill you already define with the same name is kept.
3. Confirm environment variables fill header and `environment` values, and that `{plugin:root}` paths point inside the installed package.

These checks exercise the assumptions the generated loader makes and automated tests cannot: a default export with `setup` (OpenCode 2) and `server` (OpenCode 1), the OpenCode 2 skill record (`id`, `name`, `description`, `path`, `content`), and that OpenCode 2 reads `mcp.servers` from project `opencode.json`.

**GitHub Copilot CLI**

1. Start `copilot` in the repository, trust the folder, then run `/mcp` and `/skills list`; project servers and skills should appear. `/instructions` should list `AGENTS.md`.
2. For marketplaces: `copilot plugin marketplace add <path>`, `copilot plugin marketplace browse <name>`, `copilot plugin install <plugin>@<name>`, then `/skills list` and `/mcp`.
