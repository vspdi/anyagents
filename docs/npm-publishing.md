# Secure npm publishing setup

Package: `agentbridge`. GitHub repository: `vspdi/agentbridge`. Stable releases come from `main` with npm dist-tag `latest`; prereleases come from `dev` with dist-tag `dev`.

The Release workflow creates GitHub releases independently. When `NPM_PUBLISH_ENABLED` is `true`, a separate job stages the exact same tarball for npm. Only that job has OIDC permission. It has no source checkout, project dependency installation, or package lifecycle execution. All npm candidates require human approval with npm 2FA before becoming public.

## 1. Protect your accounts

Enable GitHub and npm 2FA using a security key or passkey where supported. Keep recovery codes offline. Use a small maintainer list and remove unused account tokens and app installations. Never send passwords, tokens, or recovery codes in chat.

## 2. Decide repository visibility

Trusted publishing can work from a private repository, but npm provenance requires a public repository. Make the repository public only after reviewing tracked files, Git history, release assets, and the archived handoff for private information. The workflow requests provenance for public repositories and disables it for private repositories.

GitHub environment required reviewers are available for public repositories on Free/Pro/Team; using them for private repositories requires Enterprise. Branch deployment restrictions should still be configured wherever your plan supports environments. npm's mandatory stage approval remains the final publishing gate.

## 3. Create the GitHub environment

In GitHub, open **Settings → Environments → New environment** and name it exactly `npm-publish`.

1. Under deployment branches and tags, choose **Selected branches and tags**.
2. Add branch rules for `main` and `dev`. Do not allow feature branches or all tags.
3. Add a required reviewer if your plan supports it. With a second trusted reviewer, enable **Prevent self-review** and disable administrator bypass. As a sole owner, leave self-review allowed so you can approve your own release jobs.
4. Do not add an npm token secret. Trusted publishing uses OIDC.

These protections must exist before enabling the publishing variable. npm must bind its publisher configuration to this exact environment name; leaving the npm environment field blank would remove an important restriction.

## 4. Bootstrap the new npm package locally

Download the latest verified stable `agentbridge-VERSION.tgz` from the GitHub releases. Replace VERSION below with that release version. Use Node 24.15 or later in the 24.x line (or another version supported by npm 12.2.0), then run these commands on your own machine:

```sh
npm install --global npm@12.2.0 --ignore-scripts --no-audit --no-fund
npm login
npm whoami
npm stage publish /absolute/path/to/agentbridge-VERSION.tgz --tag latest --access public --ignore-scripts
```

Check that `npm whoami` shows `viktorgerbert`, the intended npm owner. The name must still be available when staging. Staging a new package creates a public `0.0.0-stage` placeholder that claims the name; the candidate contents remain private until approval. Record the stage ID returned by npm.

This first local upload has no GitHub OIDC provenance. Later automated candidates obtain provenance when the repository is public. Do not claim provenance for a local bootstrap upload.

## 5. Configure the npm trusted publisher

Open the `agentbridge` package on npm and its **Settings/Trusted Publisher** section. Add a GitHub Actions publisher with these exact values:

| Field | Value |
| --- | --- |
| Organization or user | `vspdi` |
| Repository | `agentbridge` |
| Workflow filename | `release.yml` |
| Environment name | `npm-publish` |
| Stage publishing | Allowed |
| Direct `npm publish` | Disabled |
| Dist-tag management | Disabled |

Enter only `release.yml`, not its directory path. Under package publishing access, select **Require two-factor authentication and disallow tokens**. Remove obsolete publishing tokens. npm explicitly supports trusted staging with these restrictions.

## 6. Review and approve the first version

Review the candidate in npm's **Staged Packages** page, or use:

```sh
npm stage view STAGE_ID
npm stage download STAGE_ID
npm stage approve STAGE_ID
```

Confirm the package name, version, contents, and `latest` tag before approval. Approval requires npm 2FA. Staged versions reserve their version number, so reject an incorrect candidate before trying to stage the same version again.

## 7. Enable automated staging

After the workflow change is merged and both the environment and trusted publisher are configured, open GitHub **Settings → Secrets and variables → Actions → Variables**. Create a repository variable:

```text
NPM_PUBLISH_ENABLED=true
```

Future release-producing changes stage candidates after the full CI matrix passes. Approve the GitHub environment deployment if configured, then review and approve the staged candidate on npm with 2FA. `main` stages with `latest`; `dev` stages with `dev`. Rerunning a release with no new version creates no candidate and does not republish existing versions.

Keep semantic-release's `npmPublish: false`: the isolated staging job handles npm, while semantic-release creates tags, notes, and GitHub tarballs. Never add `NPM_TOKEN` or `NODE_AUTH_TOKEN` for publishing.

## Additional GitHub protection

- Keep required PRs, up-to-date CI, conversation resolution, no bypass, and no force pushes/deletions on main/dev.
- Set main's permitted PR merge method to **merge only** in a separate branch rule; dev needs squash and merge for features and history synchronization. Native rules cannot choose a dev PR's method based on its source branch. Strict enforcement of that distinction needs a dedicated merge app that is the only authorized merger.
- Enable Dependabot alerts and security updates. The checked-in bot configuration opens dependency and Action updates against dev; review them before merging.
- Enable secret scanning and push protection, CodeQL/code scanning, and dependency review where your plan permits. Private repository scanning may need GitHub Code Security/Secret Protection licenses; public repositories have broader free coverage. Do not assume unavailable controls are enabled.
- Add a second trusted reviewer before requiring code-owner approval or approval from someone other than the author. CODEOWNERS identifies release-sensitive files; it does not enforce approval by itself.
- Enable GitHub immutable releases after the initial release replacement is complete. Protect release tags against updates/deletion while allowing the release workflow to create new tags. GitHub release immutability and npm version immutability do not establish that code is benign.
- Keep default Actions workflow permission read-only and disable permission for Actions to create/approve PRs. Restrict allowed Actions to the ones used here and require full commit SHA pins where GitHub exposes that policy.

The npm owner still has authority to approve a malicious candidate. Staging helps against a compromised CI workflow only when you inspect what you approve and protect the owner account.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [npm staged publishing](https://docs.npmjs.com/staged-publishing/), [GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## Dependency audit limit

The publishing hardening updates Vitest to 4.1.11 and esbuild to 0.28.1, addressing their reported advisories. The bundled CLI has no install-time production dependencies; libraries are bundled during the build. One high-severity, unpatched `braces` denial-of-service advisory remains in semantic-release's development dependency tree. It concerns deeply nested glob patterns; the current release configuration uses fixed rules. Treat this as an unresolved build-tool risk, monitor its advisory, and review any change that introduces user-controlled release patterns. A clean production-dependency audit does not establish that bundled source or build dependencies are safe.
