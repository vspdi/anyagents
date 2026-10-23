import { z } from 'zod';

export const identifier = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().trim().min(1);
const person = z
  .object({ name: text, email: z.email().optional(), url: z.url().optional() })
  .strict();
const relative = text.refine(
  (value) =>
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !/^[A-Za-z]:/.test(value),
  'Use a relative POSIX path',
);
const assetPath = relative.refine(
  (value) => value.startsWith('./') && !value.split('/').includes('..'),
  'Use a ./ path inside the plugin',
);
const strings = z.array(text);
const interfaceSchema = z
  .object({
    displayName: text.optional(),
    shortDescription: text.optional(),
    longDescription: text.optional(),
    developerName: text.optional(),
    category: text.optional(),
    capabilities: strings.optional(),
    websiteURL: z.url().optional(),
    privacyPolicyURL: z.url().optional(),
    termsOfServiceURL: z.url().optional(),
    defaultPrompt: strings.optional(),
    brandColor: z
      .string()
      .regex(/^#[\da-fA-F]{6}$/)
      .optional(),
    composerIcon: assetPath.optional(),
    logo: assetPath.optional(),
    screenshots: z.array(assetPath).optional(),
  })
  .strict();
const policy = z
  .object({
    installation: z.enum([
      'AVAILABLE',
      'INSTALLED_BY_DEFAULT',
      'NOT_AVAILABLE',
    ]),
    authentication: z.enum(['ON_INSTALL', 'ON_USE']),
  })
  .strict();
const detail = <C extends z.ZodType, O extends z.ZodType>(
  claude: C,
  codex: O,
) =>
  z
    .object({ claude: claude.optional(), codex: codex.optional() })
    .strict()
    .default({});
export const marketplaceReferenceSchema = z
  .object({ source: relative, output: relative })
  .strict();
export const catalogEntrySchema = z
  .object({
    source: z.object({ kind: z.literal('local'), path: relative }).strict(),
    detail: detail(
      z
        .object({
          category: text.optional(),
          tags: strings.optional(),
          defaultEnabled: z.boolean().optional(),
        })
        .strict(),
      z.object({ category: text, policy }).strict(),
    ),
  })
  .strict();
export const marketplaceSchema = z
  .object({
    version: z.literal(1),
    owner: person,
    description: text.optional(),
    plugins: z.record(identifier, catalogEntrySchema),
    detail: detail(
      z
        .object({
          forceRemoveDeletedPlugins: z.boolean().optional(),
          allowCrossMarketplaceDependenciesOn: strings.optional(),
        })
        .strict(),
      z
        .object({
          interface: z.object({ displayName: text }).strict().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export const pluginSchema = z
  .object({
    version: z.literal(1),
    release: z
      .string()
      .regex(
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
      ),
    description: text,
    author: person,
    homepage: z.url().optional(),
    repository: z.url().optional(),
    license: text.optional(),
    keywords: strings.optional(),
    detail: detail(
      z
        .object({
          displayName: text.optional(),
          defaultEnabled: z.boolean().optional(),
          hooks: assetPath.optional(),
          agents: z
            .array(
              assetPath.refine(
                (value) => value.endsWith('.md'),
                'Agent references must be Markdown files',
              ),
            )
            .optional(),
          commands: assetPath.optional(),
        })
        .strict(),
      z
        .object({
          interface: interfaceSchema.optional(),
          hooks: assetPath.optional(),
          onboardingSkill: assetPath.optional(),
        })
        .strict(),
    ),
  })
  .strict();
export const nativeCatalogSchema = (target: 'claude' | 'codex') =>
  z
    .object({
      name: identifier,
      ...(target === 'claude'
        ? {
            owner: person,
            description: text.optional(),
            forceRemoveDeletedPlugins: z.boolean().optional(),
            allowCrossMarketplaceDependenciesOn: strings.optional(),
          }
        : { interface: z.object({ displayName: text }).strict().optional() }),
      plugins: z.array(
        z
          .object({
            name: identifier,
            source:
              target === 'claude'
                ? assetPath
                : z
                    .object({ source: z.literal('local'), path: assetPath })
                    .strict(),
            ...(target === 'claude'
              ? {
                  category: text.optional(),
                  tags: strings.optional(),
                  defaultEnabled: z.boolean().optional(),
                }
              : { category: text, policy }),
          })
          .strict(),
      ),
    })
    .strict();
export const nativeClaudePluginSchema = z
  .object({
    name: identifier,
    version: pluginSchema.shape.release,
    description: text,
    author: person,
    homepage: z.url().optional(),
    repository: z.url().optional(),
    license: text.optional(),
    keywords: strings.optional(),
    displayName: text.optional(),
    defaultEnabled: z.boolean().optional(),
    hooks: assetPath.optional(),
    agents: z
      .array(
        assetPath.refine(
          (value) => value.endsWith('.md'),
          'Agent references must be Markdown files',
        ),
      )
      .optional(),
    commands: assetPath.optional(),
  })
  .strict();
export type Marketplace = z.infer<typeof marketplaceSchema>;
export type Plugin = z.infer<typeof pluginSchema>;
export type Target = 'claude' | 'codex';
