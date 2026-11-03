import { createRequire } from 'node:module';
import {
  catalogManifest,
  foldDetail,
  marketplaceSchema,
  OPENCODE_DATA_FILE,
  opencodePackage,
  pluginManifest,
  pluginMcpDocument,
  pluginSchema,
  validateOfficial,
} from '@alchemisten/anyagents-marketplaces';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { expect, it } from 'vitest';
import { templates } from '../../src/content/docs.js';
import { schemas } from '../../src/formats/canonical.js';
import { yaml } from '../../src/formats/yaml.js';

const addFormats = createRequire(import.meta.url)('ajv-formats');
it('keeps emitted marketplace/plugin schemas consistent with runtime validation', () => {
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  for (const [name, schema] of [
    ['marketplace', marketplaceSchema],
    ['plugin', pluginSchema],
  ] as const) {
    const validate = ajv.compile(schemas[name]);
    const good = yaml(templates[name]);
    expect(validate(good)).toBe(true);
    expect(schema.safeParse(good).success).toBe(true);
    for (const bad of [
      { ...good, unknown: true },
      { ...good, detail: { codex: { typo: true } } },
    ]) {
      expect(validate(bad)).toBe(false);
      expect(schema.safeParse(bad).success).toBe(false);
    }
  }
});
it('folds nested objects immutably, replaces arrays, and rejects protected/dangerous keys', () => {
  const base = { interface: { label: 'shared', list: ['a', 'b'] } };
  expect(foldDetail(base, { interface: { list: ['c'] } })).toEqual({
    interface: { label: 'shared', list: ['c'] },
  });
  expect(base.interface.list).toEqual(['a', 'b']);
  expect(() => foldDetail({ name: 'a' }, { name: 'b' }, ['name'])).toThrow(
    'override',
  );
  expect(() =>
    foldDetail({}, { nested: JSON.parse('{"__proto__":{}}') }),
  ).toThrow('override');
  expect(() => foldDetail({}, { field: null })).toThrow('null');
});
it('requires explicit Codex catalog policy and validates portable schemas offline', () => {
  const catalog = marketplaceSchema.parse({
    version: 1,
    owner: { name: 'Team' },
    plugins: { tool: { source: { kind: 'local', path: './tool' } } },
  });
  expect(() => catalogManifest('team', catalog, 'codex')).toThrow('policy');
  expect(() => catalogManifest('team', catalog, 'claude')).not.toThrow();
  expect(() => validateOfficial('plugin', { name: 'valid' })).toThrow('native');
  expect(() =>
    validateOfficial('mcp', {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: { invalid: { type: 'stdio', command: 4 } },
    }),
  ).toThrow('native');
});
const copilotCatalog = marketplaceSchema.parse({
  version: 1,
  owner: {
    name: 'Team',
    email: 'team@example.com',
    url: 'https://example.com',
  },
  description: 'Team tools',
  plugins: {
    tool: {
      source: { kind: 'local', path: './tool' },
      detail: { copilot: { category: 'Testing', tags: ['a', 'b'] } },
    },
  },
});
const basePlugin = pluginSchema.parse({
  version: 1,
  release: '1.0.0',
  description: 'Tool',
  author: { name: 'Team' },
  keywords: ['x'],
});
it('emits a Copilot catalog with the owner and metadata Copilot documents', () => {
  expect(catalogManifest('team', copilotCatalog, 'copilot')).toEqual({
    name: 'team',
    owner: { name: 'Team', email: 'team@example.com' },
    metadata: { description: 'Team tools' },
    plugins: [
      {
        name: 'tool',
        source: './plugins/copilot/tool',
        category: 'Testing',
        tags: ['a', 'b'],
      },
    ],
  });
  const bare = marketplaceSchema.parse({
    version: 1,
    owner: { name: 'Team' },
    plugins: { tool: { source: { kind: 'local', path: './tool' } } },
  });
  expect(catalogManifest('team', bare, 'copilot')).not.toHaveProperty(
    'metadata',
  );
});
it('keeps target details strict: Copilot has no catalog-level detail and OpenCode names must be valid', () => {
  const withDetail = (detail: unknown) => ({
    version: 1,
    owner: { name: 'Team' },
    plugins: { tool: { source: { kind: 'local', path: './tool' } } },
    detail,
  });
  expect(marketplaceSchema.safeParse(withDetail({ copilot: {} })).success).toBe(
    false,
  );
  expect(
    marketplaceSchema.safeParse(withDetail({ opencode: {} })).success,
  ).toBe(false);
  const plugin = (detail: unknown) => ({
    version: 1,
    release: '1.0.0',
    description: 'Tool',
    author: { name: 'Team' },
    detail,
  });
  expect(
    pluginSchema.safeParse(plugin({ opencode: { packageName: '@acme/tool' } }))
      .success,
  ).toBe(true);
  for (const bad of [{ packageName: 'Bad Name' }, { other: true }])
    expect(pluginSchema.safeParse(plugin({ opencode: bad })).success).toBe(
      false,
    );
  expect(pluginSchema.safeParse(plugin({ copilot: {} })).success).toBe(false);
});
it('builds Copilot manifests and MCP with the Agent Plugins schema', () => {
  const manifest = pluginManifest('tool', basePlugin, 'copilot');
  expect(manifest).toMatchObject({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'tool',
    version: '1.0.0',
  });
  expect(manifest).not.toHaveProperty('extensions');
  const mcp = pluginMcpDocument(
    'copilot',
    {
      docs: { transport: 'http', enabled: true, url: 'https://example.com' },
    },
    () => ({}),
  );
  expect(mcp.mcpServers).toEqual({
    docs: { type: 'streamable-http', url: 'https://example.com' },
  });
});
it('builds an OpenCode package from fixed template, manifest and data', () => {
  const files = Object.fromEntries(
    opencodePackage({
      id: 'tool',
      plugin: pluginSchema.parse({
        version: 1,
        release: '1.0.0',
        description: 'Tool',
        author: { name: 'Team' },
        license: 'MIT',
        detail: { opencode: { packageName: '@acme/tool' } },
      }),
      skills: [{ id: 'review', name: 'review', description: 'Review code' }],
      servers: {
        docs: {
          type: 'local',
          command: ['node', '${PLUGIN_ROOT}/server.js'],
          environment: { TOKEN: '{env:TOKEN}' },
        },
      },
      entries: ['skills', 'assets'],
    }).map(({ local, content }) => [local, content.toString('utf8')]),
  );
  expect(Object.keys(files).sort()).toEqual([
    'anyagents.opencode.json',
    'index.js',
    'package.json',
  ]);
  expect(JSON.parse(files['package.json'])).toMatchObject({
    name: '@acme/tool',
    version: '1.0.0',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
    files: ['index.js', 'anyagents.opencode.json', 'assets', 'skills'],
    license: 'MIT',
  });
  expect(JSON.parse(files['anyagents.opencode.json'])).toEqual({
    id: 'tool',
    skills: [{ id: 'review', name: 'review', description: 'Review code' }],
    mcp: {
      docs: {
        type: 'local',
        command: ['node', '{plugin:root}/server.js'],
        environment: { TOKEN: '{env:TOKEN}' },
      },
    },
  });
  expect(files['index.js']).toContain(
    `path.join(root, '${OPENCODE_DATA_FILE}')`,
  );
  expect(files['index.js']).toMatch(/^\/\/ Generated by AnyAgents/);
  expect(files['index.js']).toContain('export default {');
  expect(files['index.js']).not.toMatch(
    /fetch\(|https?:|child_process|eval\(|new Function/,
  );
});
