import * as fs from 'node:fs/promises';
import path from 'node:path';
import { version } from '../content/docs.js';
import { type Mcp, mcpSchema, skill, validate } from '../formats/canonical.js';
import { yaml } from '../formats/yaml.js';
import type { Context } from './context.js';
import { fail, warnPlaintextBearer } from './errors.js';
import { exists, files, safePath, sourceHash } from './filesystem.js';
export async function inputs(
  ctx: Context,
): Promise<{ mcp: Mcp; sourceHash: string }> {
  if (!ctx.config.project)
    return { mcp: mcpSchema.parse({ version: 1 }), sourceHash: '' };
  for (const asset of ['AGENTS.md', 'mcp.yaml', 'skills']) {
    const p = path.join(ctx.source, asset);
    await safePath(ctx.root, p);
    const stat = await exists(p);
    if (stat && (asset === 'skills' ? !stat.isDirectory() : !stat.isFile()))
      fail(
        'CONFIG_INVALID',
        'Canonical assets must be ordinary files and a skills directory.',
        p,
      );
    if (!stat)
      fail(
        'SOURCE_NOT_FOUND',
        'Missing canonical source. Run anyagents init or restore the asset.',
        p,
      );
  }
  const mcp = validate(
    mcpSchema,
    yaml(
      await fs.readFile(path.join(ctx.source, 'mcp.yaml'), 'utf8'),
      'CANONICAL_MCP_INVALID',
    ),
    'CANONICAL_MCP_INVALID',
  );
  for (const entry of await fs.readdir(path.join(ctx.source, 'skills'), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory())
      fail(
        'SKILL_INVALID',
        'Each skill must be an ordinary directory.',
        entry.name,
      );
    const p = path.join(ctx.source, 'skills', entry.name, 'SKILL.md');
    if (!(await exists(p)))
      fail('SKILL_INVALID', 'Skill directory is missing SKILL.md.', p);
    await safePath(ctx.root, p);
    skill(await fs.readFile(p, 'utf8'), entry.name, ctx.warnings);
  }
  for (const server of Object.values(mcp.mcp))
    if (server.transport === 'http')
      warnPlaintextBearer(ctx.warnings, server.headers, 'MCP');
  const canonical = [
    path.join(ctx.source, 'AGENTS.md'),
    path.join(ctx.source, 'mcp.yaml'),
    ...(await files(path.join(ctx.source, 'skills'))),
  ];
  if (await exists(ctx.configPath)) canonical.push(ctx.configPath);
  return { mcp, sourceHash: await sourceHash(ctx.root, canonical, version) };
}
