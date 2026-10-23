import {
  identifier,
  marketplaceReferenceSchema,
  marketplaceSchema,
  pluginSchema,
} from '@alchemisten/anyagents-marketplaces';
import { parse as parseToml } from 'smol-toml';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { fail } from '../core/errors.js';

const text = z.string().min(1).regex(/\S/, 'Expected nonblank text');
const strings = z.record(z.string(), z.string());
export const configSchema = z.object({
  version: z.literal(1),
  project: z.boolean().default(true),
  marketplaces: z.record(identifier, marketplaceReferenceSchema).default({}),
  source: z.object({ dir: text.default('.ai') }).default({ dir: '.ai' }),
  targets: z
    .object({
      claude: z.boolean().default(true),
      codex: z.boolean().default(true),
    })
    .default({ claude: true, codex: true }),
  links: z
    .object({ mode: z.literal('symlink').default('symlink') })
    .default({ mode: 'symlink' }),
  git: z
    .object({ managed_outputs: z.literal('commit').default('commit') })
    .default({ managed_outputs: 'commit' }),
});
const common = { enabled: z.boolean().default(true) };
export const serverSchema = z.discriminatedUnion('transport', [
  z
    .object({
      ...common,
      transport: z.literal('stdio'),
      command: text,
      args: z.array(z.string()).optional(),
      env: strings.optional(),
      cwd: text.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      transport: z.literal('http'),
      url: z
        .string()
        .url()
        .regex(/^https?:\/\//),
      headers: strings.optional(),
    })
    .strict(),
]);
export const mcpSchema = z
  .object({
    version: z.literal(1),
    mcp: z
      .record(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/), serverSchema)
      .default({}),
  })
  .strict();
export const skillSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: text,
  })
  .passthrough();
export type Config = z.infer<typeof configSchema>;
export type Mcp = z.infer<typeof mcpSchema>;
export type Server = z.infer<typeof serverSchema>;
export function toml(
  text: string,
  code = 'CONFIG_INVALID',
  path?: string,
): Record<string, unknown> {
  try {
    return parseToml(text);
  } catch {
    return fail(
      code,
      'Invalid TOML. Run anyagents explain config or anyagents explain mcp.',
      path,
    );
  }
}
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
  code: string,
  path?: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success)
    fail(
      code,
      `Invalid canonical input (${result.error.issues.map((i) => i.path.join('.')).join(', ')}). Run anyagents schema ${code === 'SKILL_INVALID' ? 'skill' : code === 'CANONICAL_MCP_INVALID' ? 'mcp' : 'config'}.`,
      path,
    );
  return result.data;
}
export function skill(
  text: string,
  directory: string,
  warnings: string[],
): void {
  const match = text
    .replace(/\r\n/g, '\n')
    .match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match)
    fail(
      'SKILL_INVALID',
      'Missing YAML frontmatter. Run anyagents explain skills.',
      directory,
    );
  const doc = parseDocument(match[1], { uniqueKeys: true });
  if (doc.errors.length)
    fail('SKILL_INVALID', 'Invalid YAML frontmatter.', directory);
  const metadata = validate(
    skillSchema,
    doc.toJS(),
    'SKILL_INVALID',
    directory,
  );
  if (metadata.name !== directory)
    fail(
      'SKILL_INVALID',
      'Skill directory must equal frontmatter name.',
      directory,
    );
  for (const key of Object.keys(metadata))
    if (!['name', 'description'].includes(key))
      warnings.push(`Unknown skill field: ${directory}.${key}`);
}
export function unknownConfig(raw: Record<string, unknown>): string[] {
  const allowed: Record<string, string[]> = {
    source: ['dir'],
    targets: ['claude', 'codex'],
    links: ['mode'],
    git: ['managed_outputs'],
  };
  const warnings: string[] = [];
  for (const key of Object.keys(raw)) {
    if (
      !['version', 'project', 'marketplaces', ...Object.keys(allowed)].includes(
        key,
      )
    )
      warnings.push(`Unknown config field: ${key}`);
    if (allowed[key] && raw[key] && typeof raw[key] === 'object')
      for (const sub of Object.keys(raw[key]))
        if (!allowed[key].includes(sub))
          warnings.push(`Unknown config field: ${key}.${sub}`);
  }
  return warnings;
}
export const schemas = Object.fromEntries(
  Object.entries({
    config: configSchema,
    marketplace: marketplaceSchema,
    plugin: pluginSchema,
    mcp: mcpSchema,
    skill: skillSchema,
  }).map(([name, schema]) => [
    name,
    {
      ...z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }),
      $id: `https://github.com/vspdi/anyagents/schema/${name}-v1.json`,
      ...(name === 'skill'
        ? {
            description:
              'YAML frontmatter of skills/<name>/SKILL.md. Directory equals name; Markdown body and arbitrary supporting files are preserved.',
          }
        : {}),
    },
  ]),
);
