import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { parse as parseYaml, stringify } from 'yaml';
import { context, type Options } from '../../src/core/context.js';
import { apply, plan } from '../../src/core/engine.js';
import { exists } from '../../src/core/filesystem.js';
import { init } from '../../src/core/init.js';

let root: string;
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'anyagents-targets-')),
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
const ctx = (extra: Options = {}) => context({ cwd: root, ...extra });
const put = (name: string, data: string) =>
  fs.writeFile(path.join(root, name), data);
const read = (name: string) => fs.readFile(path.join(root, name), 'utf8');
const readJson = async (name: string) => JSON.parse(await read(name));
/** Scaffolds a project that enables exactly the given targets. */
const scaffold = async (target: string[]) =>
  init(await context({ cwd: root, target }), true);
interface ProjectConfig {
  targets: Record<string, boolean>;
  opencode: { schema: string };
}
const configure = async (patch: (config: ProjectConfig) => void) => {
  const config = parseYaml(await read('anyagents.yaml'));
  patch(config);
  await put('anyagents.yaml', stringify(config));
};
const docs = {
  transport: 'http',
  url: 'https://example.com/mcp',
  headers: { Authorization: 'Bearer ${DOCS_TOKEN}' },
};
const local = {
  transport: 'stdio',
  command: 'node',
  args: ['server.js'],
  env: { TOKEN: '${TOKEN}' },
};
const servers = (value: Record<string, unknown>) =>
  put('.ai/mcp.yaml', stringify({ version: 1, mcp: value }));
const opencodeDocs = {
  type: 'remote',
  url: 'https://example.com/mcp',
  headers: { Authorization: 'Bearer {env:DOCS_TOKEN}' },
};
const opencodeLocal = {
  type: 'local',
  command: ['node', 'server.js'],
  environment: { TOKEN: '{env:TOKEN}' },
};

it('keeps Claude and Codex as the only default targets', async () => {
  await init(await ctx(), true);
  expect((await ctx()).targets).toEqual(['claude', 'codex']);
  await servers({ docs });
  await apply(await ctx());
  expect(await exists(path.join(root, 'opencode.json'))).toBeNull();
  expect(await readJson('.mcp.json')).toHaveProperty('mcpServers.docs');
});
it('plans destinations shared by several targets once and writes each MCP layout', async () => {
  await scaffold(['all']);
  await servers({ docs, local });
  const dry = await apply(await ctx(), true);
  const destinations = dry.operations.map((op) => op.destination);
  expect(new Set(destinations).size).toBe(destinations.length);
  expect(destinations).toEqual(
    expect.arrayContaining([
      'CLAUDE.md',
      'AGENTS.md',
      '.claude/skills',
      '.agents/skills',
      '.mcp.json',
      'opencode.json',
      '.codex/config.toml',
    ]),
  );
  await apply(await ctx());
  expect(await fs.realpath(path.join(root, 'AGENTS.md'))).toBe(
    path.join(root, '.ai/AGENTS.md'),
  );
  expect(await readJson('.mcp.json')).toEqual({
    mcpServers: {
      docs: {
        type: 'http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer ${DOCS_TOKEN}' },
      },
      local: {
        command: 'node',
        args: ['server.js'],
        env: { TOKEN: '${TOKEN}' },
      },
    },
  });
  expect(await readJson('opencode.json')).toEqual({
    $schema: 'https://opencode.ai/config.json',
    mcp: { servers: { docs: opencodeDocs, local: opencodeLocal } },
  });
  expect((await apply(await ctx())).operations).toEqual([]);
  expect((await plan(await ctx(), true)).issues).toEqual([]);
  await fs.rm(path.join(root, '.anyagents'), { recursive: true });
  expect((await plan(await ctx(), true)).issues).toEqual([]);
});
it('creates no opencode.json while there is nothing to write', async () => {
  await scaffold(['opencode']);
  await apply(await ctx());
  expect(await exists(path.join(root, 'opencode.json'))).toBeNull();
  expect((await plan(await ctx(), true)).issues).toEqual([]);
});
it('keeps user settings and comments in opencode.json and removes only managed servers', async () => {
  await scaffold(['opencode']);
  await put(
    'opencode.json',
    '// user settings\n{\n  "model": "anthropic/claude-sonnet-5-5", // keep\n  "mcp": {\n    "servers": {\n      "mine": { "type": "remote", "url": "https://mine.example" }\n    }\n  }\n}\n',
  );
  await servers({ docs });
  await apply(await ctx());
  const edited = await read('opencode.json');
  expect(edited).toContain('// user settings');
  expect(edited).toContain('// keep');
  expect(parseJsonc(edited)).toEqual({
    model: 'anthropic/claude-sonnet-5-5',
    mcp: {
      servers: {
        mine: { type: 'remote', url: 'https://mine.example' },
        docs: opencodeDocs,
      },
    },
  });
  expect((await plan(await ctx(), true)).issues).toEqual([]);
  await servers({});
  await apply(await ctx());
  const removed = await read('opencode.json');
  expect(removed).toContain('// keep');
  expect(parseJsonc(removed)).toEqual({
    model: 'anthropic/claude-sonnet-5-5',
    mcp: { servers: { mine: { type: 'remote', url: 'https://mine.example' } } },
  });
});
it('removes an emptied mcp object it created', async () => {
  await scaffold(['opencode']);
  await servers({ docs });
  await apply(await ctx());
  await servers({});
  await apply(await ctx());
  expect(await readJson('opencode.json')).toEqual({
    $schema: 'https://opencode.ai/config.json',
  });
});
it('writes the OpenCode 1 layout and migrates managed entries when the schema changes', async () => {
  await scaffold(['opencode']);
  await configure((config) => {
    config.opencode.schema = 'v1';
  });
  await servers({ docs });
  await apply(await ctx());
  expect((await readJson('opencode.json')).mcp).toEqual({ docs: opencodeDocs });
  await configure((config) => {
    config.opencode.schema = 'v2';
  });
  expect((await plan(await ctx(), true)).issues.length).toBeGreaterThan(0);
  await apply(await ctx());
  expect((await readJson('opencode.json')).mcp).toEqual({
    servers: { docs: opencodeDocs },
  });
  expect((await plan(await ctx(), true)).issues).toEqual([]);
});
it('refuses unmanaged and invalid OpenCode config even with force', async () => {
  await scaffold(['opencode']);
  await servers({ docs });
  await put(
    'opencode.json',
    JSON.stringify({
      mcp: { servers: { docs: { type: 'remote', url: 'https://mine' } } },
    }),
  );
  await expect(apply(await ctx({ force: true }))).rejects.toMatchObject({
    code: 'DESTINATION_CONFLICT',
  });
  await put('opencode.json', '{ "mcp": ');
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'CONFIG_INVALID',
  });
  await put('opencode.json', '{ "mcp": { "servers": "oops" } }');
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'CONFIG_INVALID',
  });
});
it('reports edited managed OpenCode entries as drift that force repairs', async () => {
  await scaffold(['opencode']);
  await servers({ docs });
  await apply(await ctx());
  const config = await readJson('opencode.json');
  config.mcp.servers.docs.url = 'https://changed.example';
  await put('opencode.json', JSON.stringify(config));
  expect((await plan(await ctx(), true)).issues.length).toBeGreaterThan(0);
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'OUTPUT_DRIFT',
  });
  await apply(await ctx({ force: true }));
  expect((await readJson('opencode.json')).mcp.servers.docs).toEqual(
    opencodeDocs,
  );
});
it('edits an existing opencode.jsonc unless opencode.json exists', async () => {
  await scaffold(['opencode']);
  await servers({ docs });
  await put('opencode.jsonc', '{\n  // mine\n  "model": "x"\n}\n');
  await apply(await ctx());
  expect(await exists(path.join(root, 'opencode.json'))).toBeNull();
  expect(await read('opencode.jsonc')).toContain('// mine');
  expect(parseJsonc(await read('opencode.jsonc')).mcp.servers.docs).toEqual(
    opencodeDocs,
  );
  expect((await plan(await ctx(), true)).issues).toEqual([]);
});
it('rejects canonical servers OpenCode cannot express before writing anything', async () => {
  await scaffold(['opencode']);
  await servers({
    docs: { ...docs, headers: { Region: '${REGION:-eu}' } },
  });
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'CANONICAL_MCP_INVALID',
  });
  expect(await exists(path.join(root, 'AGENTS.md'))).toBeNull();
  expect(await exists(path.join(root, 'opencode.json'))).toBeNull();
});
it('links Copilot to the shared files and writes the portable .mcp.json', async () => {
  await scaffold(['copilot']);
  await servers({ docs });
  await apply(await ctx());
  expect(await exists(path.join(root, 'CLAUDE.md'))).toBeNull();
  expect(await fs.realpath(path.join(root, 'AGENTS.md'))).toBe(
    path.join(root, '.ai/AGENTS.md'),
  );
  expect(await fs.realpath(path.join(root, '.agents/skills'))).toBe(
    path.join(root, '.ai/skills'),
  );
  expect((await readJson('.mcp.json')).mcpServers.docs.type).toBe('http');
  expect((await plan(await ctx(), true)).issues).toEqual([]);
});
it('rejects what Copilot cannot express before writing anything', async () => {
  await scaffold(['copilot']);
  await servers({ docs: { ...docs, url: 'https://${HOST}/mcp' } });
  await expect(apply(await ctx())).rejects.toThrow('Copilot cannot expand URL');
  await servers({ local: { ...local, cwd: 'tools' } });
  await expect(apply(await ctx())).rejects.toThrow('Copilot project MCP');
  expect(await exists(path.join(root, '.mcp.json'))).toBeNull();
});
it('adopts the shared .mcp.json when Copilot is enabled after Claude', async () => {
  await scaffold(['claude']);
  await servers({ docs });
  await apply(await ctx());
  const before = await read('.mcp.json');
  await configure((config) => {
    config.targets.copilot = true;
  });
  const result = await apply(await ctx());
  expect(result.operations.map((op) => op.destination)).not.toContain(
    '.mcp.json',
  );
  expect(await read('.mcp.json')).toBe(before);
  expect((await plan(await ctx(), true)).issues).toEqual([]);
  await put('.mcp.json', '{}');
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'OUTPUT_DRIFT',
  });
  await apply(await ctx({ force: true }));
  expect((await plan(await ctx(), true)).issues).toEqual([]);
});
it('still refuses an unmanaged file at a shared destination', async () => {
  await scaffold(['claude', 'copilot']);
  await put('.mcp.json', '{"mcpServers":{"mine":{"command":"x"}}}');
  await expect(apply(await ctx({ force: true }))).rejects.toMatchObject({
    code: 'DESTINATION_CONFLICT',
  });
  expect(await read('.mcp.json')).toContain('mine');
});
