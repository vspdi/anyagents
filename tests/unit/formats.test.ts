import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import { yaml } from '../../src/formats/yaml.js';

const addFormats = createRequire(import.meta.url)('ajv-formats');

import { describe, expect, it } from 'vitest';
import { templates } from '../../src/content/docs.js';
import {
  configSchema,
  mcpSchema,
  schemas,
  skill,
  skillSchema,
} from '../../src/formats/canonical.js';
import {
  claudeServer,
  codexServer,
  copilotServer,
  nativeServers,
  opencodeServer,
} from '../../src/formats/native.js';

describe('canonical formats and public documentation', () => {
  it('defaults config and refuses unsupported modes/version', () => {
    expect(configSchema.parse({ version: 1 }).targets).toEqual({
      claude: true,
      codex: true,
      opencode: false,
      copilot: false,
    });
    expect(configSchema.parse({ version: 1 }).opencode).toEqual({
      schema: 'v2',
    });
    expect(
      configSchema.safeParse({ version: 1, opencode: { schema: 'v3' } })
        .success,
    ).toBe(false);
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
  it('warns when a skill exceeds the name or description limits clients enforce', () => {
    const warnings: string[] = [];
    const name = 'a'.repeat(65);
    skill(`---\nname: ${name}\ndescription: ok\n---\n`, name, warnings);
    skill(
      `---\nname: long\ndescription: ${'d'.repeat(1025)}\n---\n`,
      'long',
      warnings,
    );
    expect(warnings).toEqual([
      expect.stringContaining('name exceeds 64'),
      expect.stringContaining('description exceeds 1024'),
    ]);
    expect(skill(templates.skill, 'example', [])).toEqual({
      name: 'example',
      description: expect.any(String),
    });
  });
  it('emitted JSON schemas agree with runtime validation for examples and invalid inputs', () => {
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    for (const [name, schema, good, bad] of [
      ['config', configSchema, yaml(templates.config), { version: 99 }],
      [
        'mcp',
        mcpSchema,
        yaml(templates['mcp-http']),
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
    expect(mcpSchema.safeParse(yaml(templates['mcp-stdio'])).success).toBe(
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
    const server = mcpSchema.parse(yaml(templates['mcp-http'])).mcp[
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
  it('maps STDIO and HTTP servers to OpenCode local and remote shapes', () => {
    const { mcp } = mcpSchema.parse({
      version: 1,
      mcp: {
        local: {
          transport: 'stdio',
          command: 'node',
          args: ['server.js', '--flag'],
          env: { TOKEN: '${TOKEN}', MODE: 'fast' },
          cwd: 'tools',
        },
        remote: {
          transport: 'http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer ${DOCS_TOKEN}' },
        },
        bare: { transport: 'stdio', command: 'tool' },
      },
    });
    expect(opencodeServer(mcp.local)).toEqual({
      type: 'local',
      command: ['node', 'server.js', '--flag'],
      environment: { TOKEN: '{env:TOKEN}', MODE: 'fast' },
      cwd: 'tools',
    });
    expect(opencodeServer(mcp.remote)).toEqual({
      type: 'remote',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer {env:DOCS_TOKEN}' },
    });
    expect(opencodeServer(mcp.bare)).toEqual({
      type: 'local',
      command: ['tool'],
    });
  });
  it('refuses placeholder defaults OpenCode cannot express but keeps the plugin root token', () => {
    const { mcp } = mcpSchema.parse({
      version: 1,
      mcp: {
        defaulted: {
          transport: 'http',
          url: 'https://example.com',
          headers: { Region: '${REGION:-eu}' },
        },
        bundled: {
          transport: 'stdio',
          command: 'node',
          args: ['${PLUGIN_ROOT}/server.js'],
        },
      },
    });
    expect(() => opencodeServer(mcp.defaulted)).toThrow('defaults');
    expect(opencodeServer(mcp.bundled).command).toEqual([
      'node',
      '${PLUGIN_ROOT}/server.js',
    ]);
  });
  it('shares the Claude shape with Copilot but rejects what Copilot cannot expand', () => {
    const { mcp } = mcpSchema.parse({
      version: 1,
      mcp: {
        ok: {
          transport: 'http',
          url: 'https://example.com',
          headers: { Authorization: 'Bearer ${TOKEN}' },
        },
        url: { transport: 'http', url: 'https://${HOST}/mcp' },
        cwd: { transport: 'stdio', command: 'node', cwd: 'tools' },
      },
    });
    expect(copilotServer(mcp.ok)).toEqual(claudeServer(mcp.ok));
    expect(() => copilotServer(mcp.url)).toThrow('Copilot cannot expand URL');
    expect(() => copilotServer(mcp.cwd)).toThrow('Copilot project MCP');
    expect(() => claudeServer(mcp.cwd)).toThrow('Claude project MCP');
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
  const full = mcpSchema.parse(yaml(fixture('full-mcp', 'mcp.yaml')));
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
    mcpSchema.parse(yaml(fixture('invalid-mcp', 'mcp.yaml'))),
  ).toThrow();
  expect(() =>
    skill(fixture('invalid-skill', 'SKILL.md'), 'invalid-skill', []),
  ).toThrow();
  expect(mcpSchema.parse(yaml(fixture('minimal', 'mcp.yaml'))).mcp).toEqual({});
});
