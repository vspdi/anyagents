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
