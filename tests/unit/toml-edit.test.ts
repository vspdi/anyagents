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
) => {
  const result = replaceTomlTables(
    text,
    'mcp_servers',
    updates,
    expectedFrom(text, updates),
  );
  expect(result.preserved).toBe(true);
  return result.text;
};

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
it('edits inline-table and dotted-key servers in place, keeping comments', () => {
  const cases = [
    // Inline table holding several servers: all become sections.
    '# keep\nmodel = "x" # keep too\nmcp_servers = { docs = { command = "x" }, mine = { command = "m" } }\n\n# profile\n[profiles.fast]\nmodel = "mini"\n',
    // Dotted keys at the root.
    '# keep\nmodel = "x" # keep too\nmcp_servers.docs.command = "x"\nmcp_servers.mine.command = "m"\n\n# profile\n[profiles.fast]\nmodel = "mini"\n',
    // Dotted and inline entries under a [mcp_servers] header.
    '# keep\nmodel = "x" # keep too\n\n[mcp_servers]\ndocs.command = "x"\nmine = { command = "m" }\n\n# profile\n[profiles.fast]\nmodel = "mini"\n',
    // Multi-line array value inside the managed entry.
    '# keep\nmodel = "x" # keep too\n\n[mcp_servers.docs]\ncommand = "x"\nargs = [\n  "[not-a-header]",\n  "b",\n]\n\n[mcp_servers.mine]\ncommand = "m"\n\n# profile\n[profiles.fast]\nmodel = "mini"\n',
  ];
  for (const text of cases) {
    const result = edit(text, { docs: { command: 'y' } });
    expect(result).toContain('# keep\nmodel = "x" # keep too\n');
    expect(result).toContain('# profile\n[profiles.fast]');
    expect(parse(result)).toEqual({
      model: 'x',
      mcp_servers: { docs: { command: 'y' }, mine: { command: 'm' } },
      profiles: { fast: { model: 'mini' } },
    });
  }
});
it('removes the last server, including an emptied [mcp_servers] header', () => {
  const text = '# keep\n[mcp_servers]\ndocs.command = "x"\n\n# tail\n';
  const result = edit(text, { docs: undefined });
  expect(result).toBe('# keep\n\n# tail\n');
});
it('reports when it has to rewrite the whole document', () => {
  const text = '# lost\n[mcp_servers.docs]\ncommand = "x"\n';
  const result = replaceTomlTables(
    text,
    'mcp_servers',
    {},
    {
      mcp_servers: { docs: { command: 'y' } },
    },
  );
  expect(result.preserved).toBe(false);
  expect(parse(result.text)).toEqual({
    mcp_servers: { docs: { command: 'y' } },
  });
});
it('keeps comments for every combination of server layout and change', () => {
  // Each layout writes servers `a` and `b` in a different valid TOML form.
  const layouts: Record<string, string> = {
    sections:
      '[mcp_servers.a]\ncommand = "a"\n\n[mcp_servers.b]\ncommand = "b"\n',
    subtables:
      '[mcp_servers.a]\ncommand = "a"\n[mcp_servers.a.env]\nK = "v"\n\n[mcp_servers.b]\ncommand = "b"\n',
    header: '[mcp_servers]\na.command = "a"\nb = { command = "b" }\n',
    rootDotted: 'mcp_servers.a.command = "a"\nmcp_servers.b.command = "b"\n',
    rootInline:
      'mcp_servers = { a = { command = "a" }, b = { command = "b" } }\n',
    multiline:
      '[mcp_servers.a]\ncommand = "a"\nargs = [\n  "x",\n]\n\n[mcp_servers.b]\ncommand = "b"\n',
  };
  const changes: Record<string, Record<string, unknown> | undefined>[] = [
    { a: { command: 'changed' } },
    { a: undefined },
    { a: undefined, b: undefined },
    { c: { url: 'https://c.invalid' } },
    { a: { command: 'changed' }, b: undefined, c: { command: 'c' } },
  ];
  for (const [name, servers] of Object.entries(layouts))
    for (const updates of changes) {
      // Root-level forms must precede any header, as TOML requires.
      const rootLevel = name.startsWith('root');
      const text = rootLevel
        ? `# top\nmodel = "x" # inline\n${servers}\n# profile\n[profiles.fast]\nmodel = "mini" # m\n`
        : `# top\nmodel = "x" # inline\n\n# profile\n[profiles.fast]\nmodel = "mini" # m\n\n${servers}`;
      const result = edit(text, updates);
      for (const comment of ['# top', '# inline', '# profile', '# m'])
        expect(result, `${name} ${JSON.stringify(updates)}`).toContain(comment);
    }
});
