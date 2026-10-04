# Repository and release setup

`dev` is the default branch and receives feature PRs. `main` produces stable releases. `dev` produces prereleases such as `0.1.0-dev.1` with semantic-release channel `dev`. Stable npm dist-tag will be `latest`; dev will be `dev` when npm publishing is enabled.

PR titles must be Conventional Commits. `feat` triggers a minor release, `fix`/`perf` a patch, and breaking changes (`!` or BREAKING CHANGE footer) a major release. Docs/tests/CI chores alone do not trigger a release. Feature PRs squash into dev using the PR title and body. Promotion PRs merge dev into main with a merge commit so semantic-release retains history. After a stable release, merge main back into dev before starting the next release cycle. If dev has advanced meanwhile, create a sync branch from dev, merge main into it, then merge that synchronization PR into dev with a merge commit. Promotion PRs to main must come from dev in this repository.

The initial `v0.0.0` tag is on the license-only baseline to ensure the first feature release is `0.1.0`. It is not a published product.

The Release workflow waits for the complete six-job test matrix, independently builds and installs the tarball, then runs semantic-release. GitHub release tarballs are enabled; npm publication is explicitly disabled. Release jobs use full Git history and are serialized per branch. Automated release commits are unnecessary: the npm plugin updates the package version only in release artifacts.

## Repository settings

With an account that can administer this private repository, run:

```sh
node scripts/configure-github.mjs
```

This sets dev as default, configures squash and merge methods with PR title defaults, and creates/updates a single active Default ruleset targeting main/dev with required `quality` and `conventional-title` checks, required PRs, zero mandatory approvals, no admin bypass, and no force pushes/deletions. Required checks are pinned to GitHub Actions. Linear-history enforcement is off to allow promotion/sync merges. Initial branch bootstrap occurs before protections are installed. Private-repository protection availability depends on the owner's GitHub plan; API failure must be reported, not treated as success.

The connected integration may have content permissions without the repository Administration permission. If it returns 403, the owner must apply settings in GitHub or run the setup script locally with an admin-authorized gh session. A PR title check verifies input; title-based merge defaults and the ruleset require reviewed PRs and passing checks. GitHub exposes both merge methods; use squash for feature PRs and merge for promotion/sync. GitHub's squash dialog can still be manually edited by a human; contributors must retain the validated Conventional Commit title.

## npm publishing

Follow [the secure npm setup guide](npm-publishing.md). semantic-release keeps `npmPublish: false`; the isolated `npm-stage` job uses OIDC to stage tested tarballs for human approval with npm 2FA. Set `NPM_PUBLISH_ENABLED=true` only after configuring the protected `npm-publish` environment and matching npm trusted publisher. No long-lived npm publishing token is used.
