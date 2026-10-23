# Development conventions

Read AGENTS.md and README.md. This is a bundled TypeScript CLI in a pnpm workspace. Existing project synchronization and filesystem execution remain in src/core; CLI composition lives in src/cli.ts.

Marketplace canonical schemas and pure native transforms live in the private, unversioned `@alchemisten/anyagents-marketplaces` package. Consume it only through its public index; no deep cross-package imports. Runtime path resolution, ownership, and transactional writes remain in src/core and share the project engine. Vendor schemas are bundled in that package and have documented provenance in docs/validation.md.

Canonical authoring uses YAML. Native files retain the client's required format. Project MCP and each plugin MCP are separate inputs. Marketplaces have explicit source/output roots and target-isolated bundles. Definition schemas, templates, explanations, and skills must remain consistent.

Bundled skill sources live in skills/anyagents-authoring. The build embeds their Markdown so authoring guides work offline from the packed CLI; init also scaffolds the skill into canonical project skills.

Run pnpm lint, pnpm typecheck, pnpm build, pnpm test, and pnpm test:pack. Security coverage includes untrusted YAML, native details, source/output paths, ownership conflicts, and rollback. Never execute plugin scripts, hooks, or servers during validation.
