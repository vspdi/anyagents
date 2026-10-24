import { parse } from 'smol-toml';
import { expect, it } from 'vitest';
import { replaceTomlTables } from '../../src/formats/toml-edit.js';

const expectedFrom = (
  text: string,
  updates: Record<string, Record<string, unknown> | undefined>,
) => {
  const config = parse(text) as Record<string, unknown>;
  const servers = { ...((config.mcp_servers as object) ?? {}) } as Record<
    string,
    unknown
  >;
  for (const [name, value] of Object.entries(updates))
    if (value) servers[name] = value;
    else delete servers[name];
  if (Object.keys(servers).length) config.mcp_servers = servers;
  else delete config.mcp_servers;
  return config;
};
const edit = (
  text: string,
  updates: Record<string, Record<string, unknown> | undefined>,
) =>
  replaceTomlTables(text, 'mcp_servers', updates, expectedFrom(text, updates));

it('replaces a managed table in place, including its subtables, and keeps comments', () => {
  const text = [
    '# top comment',
    'model = "gpt-5" # inline comment',
    '',
    '[mcp_servers.docs]',
    'url = "https://old.invalid"',
    '',
    '[mcp_servers.docs.env_http_headers]',
    'X = "Y"',
    '',
    '# belongs to the profile below',
    '[profiles.fast]',
    'model = "mini"',
    '',
  ].join('\n');
  const result = edit(text, { docs: { url: 'https://new.invalid' } });
  expect(result).toBe(
    [
      '# top comment',
      'model = "gpt-5" # inline comment',
      '',
      '[mcp_servers.docs]',
      'url = "https://new.invalid"',
      '',
      '# belongs to the profile below',
      '[profiles.fast]',
      'model = "mini"',
      '',
    ].join('\n'),
  );
});
it('handles quoted server names and ignores header-like lines inside multiline strings', () => {
  const text = [
    'notes = """',
    '[mcp_servers."my.server"]',
    '"""',
    '',
    '[mcp_servers."my.server"]',
    'command = "old"',
    '',
  ].join('\n');
  const result = edit(text, { 'my.server': { command: 'new' } });
  expect(result).toContain('notes = """\n[mcp_servers."my.server"]\n"""');
  expect(parse(result)).toEqual({
    notes: '[mcp_servers."my.server"]\n',
    mcp_servers: { 'my.server': { command: 'new' } },
  });
});
it('appends new servers and removes old ones, keeping other text', () => {
  const text = '# keep\n[mcp_servers.old]\ncommand = "x"\n';
  const result = edit(text, {
    old: undefined,
    added: { command: 'y', args: ['a'] },
  });
  expect(result.startsWith('# keep\n')).toBe(true);
  expect(result).not.toContain('old');
  expect(parse(result)).toEqual({
    mcp_servers: { added: { command: 'y', args: ['a'] } },
  });
});
it('falls back to a full rewrite when servers use inline tables or dotted keys', () => {
  for (const text of [
    '# lost\nmcp_servers = { docs = { command = "x" } }\n',
    '# lost\nmcp_servers.docs.command = "x"\n',
  ]) {
    const result = edit(text, { docs: { command: 'y' } });
    expect(parse(result)).toEqual({ mcp_servers: { docs: { command: 'y' } } });
  }
});
