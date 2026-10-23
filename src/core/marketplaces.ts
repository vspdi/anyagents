import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  catalogManifest,
  marketplaceSchema,
  officialSchemas,
  parseDefinition,
  pluginManifest,
  pluginSchema,
  type Target,
  validateOfficial,
} from '@alchemisten/anyagents-marketplaces';
import { mcpSchema, skill, validate } from '../formats/canonical.js';
import { claudeServer } from '../formats/native.js';
import { yaml } from '../formats/yaml.js';
import type { Context } from './context.js';
import { fail } from './errors.js';
import { exists, files, inside, pathIdentity, safePath } from './filesystem.js';

export interface Artifact {
  destination: string;
  content: Buffer;
  mode?: number;
}
export interface MarketplaceInputs {
  artifacts: Record<Target, Artifact[]>;
  sources: string[];
  roots: string[];
}
const slash = (value: string): string => value.split(path.sep).join('/');
const json = (value: unknown): Buffer =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const read = async (
  ctx: Context,
  filename: string,
): Promise<Record<string, unknown>> => {
  await safePath(ctx.root, filename);
  if (!(await exists(filename))?.isFile())
    fail('SOURCE_NOT_FOUND', 'Expected a canonical YAML file.', filename);
  return yaml(
    await fs.readFile(filename, 'utf8'),
    'MARKETPLACE_INVALID',
    filename,
  );
};
const asset = async (
  ctx: Context,
  root: string,
  reference: string,
): Promise<void> => {
  const full = path.resolve(root, reference);
  if (!inside(root, full))
    fail(
      'MARKETPLACE_INVALID',
      'Asset path must stay inside the plugin.',
      full,
    );
  await safePath(ctx.root, full);
  if (!(await exists(full)))
    fail('SOURCE_NOT_FOUND', 'Referenced plugin asset does not exist.', full);
};
const hookEvents = new Set([
  'SessionStart',
  'SessionEnd',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'UserPromptSubmit',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'Notification',
  'PermissionRequest',
]);
const validateHooks = async (filename: string): Promise<void> => {
  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(filename, 'utf8'));
  } catch {
    return fail(
      'MARKETPLACE_INVALID',
      'Hooks must be a JSON document.',
      filename,
    );
  }
  const record = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (
    !record(value) ||
    Object.keys(value).some((key) => key !== 'hooks') ||
    !record(value.hooks)
  )
    fail(
      'MARKETPLACE_INVALID',
      'Expected a hooks event map under hooks.',
      filename,
    );
  for (const [event, groups] of Object.entries(value.hooks)) {
    if (!hookEvents.has(event) || !Array.isArray(groups))
      fail(
        'MARKETPLACE_INVALID',
        'Unsupported hook event or matcher array.',
        filename,
      );
    for (const group of groups) {
      if (
        !record(group) ||
        Object.keys(group).some((key) => !['matcher', 'hooks'].includes(key)) ||
        (group.matcher !== undefined && typeof group.matcher !== 'string') ||
        !Array.isArray(group.hooks)
      )
        fail('MARKETPLACE_INVALID', 'Invalid hook matcher group.', filename);
      for (const hook of group.hooks) {
        if (
          !record(hook) ||
          hook.type !== 'command' ||
          typeof hook.command !== 'string' ||
          !hook.command.trim() ||
          Object.keys(hook).some(
            (key) =>
              !['type', 'command', 'timeout', 'statusMessage'].includes(key),
          ) ||
          (hook.timeout !== undefined &&
            (typeof hook.timeout !== 'number' || hook.timeout <= 0)) ||
          (hook.statusMessage !== undefined &&
            typeof hook.statusMessage !== 'string')
        )
          fail(
            'MARKETPLACE_INVALID',
            'Only command hooks with command, timeout, and statusMessage are supported.',
            filename,
          );
      }
    }
  }
};
export const marketplaceInputs = async (
  ctx: Context,
): Promise<MarketplaceInputs> => {
  const result: MarketplaceInputs = {
    artifacts: { claude: [], codex: [] },
    sources: [],
    roots: [],
  };
  const outputRoots: string[] = [];
  const pluginRoots: string[] = [];
  const add = (
    target: Target,
    destination: string,
    content: Buffer,
    mode?: number,
  ): void => {
    result.artifacts[target].push({
      destination: slash(path.relative(ctx.root, destination)),
      content,
      mode,
    });
  };
  for (const [name, reference] of Object.entries(ctx.config.marketplaces).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const source = path.resolve(path.dirname(ctx.configPath), reference.source);
    const output = path.resolve(path.dirname(ctx.configPath), reference.output);
    await safePath(ctx.root, output);
    if (
      outputRoots.some(
        (other) => inside(other, output) || inside(output, other),
      )
    )
      fail('MARKETPLACE_INVALID', 'Marketplace output roots overlap.', output);
    if (
      inside(ctx.source, output) ||
      ['.git', '.anyagents', '.claude', '.agents', '.codex'].some((dir) =>
        inside(path.join(ctx.root, dir), output),
      )
    )
      fail(
        'MARKETPLACE_INVALID',
        'Marketplace output overlaps canonical or reserved content.',
        output,
      );
    outputRoots.push(output);
    result.sources.push(source);
    const catalog = parseDefinition(
      marketplaceSchema,
      await read(ctx, source),
      source,
    );
    for (const target of ctx.targets) {
      const catalogPath = path.join(
        output,
        target === 'claude'
          ? '.claude-plugin/marketplace.json'
          : '.agents/plugins/marketplace.json',
      );
      add(target, catalogPath, json(catalogManifest(name, catalog, target)));
      result.roots.push(path.join(output, 'plugins', target));
    }
    for (const [id, entry] of Object.entries(catalog.plugins).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const pluginRoot = path.resolve(path.dirname(source), entry.source.path);
      await safePath(ctx.root, pluginRoot);
      pluginRoots.push(pluginRoot);
      const definition = path.join(pluginRoot, 'plugin.yaml');
      const plugin = parseDefinition(
        pluginSchema,
        await read(ctx, definition),
        definition,
      );
      const contents = await files(pluginRoot);
      result.sources.push(...contents);
      for (const filename of contents) {
        const local = slash(path.relative(pluginRoot, filename));
        if (local === 'plugin.yaml' || local === 'mcp.yaml') continue;
        if (
          ![
            'skills',
            'assets',
            'scripts',
            'hooks',
            'agents',
            'commands',
          ].includes(local.split('/')[0])
        )
          fail(
            'MARKETPLACE_INVALID',
            'Plugin assets must be under skills, assets, scripts, hooks, agents, or commands.',
            filename,
          );
      }
      const skillRoot = path.join(pluginRoot, 'skills');
      if (await exists(skillRoot)) {
        for (const entry of await fs.readdir(skillRoot, {
          withFileTypes: true,
        })) {
          const filename = path.join(skillRoot, entry.name, 'SKILL.md');
          if (!entry.isDirectory() || !(await exists(filename))?.isFile())
            fail(
              'SKILL_INVALID',
              'Each plugin skill needs a directory with SKILL.md.',
              filename,
            );
          skill(await fs.readFile(filename, 'utf8'), entry.name, ctx.warnings);
        }
      }
      const mcpPath = path.join(pluginRoot, 'mcp.yaml');
      const mcp = (await exists(mcpPath))
        ? validate(
            mcpSchema,
            await read(ctx, mcpPath),
            'CANONICAL_MCP_INVALID',
            mcpPath,
          )
        : undefined;
      if (mcp)
        for (const server of Object.values(mcp.mcp)) {
          if (server.transport === 'stdio') {
            for (const token of [
              server.command,
              ...(server.args ?? []),
              ...(server.cwd ? [server.cwd] : []),
            ]) {
              if (token.startsWith('${PLUGIN_ROOT}/'))
                await asset(
                  ctx,
                  pluginRoot,
                  token.slice('${PLUGIN_ROOT}/'.length),
                );
              else if (token.startsWith('./'))
                await asset(ctx, pluginRoot, token);
              else if (
                path.isAbsolute(token) ||
                token.includes('..\\') ||
                token.startsWith('../')
              )
                fail(
                  'MARKETPLACE_INVALID',
                  'Plugin commands, arguments, and cwd must not reference external filesystem paths.',
                  mcpPath,
                );
            }
          } else if (
            Object.values(server.headers ?? {}).some(
              (value) => /^Bearer\s+/.test(value) && !value.includes('${'),
            )
          )
            ctx.warnings.push(
              `Plugin ${id} MCP contains a possible plaintext bearer token; use an environment placeholder.`,
            );
        }
      for (const target of ctx.targets) {
        const destination = path.join(output, 'plugins', target, id);
        const details = plugin.detail[target];
        const refs: string[] = [];
        if (details?.hooks) refs.push(details.hooks);
        if (target === 'claude') {
          refs.push(...(plugin.detail.claude?.agents ?? []));
          if (plugin.detail.claude?.commands)
            refs.push(plugin.detail.claude.commands);
        } else {
          const metadata = plugin.detail.codex;
          if (metadata?.onboardingSkill) refs.push(metadata.onboardingSkill);
          if (metadata?.interface?.composerIcon)
            refs.push(metadata.interface.composerIcon);
          if (metadata?.interface?.logo) refs.push(metadata.interface.logo);
          refs.push(...(metadata?.interface?.screenshots ?? []));
        }
        const fileRefs =
          target === 'claude'
            ? [
                ...(plugin.detail.claude?.agents ?? []),
                ...(details?.hooks ? [details.hooks] : []),
              ]
            : [...refs];
        for (const ref of fileRefs) {
          await asset(ctx, pluginRoot, ref);
          if (!(await exists(path.resolve(pluginRoot, ref)))?.isFile())
            fail(
              'MARKETPLACE_INVALID',
              'Referenced component must be an ordinary file.',
              definition,
            );
        }
        if (
          plugin.detail.codex?.onboardingSkill &&
          target === 'codex' &&
          (!plugin.detail.codex.onboardingSkill.startsWith('./skills/') ||
            !plugin.detail.codex.onboardingSkill.endsWith('/SKILL.md'))
        )
          fail(
            'MARKETPLACE_INVALID',
            'onboardingSkill must reference skills/<id>/SKILL.md.',
            definition,
          );
        for (const ref of refs) {
          await asset(ctx, pluginRoot, ref);
          if (
            !contents.some(
              (file) =>
                file === path.resolve(pluginRoot, ref) ||
                inside(path.resolve(pluginRoot, ref), file),
            )
          )
            fail(
              'MARKETPLACE_INVALID',
              'Referenced asset is empty or not packaged.',
              definition,
            );
        }
        if (details?.hooks)
          await validateHooks(path.resolve(pluginRoot, details.hooks));
        const defaultHooks = path.join(pluginRoot, 'hooks/hooks.json');
        if (await exists(defaultHooks)) await validateHooks(defaultHooks);
        for (const file of contents) {
          const local = slash(path.relative(pluginRoot, file));
          if (['plugin.yaml', 'mcp.yaml'].includes(local)) continue;
          add(
            target,
            path.join(destination, local),
            await fs.readFile(file),
            (await fs.stat(file)).mode,
          );
        }
        add(
          target,
          path.join(
            destination,
            target === 'claude' ? '.claude-plugin/plugin.json' : 'plugin.json',
          ),
          json(pluginManifest(id, plugin, target)),
        );
        if (mcp) {
          const servers = Object.fromEntries(
            Object.entries(mcp.mcp)
              .filter(([, server]) => server.enabled)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, server]) => {
                const { transport, enabled: _enabled, ...fields } = server;
                if (target === 'claude') {
                  const mapped = claudeServer(server);
                  const replace = (value: unknown): unknown =>
                    typeof value === 'string'
                      ? value.replaceAll(
                          '${PLUGIN_ROOT}',
                          '${CLAUDE_PLUGIN_ROOT}',
                        )
                      : Array.isArray(value)
                        ? value.map(replace)
                        : value && typeof value === 'object'
                          ? Object.fromEntries(
                              Object.entries(value).map(([k, v]) => [
                                k,
                                replace(v),
                              ]),
                            )
                          : value;
                  return [name, replace(mapped)];
                }
                return [
                  name,
                  {
                    type: transport === 'http' ? 'streamable-http' : 'stdio',
                    ...fields,
                  },
                ];
              }),
          );
          const document = {
            ...(target === 'codex' ? { $schema: officialSchemas.mcp.$id } : {}),
            mcpServers: servers,
          };
          if (target === 'codex') validateOfficial('mcp', document, mcpPath);
          add(
            target,
            path.join(
              destination,
              target === 'claude' ? '.mcp.json' : 'mcp.json',
            ),
            json(document),
          );
        }
      }
    }
  }
  for (const artifacts of Object.values(result.artifacts))
    for (const artifact of artifacts) {
      const destination = path.join(ctx.root, artifact.destination);
      if (
        result.sources.some(
          (source) => pathIdentity(source) === pathIdentity(destination),
        ) ||
        pluginRoots.some((root) => inside(root, destination)) ||
        pathIdentity(destination) === pathIdentity(ctx.configPath) ||
        inside(ctx.source, destination)
      )
        fail(
          'MARKETPLACE_INVALID',
          'Generated output would overwrite canonical input.',
          destination,
        );
      await safePath(ctx.root, destination);
    }
  result.sources = [...new Set(result.sources)];
  return result;
};
