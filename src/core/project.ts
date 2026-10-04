import * as fs from 'node:fs/promises';
import path from 'node:path';
import { version } from '../content/docs.js';
import {
  type Mcp,
  mcpSchema,
  skill,
  toml,
  validate,
} from '../formats/canonical.js';
import type { Context } from './context.js';
import { fail } from './errors.js';
import { exists, files, safePath, sourceHash } from './filesystem.js';
export async function inputs(
  ctx: Context,
): Promise<{ mcp: Mcp; sourceHash: string }> {
  for (const asset of ['AGENTS.md', 'mcp.toml', 'skills']) {
    const p = path.join(ctx.source, asset);
    await safePath(ctx.root, p);
    if (!(await exists(p)))
      fail(
        'SOURCE_NOT_FOUND',
        'Missing canonical source. Run omniagents init or restore the asset.',
        p,
      );
  }
  const mcp = validate(
    mcpSchema,
    toml(
      await fs.readFile(path.join(ctx.source, 'mcp.toml'), 'utf8'),
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
    if (server.transport === 'http') {
      if (
        Object.values(server.headers ?? {}).some(
          (v) => /^Bearer\s+/.test(v) && !v.includes('${'),
        )
      )
        ctx.warnings.push(
          'MCP contains a possible plaintext bearer token. Prefer an environment placeholder.',
        );
    }
  const canonical = [
    path.join(ctx.source, 'AGENTS.md'),
    path.join(ctx.source, 'mcp.toml'),
    ...(await files(path.join(ctx.source, 'skills'))),
  ];
  if (await exists(ctx.configPath)) canonical.push(ctx.configPath);
  return { mcp, sourceHash: await sourceHash(ctx.root, canonical, version) };
}
