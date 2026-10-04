# Packaging and release

## `package.json` shape

```json
{
  "name": "omniagents",
  "version": "0.1.0",
  "description": "Canonical instructions, skills, and MCP configuration for Claude Code and Codex.",
  "type": "module",
  "bin": {
    "omniagents": "./dist/cli.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "vitest run tests/e2e",
    "prepack": "pnpm build && pnpm test"
  },
  "keywords": [
    "claude-code",
    "codex",
    "mcp",
    "agent-skills",
    "agents-md",
    "cli"
  ],
  "license": "MIT"
}
```

Before implementation, verify npm name availability with the npm registry. If the unscoped name is unavailable, use a scope but keep the binary `omniagents`:

```bash
npx @scope/omniagents init
```

Do not assume package availability from web search alone.

## Bundle

Use `tsup` to emit:

```text
dist/cli.js
```

Requirements:

- ESM;
- Node platform;
- shebang preserved or injected;
- sourcemap optional;
- no declaration output required for a CLI-only v0.1;
- bundle help, templates, and schemas as TypeScript constants or imported JSON included by the bundler.

## README minimum

- problem and mental model;
- installation-free quick start with `npx`;
- canonical directory example;
- commands;
- Claude/Codex destination matrix;
- ownership and Git behavior;
- MCP security warning;
- compatibility table;
- development and release instructions;
- MIT license.

## GitHub Actions

### CI

Trigger on pull request and push:

```text
install with pnpm
check formatting/lint if configured
typecheck
test
build
CLI smoke test
pnpm pack --dry-run
```

### npm release

Use npm trusted publishing with GitHub Actions if available for the repository/account. Otherwise use an npm automation token stored as a GitHub Actions secret. The release workflow should:

1. run all quality gates;
2. build;
3. publish with provenance;
4. create or use an existing GitHub release/tag.

Do not automate release in the first implementation before a local `npm pack` install test passes:

```bash
pnpm pack
npx ./omniagents-0.1.0.tgz --help
```

## Versioning

Use SemVer. For this small project, manual versions plus Git tags are sufficient initially. Do not introduce Changesets or semantic-release unless repeated releases make the automation worthwhile.
