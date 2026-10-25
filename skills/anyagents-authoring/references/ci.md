# CI recipes

Add AnyAgents as an exact-version development dependency using the project's package manager and commit the lockfile. The examples assume pnpm with an exact `packageManager` version in package.json. Adapt installation to the existing repository; do not create another lockfile. Pin the approved CLI release rather than using an unversioned npx download.

Commit canonical files, generated native files, and symlinks. Keep `.anyagents/` ignored. Linux runners preserve Git symlinks; Windows runners need symlink support. Text comparisons normalize LF/CRLF; binary assets remain byte-exact. Checks need no client installation, API credentials, vendor schema download, or local ownership state.

## GitHub Actions

Merge this job into the repository workflow, preserving its existing triggers and policies:

```yaml
name: AnyAgents
on:
  pull_request:
  push:
permissions:
  contents: read
jobs:
  anyagents:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: '22'
          cache: pnpm
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - run: pnpm exec anyagents check --strict
```

## GitLab CI

Merge this job into `.gitlab-ci.yml`. Use an existing stage if the project replaces the default `test` stage. Use the repository-approved Node image/digest and package manager version:

```yaml
anyagents:
  stage: test
  image: node:22
  script:
    - corepack enable
    - pnpm install --frozen-lockfile --ignore-scripts
    - pnpm exec anyagents check --strict
```

`check` exits 0 when current, 1 for validation/drift errors (or warnings under `--strict`), and 2 for command usage errors. It never repairs outputs. Do not run `apply` before CI checking. Generate and review changes locally.

For machine processing, add `--json`: comparison results go to stdout; fatal validation errors go to stderr. Preserve the exit status when redirecting or uploading logs. Keep generated diagnostic files in a gitignored directory. Configure the job as a required check in the hosting platform when appropriate.

References: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions and https://docs.gitlab.com/ci/yaml/.
