import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  catalogManifest,
  hooksSchema,
  type Marketplace,
  marketplaceSchema,
  type Plugin,
  parseDefinition,
  pluginManifest,
  pluginMcpDocument,
  pluginSchema,
  type Target,
} from '@alchemisten/anyagents-marketplaces';
import { adapters } from '../adapters/targets.js';
import { type Mcp, mcpSchema, skill, validate } from '../formats/canonical.js';
import { claudeServer } from '../formats/native.js';
import { yaml } from '../formats/yaml.js';
import { type Context, overlapsReserved } from './context.js';
import { fail, warnPlaintextBearer } from './errors.js';
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
/** A canonical plugin after validation, ready to package per target. */
interface LoadedPlugin {
  id: string;
  root: string;
  definitionPath: string;
  definition: Plugin;
  /** Every file under the plugin root, sorted. */
  contents: string[];
  mcp?: Mcp;
  mcpPath: string;
}

const PLUGIN_ROOT_PREFIX = '${PLUGIN_ROOT}/';
const pluginAssetDirs = [
  'skills',
  'assets',
  'scripts',
  'hooks',
  'agents',
  'commands',
];
const slash = (value: string): string => value.split(path.sep).join('/');
const json = (value: unknown): Buffer =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const byKey = <T>([a]: [string, T], [b]: [string, T]) => a.localeCompare(b);

const readYaml = async (
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
/** Requires a plugin-relative reference to exist inside the plugin. */
const requireAsset = async (
  ctx: Context,
  pluginRoot: string,
  reference: string,
): Promise<void> => {
  const full = path.resolve(pluginRoot, reference);
  if (!inside(pluginRoot, full))
    fail(
      'MARKETPLACE_INVALID',
      'Asset path must stay inside the plugin.',
      full,
    );
  await safePath(ctx.root, full);
  if (!(await exists(full)))
    fail('SOURCE_NOT_FOUND', 'Referenced plugin asset does not exist.', full);
};
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
  parseDefinition(hooksSchema, value, filename);
};

async function validateOutputRoot(
  ctx: Context,
  output: string,
  otherOutputs: string[],
): Promise<void> {
  await safePath(ctx.root, output);
  if (
    otherOutputs.some((other) => inside(other, output) || inside(output, other))
  )
    fail('MARKETPLACE_INVALID', 'Marketplace output roots overlap.', output);
  if (inside(ctx.source, output) || overlapsReserved(ctx.root, output))
    fail(
      'MARKETPLACE_INVALID',
      'Marketplace output overlaps canonical or reserved content.',
      output,
    );
}

async function validatePluginSkills(
  ctx: Context,
  pluginRoot: string,
): Promise<void> {
  const skillRoot = path.join(pluginRoot, 'skills');
  if (!(await exists(skillRoot))) return;
  for (const entry of await fs.readdir(skillRoot, { withFileTypes: true })) {
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

/** Plugin MCP may only reference files inside the plugin. */
async function validatePluginMcp(
  ctx: Context,
  plugin: Pick<LoadedPlugin, 'id' | 'root' | 'mcpPath'>,
  mcp: Mcp,
): Promise<void> {
  for (const server of Object.values(mcp.mcp)) {
    if (server.transport === 'http') {
      warnPlaintextBearer(
        ctx.warnings,
        server.headers,
        `Plugin ${plugin.id} MCP`,
      );
      continue;
    }
    for (const token of [
      server.command,
      ...(server.args ?? []),
      ...(server.cwd ? [server.cwd] : []),
    ]) {
      if (token.startsWith(PLUGIN_ROOT_PREFIX))
        await requireAsset(
          ctx,
          plugin.root,
          token.slice(PLUGIN_ROOT_PREFIX.length),
        );
      else if (token.startsWith('./'))
        await requireAsset(ctx, plugin.root, token);
      else if (
        path.isAbsolute(token) ||
        token.includes('..\\') ||
        token.startsWith('../')
      )
        fail(
          'MARKETPLACE_INVALID',
          'Plugin commands, arguments, and cwd must not reference external filesystem paths.',
          plugin.mcpPath,
        );
    }
  }
}

async function loadPlugin(
  ctx: Context,
  catalogPath: string,
  id: string,
  entry: Marketplace['plugins'][string],
): Promise<LoadedPlugin> {
  const root = path.resolve(path.dirname(catalogPath), entry.source.path);
  await safePath(ctx.root, root);
  const definitionPath = path.join(root, 'plugin.yaml');
  const definition = parseDefinition(
    pluginSchema,
    await readYaml(ctx, definitionPath),
    definitionPath,
  );
  const contents = await files(root);
  for (const filename of contents) {
    const local = slash(path.relative(root, filename));
    if (local === 'plugin.yaml' || local === 'mcp.yaml') continue;
    if (!pluginAssetDirs.includes(local.split('/')[0]))
      fail(
        'MARKETPLACE_INVALID',
        `Plugin assets must be under ${pluginAssetDirs.slice(0, -1).join(', ')}, or ${pluginAssetDirs.at(-1)}.`,
        filename,
      );
  }
  await validatePluginSkills(ctx, root);
  const mcpPath = path.join(root, 'mcp.yaml');
  const mcp = (await exists(mcpPath))
    ? validate(
        mcpSchema,
        await readYaml(ctx, mcpPath),
        'CANONICAL_MCP_INVALID',
        mcpPath,
      )
    : undefined;
  if (mcp) await validatePluginMcp(ctx, { id, root, mcpPath }, mcp);
  return { id, root, definitionPath, definition, contents, mcp, mcpPath };
}

/**
 * References a target's manifest makes to plugin files. `files` must be
 * ordinary files; `packaged` must be (or contain) packaged plugin files.
 */
function componentReferences(
  detail: Plugin['detail'],
  target: Target,
): { files: string[]; packaged: string[] } {
  if (target === 'claude') {
    const claude = detail.claude;
    const files = [
      ...(claude?.hooks ? [claude.hooks] : []),
      ...(claude?.agents ?? []),
    ];
    return {
      files,
      packaged: [...files, ...(claude?.commands ? [claude.commands] : [])],
    };
  }
  const codex = detail.codex;
  const files = [
    ...(codex?.hooks ? [codex.hooks] : []),
    ...(codex?.onboardingSkill ? [codex.onboardingSkill] : []),
    ...(codex?.interface?.composerIcon ? [codex.interface.composerIcon] : []),
    ...(codex?.interface?.logo ? [codex.interface.logo] : []),
    ...(codex?.interface?.screenshots ?? []),
  ];
  return { files, packaged: files };
}

async function validateReferences(
  ctx: Context,
  plugin: LoadedPlugin,
  target: Target,
): Promise<void> {
  const { root, definitionPath, definition } = plugin;
  const references = componentReferences(definition.detail, target);
  for (const reference of references.files) {
    await requireAsset(ctx, root, reference);
    if (!(await exists(path.resolve(root, reference)))?.isFile())
      fail(
        'MARKETPLACE_INVALID',
        'Referenced component must be an ordinary file.',
        definitionPath,
      );
  }
  const onboarding = definition.detail.codex?.onboardingSkill;
  if (
    target === 'codex' &&
    onboarding &&
    (!onboarding.startsWith('./skills/') || !onboarding.endsWith('/SKILL.md'))
  )
    fail(
      'MARKETPLACE_INVALID',
      'onboardingSkill must reference skills/<id>/SKILL.md.',
      definitionPath,
    );
  for (const reference of references.packaged) {
    await requireAsset(ctx, root, reference);
    const full = path.resolve(root, reference);
    if (!plugin.contents.some((file) => file === full || inside(full, file)))
      fail(
        'MARKETPLACE_INVALID',
        'Referenced asset is empty or not packaged.',
        definitionPath,
      );
  }
  const hooks = definition.detail[target]?.hooks;
  if (hooks) await validateHooks(path.resolve(root, hooks));
  const defaultHooks = path.join(root, 'hooks/hooks.json');
  if (await exists(defaultHooks)) await validateHooks(defaultHooks);
}

/** Native files for one plugin bundle, relative to the bundle root. */
async function packagePlugin(
  plugin: LoadedPlugin,
  target: Target,
): Promise<{ local: string; content: Buffer; mode?: number }[]> {
  const adapter = adapters[target];
  const result: { local: string; content: Buffer; mode?: number }[] = [];
  for (const file of plugin.contents) {
    const local = slash(path.relative(plugin.root, file));
    if (local === 'plugin.yaml' || local === 'mcp.yaml') continue;
    result.push({
      local,
      content: await fs.readFile(file),
      mode: (await fs.stat(file)).mode,
    });
  }
  result.push({
    local: adapter.pluginManifestPath,
    content: json(pluginManifest(plugin.id, plugin.definition, target)),
  });
  if (plugin.mcp)
    result.push({
      local: adapter.pluginMcpPath,
      content: json(
        pluginMcpDocument(target, plugin.mcp.mcp, claudeServer, plugin.mcpPath),
      ),
    });
  return result;
}

/** Generated output must never replace canonical input. */
async function guardDestinations(
  ctx: Context,
  result: MarketplaceInputs,
  pluginRoots: string[],
): Promise<void> {
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
}

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
    artifact: Omit<Artifact, 'destination'>,
  ) =>
    result.artifacts[target].push({
      destination: slash(path.relative(ctx.root, destination)),
      ...artifact,
    });
  const configDir = path.dirname(ctx.configPath);
  for (const [name, reference] of Object.entries(ctx.config.marketplaces).sort(
    byKey,
  )) {
    const source = path.resolve(configDir, reference.source);
    const output = path.resolve(configDir, reference.output);
    await validateOutputRoot(ctx, output, outputRoots);
    outputRoots.push(output);
    result.sources.push(source);
    const catalog = parseDefinition(
      marketplaceSchema,
      await readYaml(ctx, source),
      source,
    );
    for (const target of ctx.targets) {
      add(target, path.join(output, adapters[target].catalogPath), {
        content: json(catalogManifest(name, catalog, target)),
      });
      result.roots.push(path.join(output, 'plugins', target));
    }
    for (const [id, entry] of Object.entries(catalog.plugins).sort(byKey)) {
      const plugin = await loadPlugin(ctx, source, id, entry);
      pluginRoots.push(plugin.root);
      result.sources.push(...plugin.contents);
      for (const target of ctx.targets) {
        await validateReferences(ctx, plugin, target);
        const bundle = path.join(output, 'plugins', target, id);
        for (const { local, ...artifact } of await packagePlugin(
          plugin,
          target,
        ))
          add(target, path.join(bundle, local), artifact);
      }
    }
  }
  await guardDestinations(ctx, result, pluginRoots);
  result.sources = [...new Set(result.sources)];
  return result;
};
