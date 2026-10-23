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
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
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
