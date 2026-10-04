# Repository and architecture

## Recommendation

Use a single npm package and one TypeScript project for v0.1. Do not create a monorepo or separate adapter packages. Preserve adapter boundaries in source code so packages can be extracted later if justified.

```text
omniagents/
├── src/
│   ├── cli.ts
│   ├── commands/
│   │   ├── init.ts
│   │   ├── apply.ts
│   │   ├── status.ts
│   │   ├── check.ts
│   │   ├── doctor.ts
│   │   ├── explain.ts
│   │   ├── schema.ts
│   │   ├── template.ts
│   │   └── describe.ts
│   ├── core/
│   │   ├── config.ts
│   │   ├── context.ts
│   │   ├── errors.ts
│   │   ├── filesystem.ts
│   │   ├── hashing.ts
│   │   ├── ownership.ts
│   │   ├── paths.ts
│   │   ├── result.ts
│   │   ├── state.ts
│   │   └── validation.ts
│   ├── adapters/
│   │   ├── adapter.ts
│   │   ├── claude.ts
│   │   └── codex.ts
│   ├── formats/
│   │   ├── canonical-config.ts
│   │   ├── canonical-mcp.ts
│   │   ├── claude-mcp.ts
│   │   ├── codex-mcp.ts
│   │   └── skill.ts
│   ├── content/
│   │   ├── explanations.ts
│   │   ├── schemas.ts
│   │   └── templates.ts
│   └── output/
│       ├── human.ts
│       └── json.ts
├── tests/
│   ├── fixtures/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md
├── LICENSE
└── AGENTS.md
```

## Runtime and build

- TypeScript
- Node.js 20 or newer
- ESM package
- Bundle CLI with `tsup`, which uses esbuild
- Generate one executable JavaScript entry with a Node shebang
- Avoid runtime dependence on repository source files by bundling templates, explanations, and schemas

Suggested dependencies:

```text
commander        CLI parsing
zod              runtime schemas
smol-toml        TOML parse/stringify, or another small maintained TOML package
```

Prefer Node built-ins for glob-like traversal, hashing, copying, links, paths, and file operations. Add `fast-glob` only if built-in recursive traversal becomes materially cumbersome.

Suggested development dependencies:

```text
typescript
vitest
tsup
@types/node
```

## Core interfaces

```ts
export type TargetName = 'claude' | 'codex'

export interface ProjectContext {
  readonly projectRoot: string
  readonly sourceDir: string
  readonly configPath: string | null
  readonly targets: readonly TargetName[]
  readonly force: boolean
}

export interface TargetAdapter {
  readonly name: TargetName
  plan(context: ProjectContext): Promise<OperationPlan>
  apply(context: ProjectContext, plan: OperationPlan): Promise<ApplyResult>
  inspect(context: ProjectContext): Promise<TargetStatus>
}

export type PlannedOperation =
  | { readonly kind: 'symlink'; readonly source: string; readonly destination: string }
  | { readonly kind: 'generate'; readonly destination: string; readonly content: string }
  | { readonly kind: 'mkdir'; readonly path: string }
  | { readonly kind: 'remove-managed'; readonly path: string }

export interface OperationPlan {
  readonly target: TargetName
  readonly operations: readonly PlannedOperation[]
  readonly warnings: readonly string[]
}
```

Adapters decide desired native state. Core filesystem code owns safety, atomicity, ownership checks, and execution.

## Error model

Use typed errors with stable machine-readable codes:

```ts
export type ErrorCode =
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_INVALID'
  | 'SOURCE_NOT_FOUND'
  | 'CANONICAL_MCP_INVALID'
  | 'SKILL_INVALID'
  | 'DESTINATION_CONFLICT'
  | 'LINK_UNSUPPORTED'
  | 'OUTPUT_DRIFT'
  | 'APPLY_FAILED'
```

Human output shows a concise message and repair command. `--json` outputs the code, message, path, and optional details.
