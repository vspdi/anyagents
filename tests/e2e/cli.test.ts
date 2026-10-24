import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

let root: string;
const cli = path.resolve('dist/cli.js');
const run = (...args: string[]) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    cwd: root,
    timeout: 10_000,
  });
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'anyagents-e2e-'));
  spawnSync('git', ['init'], { cwd: root });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
it('executes the complete bundled CLI workflow in a temporary Git repository', {
  timeout: 30_000,
}, async () => {
  const help = run('--help');
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toContain('Usage: anyagents');
  expect(help.stdout).not.toContain('agentbridge');
  const initialized = run('init', '--json');
  if (
    initialized.status !== 0 &&
    initialized.stderr.includes('LINK_UNSUPPORTED')
  ) {
    expect(JSON.parse(initialized.stderr).code).toBe('LINK_UNSUPPORTED');
    return;
  }
  expect(initialized.status, initialized.stderr).toBe(0);
  expect(run('check').status).toBe(0);
  expect(JSON.parse(run('apply', '--json').stdout).operations).toEqual([]);
  expect(JSON.parse(run('status', '--json').stdout).targets).toHaveLength(6);
  expect(JSON.parse(run('describe', '--json').stdout).source).toBe('.ai');
  const state = await fs.readFile(
    path.join(root, '.anyagents/state.json'),
    'utf8',
  );
  expect(run('doctor', '--json').status).toBe(0);
  expect(
    await fs.readFile(path.join(root, '.anyagents/state.json'), 'utf8'),
  ).toBe(state);
  for (const topic of [
    'concepts',
    'config',
    'skills',
    'mcp',
    'authoring',
    'ownership',
  ])
    expect(JSON.parse(run('explain', topic, '--json').stdout).topic).toBe(
      topic,
    );
  for (const target of ['claude', 'codex'])
    expect(run('explain', 'target', target).status).toBe(0);
  for (const topic of ['config', 'mcp', 'skill', 'all'])
    expect(JSON.parse(run('schema', topic).stdout)).toBeTruthy();
  for (const topic of ['config', 'skill', 'mcp-stdio', 'mcp-http'])
    expect(run('template', topic).status).toBe(0);
  await fs.writeFile(
    path.join(root, '.ai/mcp.yaml'),
    'version: 1\nmcp:\n  docs:\n    transport: http\n    url: https://example.invalid/mcp\n    headers:\n      Authorization: Bearer ${DOCS_TOKEN}\n',
  );
  expect(run('check').status).toBe(1);
  expect(run('apply').status).toBe(0);
  expect(run('check').status).toBe(0);
  expect(
    await fs.readFile(path.join(root, '.codex/config.toml'), 'utf8'),
  ).toContain('bearer_token_env_var');
  await fs.mkdir(path.join(root, '.ai/skills/review-change'));
  await fs.writeFile(
    path.join(root, '.ai/skills/review-change/SKILL.md'),
    '---\nname: review-change\ndescription: Review changes\n---\nRead diff.\n',
  );
  expect(run('apply').status).toBe(0);
  expect(run('check').status).toBe(0);
});
it('supports custom source scaffolding and refuses accidental reinitialization', {
  timeout: 30_000,
}, () => {
  expect(
    run('init', '--source', '.company-ai', '--target', 'codex', '--no-apply')
      .status,
  ).toBe(0);
  expect(run('init', '--source', '.company-ai', '--no-apply').status).toBe(1);
  expect(JSON.parse(run('describe', '--json').stdout).source).toBe(
    '.company-ai',
  );
});
it('has stable usage errors and JSON errors that do not expose secrets', {
  timeout: 30_000,
}, async () => {
  expect(run('schema', 'unknown').status).toBe(2);
  const bad = run('apply', '--config', 'missing.toml', '--json');
  expect(bad.status).toBe(1);
  expect(JSON.parse(bad.stderr).code).toBe('CONFIG_NOT_FOUND');
  await fs.writeFile(
    path.join(root, 'anyagents.yaml'),
    'version: SUPER_SECRET_SENTINEL\n',
  );
  const invalid = run('apply', '--json');
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).not.toContain('SUPER_SECRET_SENTINEL');
  expect(run('--help').status).toBe(0);
  expect(run('--version').stdout.trim()).toBe('0.1.0');
  for (const command of [
    'init',
    'apply',
    'status',
    'check',
    'doctor',
    'explain',
    'schema',
    'template',
    'describe',
  ])
    expect(run(command, '--help').status).toBe(0);
});

it('checks fresh checkouts read-only and strict warnings fail CI', {
  timeout: 30_000,
}, async () => {
  const initialized = run('init', '--json');
  if (
    initialized.status !== 0 &&
    initialized.stderr.includes('LINK_UNSUPPORTED')
  )
    return;
  expect(initialized.status, initialized.stderr).toBe(0);
  await fs.rm(path.join(root, '.anyagents'), { recursive: true });
  const checked = run('check', '--strict', '--json');
  expect(checked.status, checked.stderr || checked.stdout).toBe(0);
  expect(JSON.parse(checked.stdout).current).toBe(true);
  await expect(fs.stat(path.join(root, '.anyagents'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  await fs.appendFile(
    path.join(root, 'anyagents.yaml'),
    'unknown_option: true\n',
  );
  expect(run('check').status).toBe(0);
  const strict = run('check', '--strict', '--json');
  expect(strict.status).toBe(1);
  expect(JSON.parse(strict.stdout)).toMatchObject({
    current: false,
    warnings: ['Unknown config field: unknown_option'],
  });
  for (const topic of ['marketplaces', 'plugins', 'ci'])
    expect(run('explain', topic).status).toBe(0);
  for (const topic of ['marketplace', 'plugin'])
    expect(JSON.parse(run('schema', topic).stdout)).toBeTruthy();
  expect(
    await fs.readFile(
      path.join(root, '.ai/skills/anyagents-authoring/references/ci.md'),
      'utf8',
    ),
  ).toContain('check --strict');
});
it('explains failures: missing roots are usage errors and --verbose shows causes', async () => {
  const missing = run('check', '--cwd', path.join(root, 'missing'), '--json');
  expect(missing.status).toBe(2);
  expect(JSON.parse(missing.stderr).code).toBe('USAGE_ERROR');
  // Relative, so it resolves against the real project root even when the
  // temp directory sits behind a symlink (macOS /var, Windows short names).
  const config = 'config-dir';
  await fs.mkdir(path.join(root, config));
  const quiet = run('check', '--config', config, '--json');
  expect(quiet.status).toBe(1);
  expect(JSON.parse(quiet.stderr)).not.toHaveProperty('cause');
  const verbose = run('check', '--config', config, '--json', '--verbose');
  expect(JSON.parse(verbose.stderr)).toMatchObject({
    code: 'APPLY_FAILED',
    cause: expect.stringContaining('EISDIR'),
  });
  expect(run('--no-color', '--version').status).toBe(0);
  expect(run('--help').stdout).not.toContain('--no-color');
});
