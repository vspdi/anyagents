# Secure npm publishing setup

Package: `anyagents`. GitHub repository: `vspdi/anyagents`. Stable releases come from `main` with npm dist-tag `latest`; prereleases come from `dev` with dist-tag `dev`.

The Release workflow creates GitHub releases independently. When `NPM_PUBLISH_ENABLED` is `true`, a separate job stages the exact same tarball for npm. Only that job has OIDC permission. It has no source checkout, project dependency installation, or package lifecycle execution. All npm candidates require human approval with npm 2FA before becoming public.

## 1. Protect your accounts

Enable GitHub and npm 2FA using a security key or passkey where supported. Keep recovery codes offline. Use a small maintainer list and remove unused account tokens and app installations. Never send passwords, tokens, or recovery codes in chat.

## 2. Decide repository visibility

Trusted publishing can work from a private repository, but npm provenance requires a public repository. Make the repository public only after reviewing tracked files, Git history, release assets for private information. The workflow requests provenance for public repositories and disables it for private repositories.

GitHub environment required reviewers are available for public repositories on Free/Pro/Team; using them for private repositories requires Enterprise. Branch deployment restrictions should still be configured wherever your plan supports environments. npm's mandatory stage approval remains the final publishing gate.

## 3. Create the GitHub environment

In GitHub, open **Settings → Environments → New environment** and name it exactly `npm-publish`.

1. Under deployment branches and tags, choose **Selected branches and tags**.
2. Add branch rules for `main` and `dev`. Do not allow feature branches or all tags.
3. Add a required reviewer if your plan supports it. With a second trusted reviewer, enable **Prevent self-review** and disable administrator bypass. As a sole owner, leave self-review allowed so you can approve your own release jobs.
4. Do not add an npm token secret. Trusted publishing uses OIDC.

These protections must exist before enabling the publishing variable. npm must bind its publisher configuration to this exact environment name; leaving the npm environment field blank would remove an important restriction.

## 4. Configure the npm trusted publisher

Open the `anyagents` package on npm and its **Settings/Trusted Publisher** section. Add a GitHub Actions publisher with these exact values:

| Field | Value |
| --- | --- |
| Organization or user | `vspdi` |
| Repository | `anyagents` |
| Workflow filename | `release.yml` |
| Environment name | `npm-publish` |
| Stage publishing | Allowed |
| Direct `npm publish` | Disabled |
| Dist-tag management | Disabled |

Enter only `release.yml`, not its directory path. Under package publishing access, select **Require two-factor authentication and disallow tokens**. Remove obsolete publishing tokens. npm explicitly supports trusted staging with these restrictions.

## 5. Review and approve future candidates

After a release run on either `dev` or `main`, open its **Summary**. The staging job provides a clickable [npm package link](https://www.npmjs.com/package/anyagents), the version, channel, candidate ID, and tarball SHA-256. Open the package's **Staged Packages** tab, match that candidate, review its contents, and select **Approve** when ready. npm requires your 2FA at approval time; CI does not create a short-lived CLI authorization link or wait for your browser session. The workflow finishes successfully after staging, while npm publication remains pending.

For CLI approval, use npm 12.2.0 or later, sign in as the package owner (`viktorgerbert`), and run:

```sh
npm stage view STAGE_ID
npm stage download STAGE_ID
npm stage approve STAGE_ID
```

Confirm the package name, version, contents, and the intended tag (`latest` for `main`, `dev` for `dev`) before approval. Approval requires npm 2FA. Staged versions reserve their version number, so reject an incorrect candidate before trying to stage the same version again.

## 6. Enable automated staging

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
- Enable GitHub immutable releases for published release tags. Protect release tags against updates/deletion while allowing the release workflow to create new tags. GitHub release immutability and npm version immutability do not establish that code is benign.
- Keep default Actions workflow permission read-only and disable permission for Actions to create/approve PRs. Restrict allowed Actions to the ones used here and require full commit SHA pins where GitHub exposes that policy.

The npm owner still has authority to approve a malicious candidate. Staging helps against a compromised CI workflow only when you inspect what you approve and protect the owner account.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [npm staged publishing](https://docs.npmjs.com/staged-publishing/), [GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## Dependency audit limit

The bundled CLI has no install-time production dependencies; libraries are bundled during the build, so users' `npm audit` cannot see them. Run `pnpm audit` before each release: a fix in a bundled library (for example `ajv`'s `fast-uri`) only reaches users through a new release. `pnpm audit` reported no known vulnerabilities on October 24, 2026. A clean production-dependency audit does not establish that bundled source or build dependencies are safe.

## Repository maintenance

After a repository rename, update Git remotes, package repository metadata, release identity checks, and the npm trusted publisher together. Remove the old binding before enabling its replacement. Keep the workflow filename `release.yml`, environment `npm-publish`, and stage-only permissions. GitHub URL redirects do not update npm OIDC trust claims. Published npm versions retain their original metadata.
