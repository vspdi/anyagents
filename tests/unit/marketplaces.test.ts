import { createRequire } from 'node:module';
import {
  catalogManifest,
  foldDetail,
  marketplaceSchema,
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
