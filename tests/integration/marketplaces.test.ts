import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import { context } from '../../src/core/context.js';
import { apply, plan } from '../../src/core/engine.js';
import { exists, files } from '../../src/core/filesystem.js';

vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
}));
let root: string;
const put = async (name: string, data: string | Buffer) => {
  const filename = path.join(root, name);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, data);
};
const read = (name: string) => fs.readFile(path.join(root, name), 'utf8');
const config = (
  marketplaces = { personal: { source: '.ai/marketplace.yaml', output: '.' } },
) =>
  put(
    'anyagents.yaml',
    stringify({ version: 1, project: false, marketplaces }),
  );
const catalog = {
  version: 1,
  owner: { name: 'Team' },
  plugins: {
    review: {
      source: { kind: 'local', path: './plugins/review' },
      detail: {
        codex: {
          category: 'Productivity',
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        },
      },
    },
  },
};
const plugin = {
  version: 1,
  release: '1.2.3',
  description: 'Review code',
  author: { name: 'Team' },
};
const ctx = (extra = {}) => context({ cwd: root, ...extra });
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'anyagents-marketplaces-')),
  );
  await config();
  await put('.ai/marketplace.yaml', stringify(catalog));
  await put('.ai/plugins/review/plugin.yaml', stringify(plugin));
  await put(
    '.ai/plugins/review/skills/review/SKILL.md',
    '---\nname: review\ndescription: Review code\n---\nReview it.\n',
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
it('generates isolated native catalogs, manifests, skills and MCP with explicit policy', async () => {
  await put('.ai/mcp.yaml', 'invalid project MCP is not loaded');
  await put(
    '.ai/plugins/review/scripts/server.js',
    'process.stdout.write("ok");',
  );
  await put(
    '.ai/plugins/review/mcp.yaml',
    stringify({
      version: 1,
      mcp: {
        docs: {
          transport: 'stdio',
          command: 'node',
          args: ['${PLUGIN_ROOT}/scripts/server.js'],
        },
      },
    }),
  );
  await apply(await ctx());
  const claude = JSON.parse(await read('.claude-plugin/marketplace.json'));
  const codex = JSON.parse(await read('.agents/plugins/marketplace.json'));
  expect(claude).toMatchObject({
    name: 'personal',
    owner: { name: 'Team' },
    plugins: [{ name: 'review', source: './plugins/claude/review' }],
  });
  expect(codex.plugins[0]).toEqual({
    name: 'review',
    source: { source: 'local', path: './plugins/codex/review' },
    ...catalog.plugins.review.detail.codex,
  });
  expect(
    JSON.parse(await read('plugins/codex/review/plugin.json')),
  ).toMatchObject({
    name: 'review',
    version: '1.2.3',
    author: { name: 'Team' },
  });
  expect(await read('plugins/claude/review/.mcp.json')).toContain(
    '${CLAUDE_PLUGIN_ROOT}/scripts/server.js',
  );
  expect(await read('plugins/codex/review/mcp.json')).toContain(
    '${PLUGIN_ROOT}/scripts/server.js',
  );
  expect(await exists(path.join(root, '.mcp.json'))).toBeNull();
  expect((await plan(await ctx(), true)).issues).toEqual([]);
  const state = (await fs.stat(path.join(root, '.anyagents/state.json')))
    .mtimeMs;
  expect((await apply(await ctx())).operations).toEqual([]);
  expect(
    (await fs.stat(path.join(root, '.anyagents/state.json'))).mtimeMs,
  ).toBe(state);
});
it('checks a fresh checkout without state and without writes, but detects stale output', async () => {
  await apply(await ctx());
  await fs.rm(path.join(root, '.anyagents'), { recursive: true });
  const before = await files(root);
  expect((await plan(await ctx(), true)).issues).toEqual([]);
  expect(await files(root)).toEqual(before);
  expect(await exists(path.join(root, '.anyagents'))).toBeNull();
  await put('plugins/codex/review/plugin.json', '{}');
  expect((await plan(await ctx(), true)).issues).toContainEqual(
    expect.objectContaining({
      code: 'OUTPUT_DRIFT',
      path: 'plugins/codex/review/plugin.json',
    }),
  );
});
it('resolves nested config and catalog paths and shares sources between multiple marketplaces', async () => {
  await put(
    'settings/project.yaml',
    stringify({
      version: 1,
      project: false,
      marketplaces: {
        one: {
          source: '../.ai/marketplace.yaml',
          output: '../marketplaces/one',
        },
        two: {
          source: '../.ai/marketplace.yaml',
          output: '../marketplaces/two',
        },
      },
    }),
  );
  await apply(await ctx({ config: 'settings/project.yaml' }));
  expect(
    JSON.parse(await read('marketplaces/one/.claude-plugin/marketplace.json'))
      .name,
  ).toBe('one');
  expect(
    JSON.parse(await read('marketplaces/two/.claude-plugin/marketplace.json'))
      .name,
  ).toBe('two');
  expect(
    (await plan(await ctx({ config: 'settings/project.yaml' }), true)).issues,
  ).toEqual([]);
});
it('preserves binary assets and validates native detail references', async () => {
  const bytes = Buffer.from([0, 255, 128, 13, 10]);
  await put('.ai/plugins/review/assets/logo.png', bytes);
  await put(
    '.ai/plugins/review/plugin.yaml',
    stringify({
      ...plugin,
      detail: {
        codex: {
          interface: { logo: './assets/logo.png', displayName: 'Review' },
        },
      },
    }),
  );
  await apply(await ctx());
  expect(
    await fs.readFile(path.join(root, 'plugins/codex/review/assets/logo.png')),
  ).toEqual(bytes);
  expect(
    JSON.parse(await read('plugins/codex/review/plugin.json')).extensions[
      'com.openai'
    ].interface.logo,
  ).toBe('./assets/logo.png');
  await fs.unlink(path.join(root, '.ai/plugins/review/assets/logo.png'));
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'SOURCE_NOT_FOUND',
  });
});
it('rejects unknown details, identity overrides and invalid policy before mutation', async () => {
  for (const detail of [
    { codex: { categorry: 'typo' } },
    { claude: { name: 'other' } },
    {
      codex: {
        category: 'Productivity',
        policy: { installation: 'SURPRISE', authentication: 'ON_INSTALL' },
      },
    },
  ]) {
    await put(
      '.ai/marketplace.yaml',
      stringify({
        ...catalog,
        plugins: { review: { ...catalog.plugins.review, detail } },
      }),
    );
    await expect(apply(await ctx())).rejects.toMatchObject({
      code: 'MARKETPLACE_INVALID',
      path: path.join(root, '.ai/marketplace.yaml'),
    });
    expect(await exists(path.join(root, '.anyagents'))).toBeNull();
  }
});
it('rejects duplicate YAML keys and aliases', async () => {
  for (const source of [
    'version: 1\nversion: 1\n',
    'version: 1\nowner: &x {name: Team}\nplugins: *x\n',
  ]) {
    await put('.ai/marketplace.yaml', source);
    await expect(apply(await ctx())).rejects.toMatchObject({
      code: 'MARKETPLACE_INVALID',
    });
  }
});
it('rejects root overlaps, escaping sources and overwriting canonical sources', async () => {
  await config({
    personal: { source: '.ai/marketplace.yaml', output: '.' },
    nested: { source: '.ai/marketplace.yaml', output: 'nested' },
  } as Parameters<typeof config>[0]);
  await expect(apply(await ctx())).rejects.toThrow('overlap');
  await config({ personal: { source: '../outside.yaml', output: '.' } });
  await expect(apply(await ctx())).rejects.toThrow('inside');
  await config({ personal: { source: '.ai/marketplace.yaml', output: '.ai' } });
  await expect(apply(await ctx())).rejects.toThrow('overlap');
});
it('refuses unmanaged files even with force and detects unexpected bundle files without state', async () => {
  await put('.claude-plugin/marketplace.json', 'user content');
  await expect(apply(await ctx({ force: true }))).rejects.toMatchObject({
    code: 'DESTINATION_CONFLICT',
  });
  await fs.unlink(path.join(root, '.claude-plugin/marketplace.json'));
  await apply(await ctx());
  await fs.rm(path.join(root, '.anyagents'), { recursive: true });
  await put('plugins/codex/review/extra.txt', 'unexpected');
  expect((await plan(await ctx(), true)).issues).toContainEqual(
    expect.objectContaining({ code: 'DESTINATION_CONFLICT' }),
  );
});
it('removes obsolete owned artifacts and protects edited obsolete files', async () => {
  await put('.ai/plugins/review/assets/file.txt', 'original');
  await apply(await ctx());
  await fs.unlink(path.join(root, '.ai/plugins/review/assets/file.txt'));
  await put('plugins/claude/review/assets/file.txt', 'user edits');
  await expect(apply(await ctx({ force: true }))).rejects.toMatchObject({
    code: 'DESTINATION_CONFLICT',
  });
  await put('plugins/claude/review/assets/file.txt', 'original');
  await apply(await ctx());
  expect(
    await exists(path.join(root, 'plugins/claude/review/assets/file.txt')),
  ).toBeNull();
  expect((await plan(await ctx(), true)).issues).toEqual([]);
});
it('keeps unselected target outputs intact', async () => {
  await apply(await ctx());
  const before = await read('plugins/claude/review/.claude-plugin/plugin.json');
  await put(
    '.ai/plugins/review/plugin.yaml',
    stringify({ ...plugin, release: '1.2.4' }),
  );
  await apply(await ctx({ target: ['codex'] }));
  expect(await read('plugins/claude/review/.claude-plugin/plugin.json')).toBe(
    before,
  );
  expect(
    JSON.parse(await read('plugins/codex/review/plugin.json')).version,
  ).toBe('1.2.4');
  expect((await plan(await ctx(), true)).issues.length).toBeGreaterThan(0);
});
it('restores copied assets, removed artifacts and state after late write failure', async () => {
  await put('.ai/plugins/review/assets/old.bin', Buffer.from([0, 255]));
  await apply(await ctx());
  const state = await read('.anyagents/state.json');
  const before = await read('plugins/codex/review/plugin.json');
  await fs.unlink(path.join(root, '.ai/plugins/review/assets/old.bin'));
  await put(
    '.ai/plugins/review/plugin.yaml',
    stringify({ ...plugin, release: '1.2.4' }),
  );
  const original = fs.rename;
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to).endsWith('state.json')) throw new Error('simulated failure');
    return original(from, to);
  });
  await expect(apply(await ctx())).rejects.toThrow('simulated failure');
  expect(await read('.anyagents/state.json')).toBe(state);
  expect(await read('plugins/codex/review/plugin.json')).toBe(before);
  expect(
    await fs.readFile(path.join(root, 'plugins/claude/review/assets/old.bin')),
  ).toEqual(Buffer.from([0, 255]));
  expect(await exists(path.join(root, '.anyagents/apply.lock'))).toBeNull();
});
it('validates hooks and references without executing them', async () => {
  await put(
    '.ai/plugins/review/plugin.yaml',
    stringify({
      ...plugin,
      detail: { claude: { hooks: './hooks/start.json' } },
    }),
  );
  await put(
    '.ai/plugins/review/hooks/start.json',
    JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'never-execute-this' }] },
        ],
      },
    }),
  );
  await apply(await ctx());
  await put(
    '.ai/plugins/review/hooks/start.json',
    JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 4 }] }] },
    }),
  );
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'MARKETPLACE_INVALID',
  });
});
it('rejects paths outside the plugin in details and MCP', async () => {
  await put(
    '.ai/plugins/review/plugin.yaml',
    stringify({
      ...plugin,
      detail: { codex: { interface: { logo: '../outside.png' } } },
    }),
  );
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'MARKETPLACE_INVALID',
  });
  await put('.ai/plugins/review/plugin.yaml', stringify(plugin));
  await put(
    '.ai/plugins/review/mcp.yaml',
    stringify({
      version: 1,
      mcp: {
        server: {
          transport: 'stdio',
          command: 'node',
          args: ['${PLUGIN_ROOT}/../escape.js'],
        },
      },
    }),
  );
  await expect(apply(await ctx())).rejects.toMatchObject({
    code: 'MARKETPLACE_INVALID',
  });
});

it('omits explicitly disabled plugin MCP servers in both native formats', async () => {
  await put(
    '.ai/plugins/review/mcp.yaml',
    stringify({
      version: 1,
      mcp: {
        disabled: {
          transport: 'stdio',
          command: 'never-run-disabled',
          enabled: false,
        },
      },
    }),
  );
  await apply(await ctx());
  expect(
    JSON.parse(await read('plugins/claude/review/.mcp.json')).mcpServers,
  ).toEqual({});
  expect(
    JSON.parse(await read('plugins/codex/review/mcp.json')).mcpServers,
  ).toEqual({});
});
it('requires Markdown agent files and file-valued interface assets', async () => {
  await put('.ai/plugins/review/agents/reviewer.md', 'Review code');
  for (const detail of [
    { claude: { agents: ['./agents'] } },
    { claude: { agents: ['./agents/reviewer.json'] } },
    { codex: { interface: { logo: './agents' } } },
  ]) {
    await put(
      '.ai/plugins/review/plugin.yaml',
      stringify({ ...plugin, detail }),
    );
    await expect(apply(await ctx())).rejects.toMatchObject({
      code: 'MARKETPLACE_INVALID',
    });
  }
  await put(
    '.ai/plugins/review/plugin.yaml',
    stringify({
      ...plugin,
      detail: { claude: { agents: ['./agents/reviewer.md'] } },
    }),
  );
  await apply(await ctx());
  expect(
    JSON.parse(await read('plugins/claude/review/.claude-plugin/plugin.json'))
      .agents,
  ).toEqual(['./agents/reviewer.md']);
});
it('accepts CRLF text checkouts without writes while preserving binary drift checks', async () => {
  await put('.ai/plugins/review/assets/logo.bin', Buffer.from([0, 13, 10]));
  await apply(await ctx());
  await fs.rm(path.join(root, '.anyagents'), { recursive: true });
  for (const filename of [
    '.claude-plugin/marketplace.json',
    '.agents/plugins/marketplace.json',
    'plugins/codex/review/plugin.json',
    'plugins/claude/review/skills/review/SKILL.md',
  ]) {
    await put(filename, (await read(filename)).replace(/\n/g, '\r\n'));
  }
  expect((await plan(await ctx(), true)).issues).toEqual([]);
  await put('plugins/codex/review/assets/logo.bin', Buffer.from([0, 10]));
  expect((await plan(await ctx(), true)).issues).toContainEqual(
    expect.objectContaining({
      path: 'plugins/codex/review/assets/logo.bin',
      code: 'OUTPUT_DRIFT',
    }),
  );
});

it('preserves desired artifacts across case-only Windows output changes', async () => {
  if (process.platform !== 'win32') return;
  await config({
    personal: { source: '.ai/marketplace.yaml', output: 'out/one' },
  });
  await apply(await ctx());
  await config({
    personal: { source: '.ai/marketplace.yaml', output: 'OUT/one' },
  });
  const changed = await apply(await ctx());
  expect(
    changed.operations.filter((operation) => operation.kind === 'remove'),
  ).toEqual([]);
  expect((await plan(await ctx(), true)).issues).toEqual([]);
  await put(
    '.ai/plugins/review/plugin.yaml',
    stringify({ ...plugin, release: '1.2.5' }),
  );
  await config({
    personal: { source: '.ai/marketplace.yaml', output: 'out/ONE' },
  });
  await apply(await ctx());
  expect(
    JSON.parse(await read('out/one/plugins/codex/review/plugin.json')).version,
  ).toBe('1.2.5');
  expect((await plan(await ctx(), true)).issues).toEqual([]);
});

const pluginMcp = stringify({
  version: 1,
  mcp: {
    docs: {
      transport: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer ${DOCS_TOKEN}' },
    },
    runner: {
      transport: 'stdio',
      command: 'node',
      args: ['${PLUGIN_ROOT}/scripts/server.js'],
      env: { TOKEN: '${TOKEN}' },
    },
  },
});
const withExtras = async () => {
  await put('.ai/plugins/review/mcp.yaml', pluginMcp);
  await put(
    '.ai/plugins/review/scripts/server.js',
    'process.stdout.write("ok");',
  );
  await put('.ai/plugins/review/hooks/hooks.json', '{"hooks":{}}');
  await put('.ai/plugins/review/agents/helper.md', 'Helper.\n');
};
it('generates a Copilot catalog and Agent Plugins bundle that leaves out unmapped components', async () => {
  await put(
    '.ai/marketplace.yaml',
    stringify({
      ...catalog,
      description: 'Team tools',
      plugins: {
        review: {
          ...catalog.plugins.review,
          detail: {
            ...catalog.plugins.review.detail,
            copilot: { category: 'Testing' },
          },
        },
      },
    }),
  );
  await withExtras();
  const resolved = await ctx({ target: ['copilot'] });
  await apply(resolved);
  expect(JSON.parse(await read('.github/plugin/marketplace.json'))).toEqual({
    name: 'personal',
    owner: { name: 'Team' },
    metadata: { description: 'Team tools' },
    plugins: [
      {
        name: 'review',
        source: './plugins/copilot/review',
        category: 'Testing',
      },
    ],
  });
  expect(
    JSON.parse(await read('plugins/copilot/review/plugin.json')),
  ).toMatchObject({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'review',
    version: '1.2.3',
  });
  expect(
    JSON.parse(await read('plugins/copilot/review/mcp.json')).mcpServers,
  ).toEqual({
    docs: {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer ${DOCS_TOKEN}' },
    },
    runner: {
      type: 'stdio',
      command: 'node',
      args: ['${PLUGIN_ROOT}/scripts/server.js'],
      env: { TOKEN: '${TOKEN}' },
    },
  });
  expect(await read('plugins/copilot/review/skills/review/SKILL.md')).toContain(
    'Review it.',
  );
  expect(
    await exists(path.join(root, 'plugins/copilot/review/hooks')),
  ).toBeNull();
  expect(
    await exists(path.join(root, 'plugins/copilot/review/agents')),
  ).toBeNull();
  expect(resolved.warnings).toContainEqual(
    expect.stringContaining('agents, hooks are not packaged for copilot'),
  );
  expect((await plan(await ctx({ target: ['copilot'] }), true)).issues).toEqual(
    [],
  );
  await fs.rm(path.join(root, '.anyagents'), { recursive: true });
  expect((await plan(await ctx({ target: ['copilot'] }), true)).issues).toEqual(
    [],
  );
});
it('keeps both Claude and Copilot catalogs when selected together', async () => {
  await apply(await ctx({ target: ['claude', 'copilot'] }));
  const claude = JSON.parse(await read('.claude-plugin/marketplace.json'));
  const copilot = JSON.parse(await read('.github/plugin/marketplace.json'));
  expect(claude.plugins[0].source).toBe('./plugins/claude/review');
  expect(copilot.plugins[0].source).toBe('./plugins/copilot/review');
});
it('generates an OpenCode package without a catalog', async () => {
  await withExtras();
  const resolved = await ctx({ target: ['opencode'] });
  await apply(resolved);
  const bundle = 'plugins/opencode/review';
  expect(JSON.parse(await read(`${bundle}/package.json`))).toMatchObject({
    name: 'review',
    version: '1.2.3',
    type: 'module',
    files: ['index.js', 'anyagents.opencode.json', 'scripts', 'skills'],
  });
  expect(JSON.parse(await read(`${bundle}/anyagents.opencode.json`))).toEqual({
    id: 'review',
    skills: [{ id: 'review', name: 'review', description: 'Review code' }],
    mcp: {
      docs: {
        type: 'remote',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer {env:DOCS_TOKEN}' },
      },
      runner: {
        type: 'local',
        command: ['node', '{plugin:root}/scripts/server.js'],
        environment: { TOKEN: '{env:TOKEN}' },
      },
    },
  });
  expect(await read(`${bundle}/scripts/server.js`)).toContain('ok');
  expect(await exists(path.join(root, `${bundle}/hooks`))).toBeNull();
  expect(await exists(path.join(root, `${bundle}/agents`))).toBeNull();
  for (const catalogPath of [
    '.github',
    '.claude-plugin',
    '.agents',
    'marketplace.json',
  ])
    expect(await exists(path.join(root, catalogPath))).toBeNull();
  expect(resolved.warnings).toContainEqual(
    expect.stringContaining('agents, hooks are not packaged for opencode'),
  );
  expect((await apply(await ctx({ target: ['opencode'] }))).operations).toEqual(
    [],
  );
  expect(
    (await plan(await ctx({ target: ['opencode'] }), true)).issues,
  ).toEqual([]);
});
it('names the OpenCode package from the plugin detail', async () => {
  await put(
    '.ai/plugins/review/plugin.yaml',
    stringify({
      ...plugin,
      detail: { opencode: { packageName: '@acme/review' } },
    }),
  );
  await apply(await ctx({ target: ['opencode'] }));
  expect(
    JSON.parse(await read('plugins/opencode/review/package.json')).name,
  ).toBe('@acme/review');
});
it('rejects invalid OpenCode and Copilot plugin details before writing', async () => {
  for (const detail of [
    { opencode: { packageName: 'Not Valid' } },
    { copilot: { category: 'x' } },
  ]) {
    await put(
      '.ai/plugins/review/plugin.yaml',
      stringify({ ...plugin, detail }),
    );
    await expect(apply(await ctx({ target: ['all'] }))).rejects.toMatchObject({
      code: 'MARKETPLACE_INVALID',
    });
  }
  expect(await exists(path.join(root, 'plugins'))).toBeNull();
});
it('loads the generated OpenCode package in both host shapes without replacing user entries', async () => {
  await withExtras();
  await apply(await ctx({ target: ['opencode'] }));
  const bundle = path.join(root, 'plugins/opencode/review');
  const loaded = await import(
    pathToFileURL(path.join(bundle, 'index.js')).href
  );
  const plugin = loaded.default;
  expect(plugin.id).toBe('review');
  vi.stubEnv('DOCS_TOKEN', 'secret');
  vi.stubEnv('TOKEN', 'abc');
  const skillFile = path.join(bundle, 'skills/review/SKILL.md');
  const expectedServers = {
    docs: {
      type: 'remote',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer secret' },
    },
    runner: {
      type: 'local',
      command: ['node', `${bundle}/scripts/server.js`],
      environment: { TOKEN: 'abc' },
    },
  };

  const added: unknown[] = [];
  const set: Record<string, unknown> = {};
  const host = (skills: string[], servers: string[]) => ({
    skill: {
      transform: async (edit: (editor: unknown) => void) =>
        edit({
          get: (id: string) => (skills.includes(id) ? {} : undefined),
          add: (skill: unknown) => added.push(skill),
        }),
    },
    mcp: {
      transform: async (edit: (editor: unknown) => void) =>
        edit({
          get: (name: string) => (servers.includes(name) ? {} : undefined),
          set: (name: string, config: unknown) => {
            set[name] = config;
          },
        }),
    },
  });
  await plugin.setup(host([], []));
  expect(added).toEqual([
    {
      id: 'review',
      name: 'review',
      description: 'Review code',
      path: skillFile,
      content: 'Review it.\n',
    },
  ]);
  expect(set).toEqual(expectedServers);

  added.length = 0;
  for (const name of Object.keys(set)) delete set[name];
  await plugin.setup(host(['review'], ['docs']));
  expect(added).toEqual([]);
  expect(Object.keys(set)).toEqual(['runner']);

  const { config } = await plugin.server();
  const settings: {
    mcp: Record<string, unknown>;
    skills?: { paths: string[] };
  } = {
    mcp: { docs: { type: 'remote', url: 'https://mine.example' } },
  };
  await config(settings);
  await config(settings);
  expect(settings.skills?.paths).toEqual([path.join(bundle, 'skills')]);
  expect(settings.mcp.docs).toEqual({
    type: 'remote',
    url: 'https://mine.example',
  });
  expect(settings.mcp.runner).toEqual(expectedServers.runner);
});
