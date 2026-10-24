# Release workflow

`dev` is the default branch and receives feature PRs. `main` produces stable releases; `dev` produces prereleases with the `-dev.N` suffix. npm uses `latest` for stable releases and `dev` for prereleases.

## Branch workflow

PR titles must use Conventional Commits. `feat` triggers a minor release, `fix`, `perf`, and `revert` trigger a patch, and breaking changes (`!` or a `BREAKING CHANGE` footer) trigger a major release. Documentation, tests, and CI changes alone do not trigger releases.

1. Squash feature PRs into `dev`, retaining the validated PR title as the commit subject.
2. Promote `dev` to `main` using a merge commit.
3. Merge `main` back into `dev` before the next release cycle to retain semantic-release ancestry. If `dev` has advanced, create a sync branch from `dev` and merge `main` into it first.

PRs targeting `main` must come from this repository's `dev` branch. GitHub exposes both squash and merge methods; contributors must select the method appropriate to the branch workflow and retain the Conventional Commit subject in the merge dialog.

## Build and approval

The Release workflow requires the full Linux/macOS/Windows matrix on Node 22 and 24. It builds and installs the bundled tarball, runs semantic-release with full Git history, and attaches the tarball to the GitHub release. Runs are serialized per branch. Package version changes occur in release artifacts; automated release commits are unnecessary.

When `NPM_PUBLISH_ENABLED=true`, the isolated `npm-stage` job verifies the artifact's checksum and identity, then uploads it using GitHub OIDC. It does not publish the package publicly. The Actions summary links to npm and lists the version, channel, candidate ID, and checksum. The owner reviews the matching entry in npm's **Staged Packages** tab and approves it with 2FA.

Follow [secure npm publishing](npm-publishing.md) to configure the environment and trusted publisher before enabling staging. Keep semantic-release's `npmPublish: false`; never add a publishing token to Actions.

## Repository protections

Protect both `main` and `dev` with required PRs, up-to-date `quality` and `conventional-title` checks from GitHub Actions, conversation resolution, no bypass, and no force pushes or deletion. Keep rebase merging and linear-history enforcement disabled to preserve promotion and synchronization ancestry. Use PR titles as merge commit defaults.

With a sole maintainer, zero mandatory reviewers avoids blocking their own changes. Add a second trusted reviewer before requiring code-owner approval. CODEOWNERS identifies release-sensitive files but does not enforce reviews by itself.

## Version history

The `v0.0.0` license-only baseline lets semantic-release produce the initial `0.1.0` release; it is not a working package. Published npm versions are immutable. The `anyagents` executable starts with `0.1.1`; `0.1.0` contains the historical `agentbridge` executable.

## Dependency compatibility

The CLI requires Node 22.12 or later, the minimum for commander 15. The Conventional Commits preset stays on major 9 because major 10 requires conventional-changelog-writer 9, while the current release-notes plugin uses writer 8. Dependabot excludes that major. Revisit the exclusion when the release-notes plugin changes.

Building from source needs Node 22.18 or later (tsup 9); Vitest 5 needs 22.12. Raising the Node baseline is a breaking change and needs a major release. Node types stay on major 24 to match the upper CI runtime. Release-only tools execute on Node 24, allowing their newer majors independently.
