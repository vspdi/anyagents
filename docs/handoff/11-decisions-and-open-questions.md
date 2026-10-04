# Decisions and deliberately deferred questions

## Confirmed decisions

- Project/package/CLI name: OmniAgents / `omniagents`.
- TypeScript and Node.js.
- Bundled CLI suitable for `npx`.
- Canonical source defaults to `.ai/` and is configurable.
- v0.1 supports Claude Code and Codex only.
- Instructions and skills use symlinks where native formats allow.
- MCP uses a canonical TOML definition and target-specific generation/merge.
- CLI is a documentation API through `explain`, `schema`, `template`, and `describe`.
- Agents author canonical assets only.
- Explicit `apply`; no daemon or automatic background behavior.
- Publish on npm and GitHub under MIT.

## Recommended decisions made in this handoff

These were not fully discussed but are necessary to remove implementation ambiguity:

1. Single npm package, not a monorepo.
2. Node.js 20+.
3. `tsup`/esbuild bundling.
4. State lives in `.omniagents/state.json`, outside canonical source hashing.
5. Native outputs default to committed/reviewable, while state is ignored.
6. `.codex/config.toml` is structurally merged because it is mixed ownership.
7. Whole skill directory is linked rather than individual skills.
8. `check` is strict and read-only; `status` is informational.
9. Unmanaged destination conflicts are refused rather than overwritten.

## Questions to resolve during implementation only if official native formats demand it

- Exact current Codex TOML field names for HTTP headers and transport-specific options.
- Exact current Claude `.mcp.json` representation for all supported HTTP options.
- Whether Windows directory junctions satisfy each client reliably.

These are adapter details. Resolve them by checking current official documentation and add fixtures. They must not alter the canonical model unless native limitations make mapping impossible.

## Future candidates, explicitly not v0.1

- Copilot adapter;
- global/user-level mode;
- copy mode with managed markers;
- `clean` command;
- skill registry/install command;
- adapter API for third parties;
- remote schemas hosted at `omniagents.dev`;
- shell completions.
