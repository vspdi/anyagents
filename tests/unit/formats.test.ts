import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';

const addFormats = createRequire(import.meta.url)('ajv-formats');

import { describe, expect, it } from 'vitest';
import { templates } from '../../src/content/docs.js';
import {
  configSchema,
  mcpSchema,
  schemas,
  skill,
  skillSchema,
  toml,
} from '../../src/formats/canonical.js';
import {
  claudeServer,
  codexServer,
  nativeServers,
} from '../../src/formats/native.js';

describe('canonical formats and public documentation', () => {
  it('defaults config and refuses unsupported modes/version', () => {
    expect(configSchema.parse({ version: 1 }).targets).toEqual({
      claude: true,
      codex: true,
    });
    for (const bad of [
      { version: 2 },
      { version: 1, links: { mode: 'copy' } },
      { version: 1, git: { managed_outputs: 'ignore' } },
    ])
      expect(configSchema.safeParse(bad).success).toBe(false);
  });
  it('validates transport-specific fields and does not accept ambiguous servers', () => {
    for (const server of [
      { transport: 'http', url: 'https://example.com', command: 'npx' },
      { transport: 'stdio', url: 'https://example.com' },
      { transport: 'http', url: 'file:///tmp/x' },
      { transport: 'sse' },
    ])
      expect(
        mcpSchema.safeParse({ version: 1, mcp: { test: server } }).success,
      ).toBe(false);
  });
  it('requires matching portable skill metadata while warning on unknown fields', () => {
    const warnings: string[] = [];
    skill(
      templates.skill.replace('description:', 'custom: yes\ndescription:'),
      'example',
      warnings,
    );
    expect(warnings).toHaveLength(1);
    expect(() => skill(templates.skill, 'wrong', [])).toThrow('directory');
    expect(() => skill('no frontmatter', 'example', [])).toThrow('frontmatter');
    expect(() =>
      skill(
        '---\nname: example\nname: example\ndescription: test\n---\n',
        'example',
        [],
      ),
    ).toThrow('YAML');
  });
  it('emitted JSON schemas agree with runtime validation for examples and invalid inputs', () => {
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    for (const [name, schema, good, bad] of [
      ['config', configSchema, toml(templates.config), { version: 99 }],
      [
        'mcp',
        mcpSchema,
        toml(templates['mcp-http']),
        { version: 1, mcp: { bad: { transport: 'http', url: 123 } } },
      ],
      [
        'skill',
        skillSchema,
        { name: 'example', description: 'Example' },
        { name: 'BAD NAME', description: '' },
      ],
    ] as const) {
      const jsonValidate = ajv.compile(schemas[name]);
      expect(jsonValidate(good)).toBe(schema.safeParse(good).success);
      expect(jsonValidate(bad)).toBe(schema.safeParse(bad).success);
    }
    expect(mcpSchema.safeParse(toml(templates['mcp-stdio'])).success).toBe(
      true,
    );
  });
});
describe('native mappings', () => {
  it('maps static STDIO fields and preserves argument order', () => {
    const server = mcpSchema.parse({
      version: 1,
      mcp: {
        test: {
          transport: 'stdio',
          command: 'node',
          args: ['b', 'a'],
          env: { X: 'value' },
        },
      },
    }).mcp.test;
    expect(claudeServer(server)).toEqual({
      command: 'node',
      args: ['b', 'a'],
      env: { X: 'value' },
    });
    expect(codexServer(server)).toEqual(claudeServer(server));
  });
  it('translates HTTP token references without resolving environment values', () => {
    const server = mcpSchema.parse(toml(templates['mcp-http'])).mcp[
      'project-docs'
    ];
    expect(codexServer(server)).toEqual({
      url: 'https://example.invalid/mcp',
      bearer_token_env_var: 'PROJECT_DOCS_TOKEN',
    });
    expect(claudeServer(server)).toEqual({
      type: 'http',
      url: 'https://example.invalid/mcp',
      headers: { Authorization: 'Bearer ${PROJECT_DOCS_TOKEN}' },
    });
    const extra = mcpSchema.parse({
      version: 1,
      mcp: {
        test: {
          transport: 'http',
          url: 'https://example.com',
          headers: { 'X-Key': '${KEY}', Region: 'eu' },
        },
      },
    }).mcp.test;
    expect(codexServer(extra)).toEqual({
      url: 'https://example.com',
      env_http_headers: { 'X-Key': 'KEY' },
      http_headers: { Region: 'eu' },
    });
  });
  it('passes same-name env references and cwd to Codex; rejects unsupported Claude cwd', () => {
    const server = mcpSchema.parse({
      version: 1,
      mcp: {
        test: {
          transport: 'stdio',
          command: 'node',
          env: { TOKEN: '${TOKEN}' },
          cwd: '/repo',
        },
      },
    }).mcp.test;
    expect(codexServer(server)).toEqual({
      command: 'node',
      env_vars: ['TOKEN'],
      cwd: '/repo',
    });
    expect(() => claudeServer(server)).toThrow('cwd');
  });
  it('refuses unsupported interpolation rather than emitting broken credentials', () => {
    const server = mcpSchema.parse({
      version: 1,
      mcp: {
        test: {
          transport: 'http',
          url: 'https://example.com',
          headers: { 'X-Key': 'prefix ${KEY}' },
        },
      },
    }).mcp.test;
    expect(() => codexServer(server)).toThrow('placeholders');
  });
  it('sorts names and omits disabled servers', () => {
    const mcp = mcpSchema.parse({
      version: 1,
      mcp: {
        z: { transport: 'stdio', command: 'z' },
        a: { transport: 'stdio', command: 'a' },
        disabled: { transport: 'stdio', command: 'x', enabled: false },
      },
    });
    expect(Object.keys(nativeServers(mcp, 'codex'))).toEqual(['a', 'z']);
  });
});

it('validates real fixtures and native credential mappings', () => {
  const fixture = (name: string, file: string) =>
    readFileSync(
      new URL(`../fixtures/${name}/${file}`, import.meta.url),
      'utf8',
    );
  const full = mcpSchema.parse(toml(fixture('full-mcp', 'mcp.toml')));
  expect(Object.keys(nativeServers(full, 'codex'))).toEqual([
    'a-http',
    'z-stdio',
  ]);
  expect(nativeServers(full, 'codex')['a-http']).toEqual({
    url: 'https://example.invalid/mcp',
    bearer_token_env_var: 'DOCS_TOKEN',
    http_headers: { 'X-Region': 'eu' },
    env_http_headers: { 'X-Key': 'KEY' },
  });
  expect(() =>
    mcpSchema.parse(toml(fixture('invalid-mcp', 'mcp.toml'))),
  ).toThrow();
  expect(() =>
    skill(fixture('invalid-skill', 'SKILL.md'), 'invalid-skill', []),
  ).toThrow();
  expect(mcpSchema.parse(toml(fixture('minimal', 'mcp.toml'))).mcp).toEqual({});
});
