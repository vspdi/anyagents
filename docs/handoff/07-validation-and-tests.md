# Validation and testing

## Test strategy

Use Vitest with temporary directories. Tests must not depend on actual user-level Claude or Codex configuration.

### Unit tests

- config parsing, defaults, precedence, unknown fields, version rejection;
- canonical MCP union validation;
- skill frontmatter parsing and name/path consistency;
- source hashing stability across traversal order and CRLF/LF;
- relative symlink calculation;
- Claude MCP transform;
- Codex MCP transform and structural merge;
- JSON Schema examples validate against runtime schemas;
- explanation and template topic registries are complete;
- human and JSON error rendering.

### Integration tests

For each adapter in a temporary project:

1. initialize canonical files;
2. apply adapter;
3. inspect native paths;
4. rerun apply and verify no changes;
5. modify canonical source and verify appropriate updates;
6. replace a managed link with unmanaged content and verify refusal;
7. modify generated MCP output and verify drift;
8. remove canonical MCP server and verify safe managed removal;
9. preserve unrelated `.claude`, `.agents`, and `.codex` content.

### End-to-end CLI tests

Execute the bundled CLI:

```bash
node dist/cli.js init --cwd <temp>
node dist/cli.js apply --cwd <temp>
node dist/cli.js status --cwd <temp> --json
node dist/cli.js check --cwd <temp>
node dist/cli.js explain mcp
node dist/cli.js schema mcp
```

Validate exit codes and parse JSON output.

## Required fixtures

```text
tests/fixtures/
├── minimal/
├── full-mcp/
├── existing-codex-config/
├── destination-conflict/
├── invalid-skill/
└── invalid-mcp/
```

## Cross-platform test matrix

GitHub Actions:

```text
ubuntu-latest / Node 20, 22
macos-latest / Node 20, 22
windows-latest / Node 20, 22
```

Symlink permissions on Windows can differ. Tests should detect whether file links can be created and assert the documented error/fallback behavior instead of silently skipping all link coverage.

## `check` acceptance matrix

`check` fails when:

- canonical config is invalid;
- source assets are missing;
- any skill is invalid;
- canonical MCP is invalid;
- expected link is absent, wrong, or broken;
- generated Claude MCP differs;
- managed Codex MCP entries differ;
- previously managed entries that should have been removed remain;
- state is internally inconsistent.

`check` must not fail merely because unrelated user-owned Codex config changed.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm pack --dry-run
```

If no linter is added, omit the fake command. Avoid dependencies that exist only to satisfy a fashionable stack.
