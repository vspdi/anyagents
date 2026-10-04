import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import config from '../../release.config.mjs';
import { validFlow, validTitle } from '../../scripts/check-pr.mjs';

it('requires conventional titles, including scopes and breaking changes', () => {
  for (const title of [
    'feat(cli): add validation',
    'fix: repair drift',
    'feat!: change schema',
    'docs: document release',
  ])
    expect(validTitle(title)).toBe(true);
  for (const title of [
    'Update files',
    'feat: ',
    'feat: first\nsecond',
    'feature: add CLI',
  ])
    expect(validTitle(title)).toBe(false);
  expect(
    validFlow('dev', 'feature/test', 'vspdi/agentbridge', 'vspdi/agentbridge'),
  ).toBe(true);
  expect(
    validFlow('main', 'dev', 'vspdi/agentbridge', 'vspdi/agentbridge'),
  ).toBe(true);
  expect(
    validFlow('main', 'feature/test', 'vspdi/agentbridge', 'vspdi/agentbridge'),
  ).toBe(false);
  expect(
    validFlow('main', 'dev', 'attacker/omniagents', 'vspdi/agentbridge'),
  ).toBe(false);
});
it('keeps npm publication disabled while enabling stable and dev release channels', () => {
  expect(config.branches).toEqual([
    'main',
    { name: 'dev', channel: 'dev', prerelease: 'dev' },
  ]);
  const npm = config.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === '@semantic-release/npm',
  );
  expect(npm[1].npmPublish).toBe(false);
});
it('semantic-release computes 0.1.0-dev.1 and 0.1.0 from the baseline in a local Git remote', async () => {
  const { default: semanticRelease } = await import('semantic-release');
  const { PassThrough } = await import('node:stream');
  const directory = mkdtempSync(
    path.join(tmpdir(), 'omniagents-release-test-'),
  );
  const remote = path.join(directory, 'remote.git');
  const work = path.join(directory, 'work');
  mkdirSync(work);
  const git = (...args) =>
    execFileSync('git', args, { cwd: work, stdio: 'pipe' });
  try {
    git('init', '--bare', remote);
    git('--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git('init', '-b', 'main');
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release@example.invalid');
    writeFileSync(path.join(work, 'README.md'), 'baseline');
    git('add', '.');
    git('commit', '-m', 'chore: initialize repository');
    git('tag', 'v0.0.0');
    git('remote', 'add', 'origin', remote);
    git('push', 'origin', 'main', '--tags');
    git('checkout', '-b', 'dev');
    writeFileSync(path.join(work, 'feature'), 'feature');
    git('add', '.');
    git('commit', '-m', 'feat: implement v0.1');
    git('push', 'origin', 'dev');
    const options = {
      branches: config.branches,
      repositoryUrl: pathToFileURL(remote).href,
      dryRun: true,
      ci: false,
      plugins: [
        [
          path.resolve(
            'node_modules/@semantic-release/commit-analyzer/index.js',
          ),
          { preset: 'conventionalcommits' },
        ],
        [
          path.resolve(
            'node_modules/@semantic-release/release-notes-generator/index.js',
          ),
          { preset: 'conventionalcommits' },
        ],
      ],
    };
    const isolatedEnv = { ...process.env };
    for (const key of Object.keys(isolatedEnv))
      if (
        /^(CI$|GITHUB_|RUNNER_|GITLAB_|TRAVIS|CIRCLE|APPVEYOR|BUILDKITE|JENKINS|TF_BUILD)/.test(
          key,
        )
      )
        delete isolatedEnv[key];
    const context = {
      cwd: work,
      env: { ...isolatedEnv, GIT_TERMINAL_PROMPT: '0' },
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    };
    const prerelease = await semanticRelease(options, context);
    expect(prerelease.nextRelease.version).toBe('0.1.0-dev.1');
    git('checkout', 'main');
    git('merge', '--ff-only', 'dev');
    git('push', 'origin', 'main');
    const stable = await semanticRelease(options, context);
    expect(stable.nextRelease.version).toBe('0.1.0');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);

it('release analysis honors Conventional Commit breaking-change markers', async () => {
  const { analyzeCommits } = await import('@semantic-release/commit-analyzer');
  const ctx = {
    cwd: process.cwd(),
    logger: { log: () => {} },
    commits: [{ message: 'feat!: change public schema', hash: 'example' }],
  };
  expect(await analyzeCommits({ preset: 'conventionalcommits' }, ctx)).toBe(
    'major',
  );
  ctx.commits = [{ message: 'fix(cli): repair drift', hash: 'example' }];
  expect(await analyzeCommits({ preset: 'conventionalcommits' }, ctx)).toBe(
    'patch',
  );
});
