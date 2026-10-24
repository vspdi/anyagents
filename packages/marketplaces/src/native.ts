import { Ajv2020 } from 'ajv/dist/2020.js';
import type { z } from 'zod';
import {
  type Marketplace,
  nativeCatalogSchema,
  nativeClaudePluginSchema,
  type Plugin,
  type Target,
} from './schemas.js';
import mcpJsonSchema from './vendor/mcp.schema.json' with { type: 'json' };
import pluginJsonSchema from './vendor/plugin.schema.json' with {
  type: 'json',
};

export class MarketplaceError extends Error {
  readonly code = 'MARKETPLACE_INVALID';
  constructor(
    message: string,
    public path?: string,
  ) {
    super(message);
  }
}
const ajv = new Ajv2020({ strict: false, allErrors: true });
const validators = {
  plugin: ajv.compile(pluginJsonSchema),
  mcp: ajv.compile(mcpJsonSchema),
};
export const officialSchemas = { plugin: pluginJsonSchema, mcp: mcpJsonSchema };
export const validateOfficial = (
  kind: keyof typeof validators,
  value: unknown,
  path?: string,
): void => {
  const validator = validators[kind];
  if (!validator(value))
    throw new MarketplaceError(
      `Invalid native ${kind}: ${validator.errors?.map((error) => `${error.instancePath || '/'} ${error.keyword}`).join(', ')}. Correct the canonical definition.`,
      path,
    );
};
export const parseDefinition = <T>(
  schema: z.ZodType<T>,
  value: unknown,
  path?: string,
): T => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new MarketplaceError(
      `Invalid definition: ${result.error.issues.map((issue) => `${issue.path.join('.') || '/'} (${issue.code})`).join(', ')}. Run anyagents schema marketplace or anyagents schema plugin.`,
      path,
    );
  return result.data;
};
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const foldDetail = (
  base: Record<string, unknown>,
  detail: Record<string, unknown>,
  protectedKeys: string[] = [],
): Record<string, unknown> => {
  const merged = { ...base };
  for (const [key, value] of Object.entries(detail)) {
    if (
      ['__proto__', 'prototype', 'constructor'].includes(key) ||
      protectedKeys.includes(key)
    )
      throw new MarketplaceError(
        `Detail cannot override ${key}; edit its canonical field instead.`,
      );
    if (value === null)
      throw new MarketplaceError(`Detail ${key} cannot be null.`);
    merged[key] = isObject(value)
      ? foldDetail(isObject(base[key]) ? base[key] : {}, value)
      : Array.isArray(value)
        ? [...value]
        : value;
  }
  return merged;
};
export const pluginManifest = (
  name: string,
  plugin: Plugin,
  target: Target,
): Record<string, unknown> => {
  const { version: _schemaVersion, release, detail, ...shared } = plugin;
  const base = { name, version: release, ...shared };
  if (target === 'claude')
    return parseDefinition(
      nativeClaudePluginSchema,
      foldDetail(base, detail.claude ?? {}, Object.keys(base)),
    );
  const result = {
    $schema: pluginJsonSchema.$id,
    ...base,
    ...(detail.codex ? { extensions: { 'com.openai': detail.codex } } : {}),
  };
  validateOfficial('plugin', result);
  return result;
};
export const catalogManifest = (
  name: string,
  catalog: Marketplace,
  target: Target,
): Record<string, unknown> => {
  const plugins = Object.entries(catalog.plugins)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, entry]) => {
      const path = `./plugins/${target}/${id}`;
      const base = {
        name: id,
        source: target === 'claude' ? path : { source: 'local', path },
      };
      if (target === 'codex' && !entry.detail.codex)
        throw new MarketplaceError(
          `plugins.${id}.detail.codex requires category and policy.`,
        );
      return foldDetail(base, entry.detail[target] ?? {}, ['name', 'source']);
    });
  const base = {
    name,
    ...(target === 'claude'
      ? {
          owner: catalog.owner,
          ...(catalog.description ? { description: catalog.description } : {}),
        }
      : {}),
    plugins,
  };
  return parseDefinition(
    nativeCatalogSchema(target),
    foldDetail(base, catalog.detail[target] ?? {}, [
      'name',
      'owner',
      'description',
      'plugins',
    ]),
  );
};
/** The fields of a canonical MCP server that plugin packaging relies on. */
export interface PluginServer {
  transport: 'stdio' | 'http';
  enabled: boolean;
}
const replaceDeep = (value: unknown, from: string, to: string): unknown =>
  typeof value === 'string'
    ? value.replaceAll(from, to)
    : Array.isArray(value)
      ? value.map((item) => replaceDeep(item, from, to))
      : isObject(value)
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              key,
              replaceDeep(item, from, to),
            ]),
          )
        : value;
/**
 * Builds a plugin's native MCP document. Claude servers use the project
 * mapping (`toClaude`) with `${PLUGIN_ROOT}` renamed to Claude's variable;
 * Codex servers follow the Agent Plugins MCP schema.
 */
export const pluginMcpDocument = <S extends PluginServer>(
  target: Target,
  servers: Record<string, S>,
  toClaude: (server: S) => Record<string, unknown>,
  path?: string,
): Record<string, unknown> => {
  const mcpServers = Object.fromEntries(
    Object.entries(servers)
      .filter(([, server]) => server.enabled)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, server]) => {
        if (target === 'claude')
          return [
            name,
            replaceDeep(
              toClaude(server),
              '${PLUGIN_ROOT}',
              '${CLAUDE_PLUGIN_ROOT}',
            ),
          ];
        const { transport, enabled: _enabled, ...fields } = server;
        return [
          name,
          {
            type: transport === 'http' ? 'streamable-http' : 'stdio',
            ...fields,
          },
        ];
      }),
  );
  if (target === 'claude') return { mcpServers };
  const document = { $schema: mcpJsonSchema.$id, mcpServers };
  validateOfficial('mcp', document, path);
  return document;
};
