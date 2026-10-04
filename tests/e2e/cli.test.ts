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
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'omniagents-e2e-'));
  spawnSync('git', ['init'], { cwd: root });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
// Hosted Windows runners need time for the many separate Node processes below.
it(
  'executes the complete bundled CLI workflow in a temporary Git repository',
  { timeout: 30_000 },
  async () => {
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
      path.join(root, '.omniagents/state.json'),
      'utf8',
    );
    expect(run('doctor', '--json').status).toBe(0);
    expect(
      await fs.readFile(path.join(root, '.omniagents/state.json'), 'utf8'),
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
      path.join(root, '.ai/mcp.toml'),
      'version=1\n[mcp.docs]\ntransport="http"\nurl="https://example.invalid/mcp"\nheaders={Authorization="Bearer ${DOCS_TOKEN}"}\n',
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
  },
);
it(
  'supports custom source scaffolding and refuses accidental reinitialization',
  { timeout: 30_000 },
  () => {
    expect(
      run('init', '--source', '.company-ai', '--target', 'codex', '--no-apply')
        .status,
    ).toBe(0);
    expect(run('init', '--source', '.company-ai', '--no-apply').status).toBe(1);
    expect(JSON.parse(run('describe', '--json').stdout).source).toBe(
      '.company-ai',
    );
  },
);
it(
  'has stable usage errors and JSON errors that do not expose secrets',
  { timeout: 30_000 },
  async () => {
    expect(run('schema', 'unknown').status).toBe(2);
    const bad = run('apply', '--config', 'missing.toml', '--json');
    expect(bad.status).toBe(1);
    expect(JSON.parse(bad.stderr).code).toBe('CONFIG_NOT_FOUND');
    await fs.writeFile(
      path.join(root, 'omniagents.toml'),
      'version="SUPER_SECRET_SENTINEL"',
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
  },
);
