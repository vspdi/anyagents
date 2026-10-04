# AnyAgents development

Read README.md and docs/decisions.md before changing behavior. The original handoff is in docs/handoff; user decisions in docs/decisions.md supersede it.

Implement one local TypeScript CLI for Claude Code and Codex. Keep canonical validation, target transforms, ownership checks, and filesystem execution distinct. Never resolve secrets, overwrite unmanaged content, mutate global configuration, or introduce background behavior.

Keep explain/schema/template output consistent with validators. Add meaningful regression tests for ownership, native transforms, or CLI behavior that changes.

Feature branches and PRs target dev. PR titles must be Conventional Commits. main is for stable releases; dev is for prereleases. Squash feature PRs into dev. Use merge commits for dev-to-main promotion and main-to-dev synchronization so release ancestry is retained.

Before completion run pnpm lint, pnpm typecheck, pnpm build, pnpm test, and pnpm test:pack. Report actual evidence. Do not claim platform/client compatibility beyond checks performed.
