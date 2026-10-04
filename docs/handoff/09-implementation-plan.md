# Implementation plan

Implement in vertical slices. Keep the CLI usable after each phase.

## Phase 1: skeleton and config

- scaffold npm package with TypeScript, pnpm, tsup, Vitest;
- create executable CLI and `--version`/`--help`;
- implement project root, config path, and source path resolution;
- define runtime schemas and typed errors;
- implement `describe`, `explain`, `schema`, and `template` registries early.

Evidence:

```bash
pnpm build
node dist/cli.js --help
node dist/cli.js explain authoring
node dist/cli.js schema config | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"
```

## Phase 2: canonical initialization and validation

- implement `init`;
- scaffold canonical instructions, MCP, and example skill;
- validate skill frontmatter and canonical MCP;
- implement deterministic source hashing;
- add managed `.gitignore` block for state.

## Phase 3: filesystem engine

- model operation plans;
- implement relative links, conflict detection, manifests/state, atomic writes;
- implement dry-run;
- create unit and integration coverage for ownership rules.

## Phase 4: Claude adapter

- link `CLAUDE.md` and `.claude/skills`;
- generate `.mcp.json`;
- implement inspect/status/check;
- verify current native fields against official Claude documentation.

## Phase 5: Codex adapter

- link `AGENTS.md` and `.agents/skills`;
- structurally merge managed MCP entries into `.codex/config.toml`;
- preserve unrelated settings and servers;
- implement managed entry removal and drift detection;
- verify current native fields against official Codex documentation.

## Phase 6: CLI completion

- build `apply`, `status`, `check`, and `doctor`;
- add consistent human and JSON output;
- stabilize exit codes;
- test all help text and examples.

## Phase 7: packaging and CI

- produce npm bundle;
- test packed tarball through `npx` or local npm execution;
- add Linux/macOS/Windows matrix;
- write README and license;
- verify package name before publishing.

## Implementation constraints

- Do not create a plugin abstraction beyond the small `TargetAdapter` interface.
- Do not split into multiple npm packages.
- Do not mutate user-global config.
- Do not resolve `${ENV_VAR}` placeholders.
- Do not silently replace unmanaged destinations.
- Do not add watch mode.
- Do not introduce a database.
- Keep all target-specific transforms fixture-tested.

## Final acceptance scenario

```bash
mkdir demo && cd demo
git init
npx omniagents init

# Author a second skill and MCP server in .ai
npx omniagents explain skills
npx omniagents explain mcp

npx omniagents apply
npx omniagents status
npx omniagents check
```

Verify:

```text
CLAUDE.md resolves to .ai/AGENTS.md
AGENTS.md resolves to .ai/AGENTS.md
.claude/skills resolves to .ai/skills
.agents/skills resolves to .ai/skills
.mcp.json contains equivalent enabled MCP definitions
.codex/config.toml contains equivalent managed MCP definitions
unrelated Codex configuration remains intact
second apply makes no effective change
check is read-only and exits 0
```
