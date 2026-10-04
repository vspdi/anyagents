export default {
  branches: ['main', { name: 'dev', channel: 'dev', prerelease: 'dev' }],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    [
      '@semantic-release/release-notes-generator',
      { preset: 'conventionalcommits' },
    ],
    [
      '@semantic-release/npm',
      { npmPublish: false, tarballDir: 'release-artifacts' },
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'release-artifacts/*.tgz', label: 'Installable npm package' },
        ],
        successComment: false,
        failComment: false,
        failTitle: false,
        releasedLabels: false,
      },
    ],
  ],
};
