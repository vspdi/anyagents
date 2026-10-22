import * as fs from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';
import { authoringFiles } from '../content/authoring.js';
import { instructions, templates } from '../content/docs.js';
import type { Context } from './context.js';
import { apply } from './engine.js';
import { fail } from './errors.js';
import { atomicWrite, exists, safePath } from './filesystem.js';
export async function init(ctx: Context, noApply = false) {
  const source = path.relative(ctx.root, ctx.source).split(path.sep).join('/');
  const config = {
    ...ctx.config,
    source: {
      dir: path
        .relative(path.dirname(ctx.configPath), ctx.source)
        .split(path.sep)
        .join('/'),
    },
    targets: {
      claude: ctx.targets.includes('claude'),
      codex: ctx.targets.includes('codex'),
    },
  };
  const entries: [string, string][] = [
    [ctx.configPath, stringify(config)],
    [path.join(ctx.source, 'AGENTS.md'), instructions(source)],
    [path.join(ctx.source, 'mcp.yaml'), 'version: 1\nmcp: {}\n'],
    [path.join(ctx.source, 'skills/example/SKILL.md'), templates.skill],
    ...Object.entries(authoringFiles).map(
      ([name, content]): [string, string] => [
        path.join(ctx.source, 'skills/anyagents-authoring', name),
        content,
      ],
    ),
  ];
  for (const [p] of entries) {
    await safePath(ctx.root, p);
    const stat = await exists(p);
    if (stat && (!ctx.force || !stat.isFile()))
      fail(
        'DESTINATION_CONFLICT',
        'Authored file already exists. Use init --force only to deliberately replace scaffolding.',
        p,
      );
  }
  const previous = await Promise.all(
    entries.map(async ([p]) => ({
      p,
      data: (await exists(p)) ? await fs.readFile(p) : null,
    })),
  );
  try {
    for (const [p, content] of entries) await atomicWrite(p, content);
  } catch (e) {
    for (const item of previous)
      if (item.data) await fs.writeFile(item.p, item.data);
      else await fs.rm(item.p, { force: true });
    throw e;
  }
  ctx.config = config;
  if (!noApply) return apply(ctx);
  return {
    created: entries.map(([p]) => path.relative(ctx.root, p)),
    warnings: ctx.warnings,
  };
}
