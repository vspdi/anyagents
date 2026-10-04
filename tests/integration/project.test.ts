import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { context } from '../../src/core/context.js';
import { apply, plan } from '../../src/core/engine.js';
import { exists, files, sourceHash } from '../../src/core/filesystem.js';
import { init } from '../../src/core/init.js';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}));
let root: string;
let linkSupported = true;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'omniagents-test-'));
  try {
    await fs.writeFile(path.join(root, 'probe-source'), 'probe');
    await fs.symlink('probe-source', path.join(root, 'probe-link'));
  } catch {
    linkSupported = false;
  }
  await fs.rm(path.join(root, 'probe-source'), { force: true });
  await fs.rm(path.join(root, 'probe-link'), { force: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
const ctx = (extra = {}) => context({ cwd: root, ...extra });
async function setup() {
  await init(await ctx(), true);
}
async function ready() {
  await setup();
  if (!linkSupported) {
    await expect(apply(await ctx())).rejects.toMatchObject({
      code: 'LINK_UNSUPPORTED',
    });
    return false;
  }
  await apply(await ctx());
  return true;
}
it('initializes, links canonical assets, and makes second apply a true no-op', async () => {
  if (!(await ready())) return;
  expect((await plan(await ctx(), true)).issues).toEqual([]);
  const state = await fs.stat(path.join(root, '.omniagents/state.json'));
  expect((await apply(await ctx())).operations).toEqual([]);
  expect(
    (await fs.stat(path.join(root, '.omniagents/state.json'))).mtimeMs,
  ).toEqual(state.mtimeMs);
  expect(await fs.realpath(path.join(root, 'CLAUDE.md'))).toBe(
    path.join(root, '.ai/AGENTS.md'),
  );
  await fs.mkdir(path.join(root, '.ai/skills/new-skill'));
  await fs.writeFile(
    path.join(root, '.ai/skills/new-skill/SKILL.md'),
    '---\nname: new-skill\ndescription: New skill\n---\n',
  );
  expect(
    await fs.readFile(
      path.join(root, '.agents/skills/new-skill/SKILL.md'),
      'utf8',
    ),
  ).toContain('New skill');
});
it('resolves config-relative source, CLI precedence, and unknown field warnings', async () => {
  await fs.mkdir(path.join(root, 'settings'));
  await fs.writeFile(
    path.join(root, 'settings/config.toml'),
    'version=1\nunknown=true\n[source]\ndir="../canonical"\n[targets]\nclaude=false\ncodex=true\n',
  );
  const resolved = await ctx({ config: 'settings/config.toml' });
  expect(resolved.source).toBe(path.join(root, 'canonical'));
  expect(resolved.targets).toEqual(['codex']);
  expect(resolved.warnings).toHaveLength(1);
  const override = await ctx({
    config: 'settings/config.toml',
    source: 'override',
    target: ['claude'],
  });
  expect(override.source).toBe(path.join(root, 'override'));
  expect(override.targets).toEqual(['claude']);
  await expect(ctx({ source: '../escape' })).rejects.toThrow('inside');
  await expect(ctx({ source: '.git/ai' })).rejects.toThrow('reserved');
});
it('preflights both targets and refuses unmanaged outputs even with force', async () => {
  await setup();
  await fs.writeFile(path.join(root, 'AGENTS.md'), 'user content');
  await expect(apply(await ctx({ force: true }))).rejects.toMatchObject({
    code: 'DESTINATION_CONFLICT',
  });
  expect(await exists(path.join(root, 'CLAUDE.md'))).toBeNull();
  expect(await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe(
    'user content',
  );
});
it('never replaces a managed link that became an ordinary user file', async () => {
  if (!(await ready())) return;
  await fs.unlink(path.join(root, 'CLAUDE.md'));
  await fs.writeFile(path.join(root, 'CLAUDE.md'), 'user content');
  await expect(apply(await ctx({ force: true }))).rejects.toMatchObject({
    code: 'DESTINATION_CONFLICT',
  });
});
it('reports generated drift and force repairs only managed outputs', async () => {
  if (!(await ready())) return;
  await fs.writeFile(path.join(root, '.mcp.json'), '{}');
  expect((await plan(await ctx(), true)).issues.length).toBeGreaterThan(0);
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'OUTPUT_DRIFT',
  });
  await apply(await ctx({ force: true }));
  expect((await plan(await ctx(), true)).issues).toEqual([]);
});
it('preserves unrelated Codex config and removes only previously managed servers', async () => {
  await setup();
  await fs.mkdir(path.join(root, '.codex'));
  await fs.writeFile(
    path.join(root, '.codex/config.toml'),
    'model="user-model"\n[mcp_servers.user]\ncommand="user-server"\n',
  );
  await fs.writeFile(
    path.join(root, '.ai/mcp.toml'),
    'version=1\n[mcp.managed]\ntransport="stdio"\ncommand="node"\n',
  );
  if (!linkSupported) {
    await expect(apply(await ctx())).rejects.toMatchObject({
      code: 'LINK_UNSUPPORTED',
    });
    return;
  }
  await apply(await ctx());
  let output = parse(
    await fs.readFile(path.join(root, '.codex/config.toml'), 'utf8'),
  );
  expect(output.model).toBe('user-model');
  expect(output.mcp_servers).toEqual({
    user: { command: 'user-server' },
    managed: { command: 'node' },
  });
  await fs.appendFile(
    path.join(root, '.codex/config.toml'),
    '\n[unrelated]\nsetting=true\n',
  );
  expect((await plan(await ctx(), true)).issues).toEqual([]);
  await fs.writeFile(path.join(root, '.ai/mcp.toml'), 'version=1\n[mcp]\n');
  await apply(await ctx());
  output = parse(
    await fs.readFile(path.join(root, '.codex/config.toml'), 'utf8'),
  );
  expect(output.mcp_servers).toEqual({ user: { command: 'user-server' } });
  expect(output.unrelated).toEqual({ setting: true });
});
it('refuses collisions with unmanaged Codex entries but accepts identical cloned outputs', async () => {
  if (!(await ready())) return;
  await fs.writeFile(
    path.join(root, '.ai/mcp.toml'),
    'version=1\n[mcp.user]\ntransport="stdio"\ncommand="canonical"\n',
  );
  await fs.writeFile(
    path.join(root, '.codex/config.toml'),
    '[mcp_servers.user]\ncommand="different"\n',
  );
  await expect(apply(await ctx({ force: true }))).rejects.toMatchObject({
    code: 'DESTINATION_CONFLICT',
  });
  await fs.writeFile(path.join(root, '.codex/config.toml'), '');
  await apply(await ctx());
  await fs.rm(path.join(root, '.omniagents'), { recursive: true });
  await apply(await ctx());
  expect((await plan(await ctx(), true)).issues).toEqual([]);
});
it('dry-run and check are read-only', async () => {
  await setup();
  const before = await files(root);
  await apply(await ctx(), true);
  await plan(await ctx(), true);
  expect(await files(root)).toEqual(before);
  expect(await exists(path.join(root, '.omniagents'))).toBeNull();
});
it('refuses symlink traversal in sources, output parents, and ownership state', async () => {
  if (!linkSupported) return;
  await setup();
  await fs.mkdir(path.join(root, 'other'));
  await fs.symlink('other', path.join(root, '.codex'), 'dir');
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'DESTINATION_CONFLICT',
  });
  await fs.unlink(path.join(root, '.codex'));
  await fs.symlink('AGENTS.md', path.join(root, '.ai/skills/link'));
  await expect(apply(await ctx())).rejects.toThrow('ordinary directory');
});
it('rolls back outputs on a late write failure and releases the lock', async () => {
  if (!(await ready())) return;
  const before = await fs.readFile(path.join(root, '.mcp.json'), 'utf8');
  const stateBefore = await fs.readFile(
    path.join(root, '.omniagents/state.json'),
    'utf8',
  );
  await fs.writeFile(
    path.join(root, '.ai/mcp.toml'),
    'version=1\n[mcp.test]\ntransport="stdio"\ncommand="node"\n',
  );
  const originalRename = fs.rename;
  const spy = vi
    .spyOn(fs, 'rename')
    .mockImplementation(async (oldPath, newPath) => {
      if (String(newPath).endsWith('state.json'))
        throw new Error('simulated failure');
      return originalRename(oldPath, newPath);
    });
  await expect(apply(await ctx())).rejects.toThrow('simulated failure');
  spy.mockRestore();
  expect(await fs.readFile(path.join(root, '.mcp.json'), 'utf8')).toBe(before);
  expect(
    await fs.readFile(path.join(root, '.omniagents/state.json'), 'utf8'),
  ).toBe(stateBefore);
  expect(await exists(path.join(root, '.omniagents/apply.lock'))).toBeNull();
});
it('hashing is stable across traversal order and text line endings; binary bytes stay distinct', async () => {
  await fs.writeFile(path.join(root, 'a'), 'hello\r\nworld\r\n');
  await fs.writeFile(path.join(root, 'b'), Buffer.from([0, 13, 10]));
  const paths = [path.join(root, 'a'), path.join(root, 'b')];
  const first = await sourceHash(root, paths, '0.1.0');
  await fs.writeFile(paths[0], 'hello\nworld\n');
  expect(await sourceHash(root, [...paths].reverse(), '0.1.0')).toBe(first);
  await fs.writeFile(paths[1], Buffer.from([0, 10]));
  expect(await sourceHash(root, paths, '0.1.0')).not.toBe(first);
});

it('preflight conflicts leave no ownership directory and managed writes retain file permissions', async () => {
  await setup();
  await fs.writeFile(path.join(root, 'CLAUDE.md'), 'user content');
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'DESTINATION_CONFLICT',
  });
  expect(await exists(path.join(root, '.omniagents'))).toBeNull();
  await fs.rm(path.join(root, 'CLAUDE.md'));
  if (!linkSupported) return;
  await apply(await ctx());
  if (process.platform === 'win32') return;
  const codex = path.join(root, '.codex/config.toml');
  await fs.chmod(codex, 0o600);
  await fs.writeFile(
    path.join(root, '.ai/mcp.toml'),
    'version=1\n[mcp.test]\ntransport="stdio"\ncommand="node"\n',
  );
  await apply(await ctx());
  expect((await fs.stat(codex)).mode & 0o777).toBe(0o600);
});
