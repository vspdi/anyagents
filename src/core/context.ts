import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  type Config,
  configSchema,
  unknownConfig,
  validate,
} from '../formats/canonical.js';
import { yaml } from '../formats/yaml.js';
import { fail } from './errors.js';
import { exists, inside, safePath } from './filesystem.js';
export type Target = 'claude' | 'codex';
export interface Options {
  cwd?: string;
  config?: string;
  source?: string;
  target?: string[];
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
  quiet?: boolean;
  apply?: boolean;
  probe?: boolean;
  strict?: boolean;
}
export interface Context {
  root: string;
  source: string;
  configPath: string;
  config: Config;
  targets: Target[];
  warnings: string[];
  force: boolean;
}
export async function context(options: Options): Promise<Context> {
  const root = await fs.realpath(path.resolve(options.cwd ?? process.cwd()));
  const configPath = path.resolve(root, options.config ?? 'anyagents.yaml');
  await safePath(root, configPath);
  const stat = await exists(configPath);
  if (options.config && !stat)
    fail(
      'CONFIG_NOT_FOUND',
      'Explicit config file does not exist.',
      configPath,
    );
  const raw = stat
    ? yaml(await fs.readFile(configPath, 'utf8'), 'CONFIG_INVALID', configPath)
    : { version: 1 };
  const config = validate(configSchema, raw, 'CONFIG_INVALID', configPath);
  const source = path.resolve(
    options.source ? root : path.dirname(configPath),
    options.source ?? config.source.dir,
  );
  if (source === root || !inside(root, source))
    fail(
      'CONFIG_INVALID',
      'Canonical source must be a subdirectory inside project root.',
      source,
    );
  const reserved = ['.claude', '.agents', '.codex', '.anyagents', '.git'];
  if (reserved.some((dir) => inside(path.join(root, dir), source)))
    fail(
      'CONFIG_INVALID',
      'Canonical source overlaps a reserved destination.',
      source,
    );
  await safePath(root, source);
  const names =
    options.target?.flatMap((t) => t.split(',')) ??
    Object.entries(config.targets)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name);
  if (names.some((t) => !['claude', 'codex', 'all'].includes(t)))
    fail('USAGE_ERROR', 'Target must be claude, codex, or all.');
  const targets = (
    names.includes('all') ? ['claude', 'codex'] : [...new Set(names)]
  ) as Target[];
  return {
    root,
    source,
    configPath,
    config,
    targets,
    warnings: unknownConfig(raw),
    force: !!options.force,
  };
}
