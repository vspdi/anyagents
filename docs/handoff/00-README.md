# OmniAgents v0.1 implementation handoff

Build a small TypeScript CLI, published as `omniagents` on npm, that maintains one canonical AI configuration and materializes it for Claude Code and OpenAI Codex.

## Product sentence

> OmniAgents keeps repository instructions, Agent Skills, and MCP server definitions in one canonical directory and exposes them through each supported coding agent's native files.

## Primary constraints

- Canonical source directory defaults to `.ai/` but is configurable.
- Support only Claude Code and Codex in v0.1.
- Symlink when the native format can consume the canonical asset unchanged.
- Generate when target formats differ, initially MCP configuration.
- The CLI itself must expose enough context for a human or coding agent to author canonical files without reading OmniAgents source.
- Keep the implementation compact, deterministic, local-only, and understandable.
- Publish to npm and host on GitHub.
- No telemetry, cloud service, plugin framework, registry, daemon, or watch mode.

## Start here

An implementation agent should read these files in order:

1. `01-product-contract.md`
2. `02-repository-and-architecture.md`
3. `03-cli-contract.md`
4. `04-canonical-formats.md`
5. `05-target-adapters.md`
6. `06-filesystem-state-and-safety.md`
7. `07-validation-and-tests.md`
8. `08-packaging-and-release.md`
9. `09-implementation-plan.md`
10. `10-agent-bootstrap-contract.md`

## Definition of done

A clean temporary repository can run:

```bash
npx omniagents init
npx omniagents apply
npx omniagents check
npx omniagents explain mcp
npx omniagents schema mcp
```

Claude and Codex then discover the same canonical instructions and skills, and receive equivalent MCP server definitions in their native formats.

Completion requires passing automated tests plus an end-to-end smoke test against a temporary Git repository. Do not claim completion from code inspection alone.
