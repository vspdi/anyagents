# Installation alternatives

The usual installation is [npm through npx](../README.md#quick-start). Node.js 20 or later is required. Windows also needs symlink privileges, normally enabled through Developer Mode.

## Install a release tarball

Download `anyagents-VERSION.tgz` from [GitHub releases](https://github.com/vspdi/anyagents/releases). Replace VERSION with the release version and use the absolute path to the downloaded file. In the repository you want to configure, run:

```sh
npx --yes --package=/absolute/path/to/anyagents-VERSION.tgz anyagents init
npx --yes --package=/absolute/path/to/anyagents-VERSION.tgz anyagents check
```

After editing the shared sources, run:

```sh
npx --yes --package=/absolute/path/to/anyagents-VERSION.tgz anyagents apply
```

The `anyagents` executable starts with version 0.1.1. The historical 0.1.0 tarball uses `agentbridge`; substitute that executable name only when installing that old version explicitly.

## Build from source

Clone [vspdi/anyagents](https://github.com/vspdi/anyagents), then run these commands inside its checkout with pnpm 10.17.1:

```sh
pnpm install --frozen-lockfile
pnpm build
npm pack --ignore-scripts
```

Use the resulting tarball as shown above. The package bundles its runtime libraries and has no production dependency installs.
