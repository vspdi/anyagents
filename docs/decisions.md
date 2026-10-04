# Implementation decisions

User-confirmed: private vspdi/omniagents; implement v0.1; TypeScript/Node 20+; MIT; Claude Code and Codex only; Biome; semantic-release; stable main, ongoing dev; dev is the default PR branch; squash feature PRs into dev; allow merge commits for dev-to-main promotion and main-to-dev synchronization; Conventional Commit PR titles; required CI and title checks; no direct pushes, admin bypass, force pushes, or required approvals. npm setup/publication waits until the package works.

The npm name omniagents is already occupied. Package scope provisionally @vspdi/omniagents, binary omniagents. npm publication is disabled; GitHub releases attach an installable tarball. Confirm scope availability and account ownership before enabling npm.

Symlink mode and committed native assets only. Copy and ignore modes are omitted from schemas. Correct links and byte-identical generated files can be adopted after clone; otherwise unmanaged collisions are refused, including --force. Codex ownership is per MCP server entry. Unrelated Codex TOML values survive; comments/formatting may change during structural serialization. State is ignored and written last. A local lock serializes apply; caught write failures restore earlier outputs. Power loss is not a cross-file transaction.

Canonical sources and output parents cannot traverse symlinks. Source remains in the project and cannot overlap native/state/Git directories. Supporting binary skill files are hashed byte-for-byte; valid UTF-8 text normalizes CRLF to LF.

Official native docs checked October 4, 2026:

- https://code.claude.com/docs/en/mcp
- https://developers.openai.com/codex/mcp
- https://developers.openai.com/codex/skills
- https://code.claude.com/docs/en/skills

Codex HTTP environment credentials use bearer_token_env_var/env_http_headers rather than literal interpolation in http_headers. Same-name STDIO env references map to env_vars. Other embedded placeholders unsupported by Codex are rejected when Codex is selected. No secrets are resolved by OmniAgents. Claude has no documented project MCP cwd field; canonical cwd is supported only with Codex selected. Unsupported mappings fail before outputs are changed.

Windows requires file symlink privileges (Developer Mode or suitable permissions). Directory symlinks are used too; junction fallback is intentionally not enabled because native discovery reliability has not been proven. Tests assert LINK_UNSUPPORTED if link creation is unavailable rather than skipping all ownership validation.

Initialization refuses existing authored files by default. init --force explicitly replaces scaffold files; apply --force only repairs managed generated drift. Initialization is a separate operation: if subsequent apply conflicts, scaffold remains for inspection and repair.

An initial v0.0.0 baseline tag on the license-only commit lets semantic-release choose 0.1.0 for the first feature release, rather than its default 1.0.0. The baseline is not a working product release.

Repository governance confirmed: one active ruleset targets both dev and main, requires PRs and GitHub Actions quality/conventional-title checks, zero mandatory approvals, no bypasses, no force pushes, and no deletions. Linear-history enforcement is off to retain branch ancestry through promotion/sync merges. Repository-wide merge options expose squash and merge; contributors select squash for feature PRs and merge for promotion/sync. GitHub cannot select the merge method based on source branch automatically.

## AgentBridge naming

The repository is `vspdi/agentbridge`, the unscoped npm package is `agentbridge`, and the CLI executable is `agentbridge`. npm publishing remains disabled pending secure publishing setup. Existing `omniagents.toml`, `.omniagents/` ownership state, and managed ignore markers remain compatible with the original v0.1.0 release. The archived handoff retains its original product name.

## Publishing security

Builds bundle CLI libraries and the published package has no production dependency installs. The npm publishing job stages the tested tarball with OIDC, separately from project code and dependency installation. npm approval with 2FA is the final public-release gate. Publishing is gated by NPM_PUBLISH_ENABLED and the npm-publish environment; owner account and protection setup must precede enabling it.
