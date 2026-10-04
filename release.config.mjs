export default {
  branches: ['main', { name: 'dev', channel: 'dev', prerelease: 'dev' }],
  tagFormat: 'v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
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
