import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'smol-toml';
import { z } from 'zod';
import { adapters } from '../adapters/targets.js';
import { version } from '../content/docs.js';
import { type Mcp, toml, validate } from '../formats/canonical.js';
import { replaceTomlTables } from '../formats/toml-edit.js';
import type { Context, Target } from './context.js';
import { AnyAgentsError, type ErrorCode, fail, warn } from './errors.js';
import {
  artifactHash,
  atomicWrite,
  exists,
  files,
  hash,
  pathIdentity,
  safePath,
  sourceHash,
  stable,
} from './filesystem.js';
import { type MarketplaceInputs, marketplaceInputs } from './marketplaces.js';
import { inputs } from './project.js';

const record = z.record(z.string(), z.string());
const targetState = z
  .object({ links: record, generated: record, servers: record })
  .strict();
const stateSchema = z
  .object({
    schemaVersion: z.literal(1),
    toolVersion: z.string(),
    sourceHash: z.string(),
    marketplaces: z
      .object({ claude: record.optional(), codex: record.optional() })
      .strict()
      .default({}),
    managed: z
      .object({ claude: targetState.optional(), codex: targetState.optional() })
      .strict(),
  })
  .strict();
type State = z.infer<typeof stateSchema>;
type Managed = z.infer<typeof targetState>;
export interface Operation {
  kind: 'symlink' | 'generate' | 'remove';
  destination: string;
  source?: string;
  content?: string | Buffer;
  mode?: number;
}
interface Issue {
  code: ErrorCode;
  message: string;
  path: string;
}
interface Plan {
  operations: Operation[];
  state: State;
  issues: Issue[];
}
/** Shared inputs for every planning step. */
interface Planning {
  ctx: Context;
  plan: Plan;
  old: State;
  checking: boolean;
}
const STATE_PATH = '.anyagents/state.json';
const GITIGNORE_BEGIN = '# BEGIN AnyAgents managed outputs';
const GITIGNORE_END = '# END AnyAgents managed outputs';

function issue(plan: Plan, code: ErrorCode, message: string, p: string) {
  if (
    !plan.issues.some(
      (i) => i.code === code && i.message === message && i.path === p,
    )
  )
    plan.issues.push({ code, message, path: p });
}
async function loadState(ctx: Context): Promise<State> {
  const p = path.join(ctx.root, STATE_PATH);
  await safePath(ctx.root, p);
  if (!(await exists(p)))
    return {
      schemaVersion: 1,
      toolVersion: version,
      sourceHash: '',
      managed: {},
      marketplaces: {},
    };
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    fail(
      'CONFIG_INVALID',
      'Invalid ownership state; restore it before applying.',
      p,
    );
  }
  return validate(stateSchema, raw, 'CONFIG_INVALID', p);
}

/** Instruction and skills links for one target. */
async function planLinks(
  { ctx, plan, checking }: Planning,
  target: Target,
  managed: Managed,
  previous: Managed | undefined,
): Promise<void> {
  const adapter = adapters[target];
  for (const [dest, canonical] of [
    [adapter.instructionPath, 'AGENTS.md'],
    [adapter.skillsPath, 'skills'],
  ] as const) {
    const full = path.join(ctx.root, dest);
    await safePath(ctx.root, full, false);
    const source = path.relative(
      path.dirname(full),
      path.join(ctx.source, canonical),
    );
    managed.links[dest] = source;
    const stat = await exists(full);
    if (stat?.isSymbolicLink()) {
      const actual = await fs.readlink(full);
      if (
        path.resolve(path.dirname(full), actual) ===
        path.resolve(path.dirname(full), source)
      )
        continue;
      if (checking)
        issue(
          plan,
          'OUTPUT_DRIFT',
          'Link differs from canonical source.',
          dest,
        );
      else if (actual !== previous?.links[dest])
        issue(
          plan,
          'DESTINATION_CONFLICT',
          'Unmanaged symlink occupies destination; move it first.',
          dest,
        );
      else plan.operations.push({ kind: 'symlink', destination: dest, source });
    } else if (stat)
      issue(
        plan,
        'DESTINATION_CONFLICT',
        'Unmanaged file or directory occupies destination; move it first.',
        dest,
      );
    else if (checking)
      issue(plan, 'OUTPUT_DRIFT', 'Expected link is missing.', dest);
    else plan.operations.push({ kind: 'symlink', destination: dest, source });
  }
}

/** Claude owns the whole `.mcp.json`; returns the desired file content. */
function claudeMcp(
  { ctx, plan }: Planning,
  dest: string,
  current: string | null,
  servers: Record<string, Record<string, unknown>>,
  managed: Managed,
  previous: Managed | undefined,
): string {
  const output = `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`;
  if (current !== null && current !== output) {
    if (!previous?.generated[dest])
      issue(
        plan,
        'DESTINATION_CONFLICT',
        'Unmanaged Claude MCP file exists; move it first.',
        dest,
      );
    else if (hash(current) !== previous.generated[dest] && !ctx.force)
      issue(
        plan,
        'OUTPUT_DRIFT',
        'Managed Claude MCP was edited. Restore it or use apply --force.',
        dest,
      );
  }
  managed.generated[dest] = hash(output);
  return output;
}

/**
 * Codex shares `.codex/config.toml` with the user: only managed
 * `mcp_servers` entries change. Returns the desired file content.
 */
function codexMcp(
  { ctx, plan, checking }: Planning,
  dest: string,
  current: string | null,
  servers: Record<string, Record<string, unknown>>,
  managed: Managed,
  previous: Managed | undefined,
): string {
  const config = current === null ? {} : toml(current, 'CONFIG_INVALID', dest);
  const rawServers = config.mcp_servers;
  if (
    rawServers !== undefined &&
    (!rawServers || typeof rawServers !== 'object' || Array.isArray(rawServers))
  )
    fail('CONFIG_INVALID', 'Codex mcp_servers must be a table.', dest);
  const existing = { ...((rawServers as Record<string, unknown>) ?? {}) };
  for (const name of new Set([
    ...Object.keys(previous?.servers ?? {}),
    ...Object.keys(servers),
  ])) {
    const actual = Object.hasOwn(existing, name)
      ? hash(stable(existing[name]))
      : null;
    const prior = previous?.servers[name];
    const desired = managed.servers[name];
    if (
      actual !== null &&
      actual !== desired &&
      (!prior || (actual !== prior && !ctx.force))
    )
      issue(
        plan,
        prior ? 'OUTPUT_DRIFT' : 'DESTINATION_CONFLICT',
        `Codex MCP entry ${name} is ${prior ? 'edited; restore it or use apply --force' : 'unmanaged; move it first'}.`,
        dest,
      );
    if (checking && actual !== (desired ?? null))
      issue(
        plan,
        'OUTPUT_DRIFT',
        `Codex MCP entry ${name} differs. Run anyagents apply.`,
        dest,
      );
    if (Object.hasOwn(servers, name)) existing[name] = servers[name];
    else delete existing[name];
  }
  if (Object.keys(existing).length) config.mcp_servers = existing;
  else delete config.mcp_servers;
  managed.generated[dest] = hash(stable(servers));
  if (current === null) return stringify(config);
  const before = (rawServers as Record<string, unknown> | undefined) ?? {};
  const updates = Object.fromEntries(
    [...new Set([...Object.keys(before), ...Object.keys(existing)])]
      .filter((name) => stable(before[name]) !== stable(existing[name]))
      .map((name) => [
        name,
        existing[name] as Record<string, unknown> | undefined,
      ]),
  );
  if (!Object.keys(updates).length) return current;
  const edited = replaceTomlTables(current, 'mcp_servers', updates, config);
  if (!edited.preserved && !checking)
    warn(
      ctx.warnings,
      `${dest} could not be edited in place and was rewritten; its comments and formatting were not kept.`,
    );
  return edited.text;
}

/** MCP configuration for one target; false when the destination is unusable. */
async function planMcp(
  planning: Planning,
  target: Target,
  mcp: Mcp,
  managed: Managed,
  previous: Managed | undefined,
): Promise<boolean> {
  const { ctx, plan, checking } = planning;
  const adapter = adapters[target];
  const servers = adapter.servers(mcp);
  for (const [name, data] of Object.entries(servers))
    managed.servers[name] = hash(stable(data));
  const dest = adapter.mcpPath;
  const full = path.join(ctx.root, dest);
  await safePath(ctx.root, full);
  const stat = await exists(full);
  if (stat && !stat.isFile()) {
    issue(
      plan,
      'DESTINATION_CONFLICT',
      'MCP destination is not an ordinary file.',
      dest,
    );
    return false;
  }
  const current = stat
    ? (await fs.readFile(full, 'utf8')).replace(/\r\n/g, '\n')
    : null;
  const output = (target === 'claude' ? claudeMcp : codexMcp)(
    planning,
    dest,
    current,
    servers,
    managed,
    previous,
  );
  if (!checking) {
    if (current !== output)
      plan.operations.push({
        kind: 'generate',
        destination: dest,
        content: output,
      });
    return true;
  }
  if (current === null || (target === 'claude' && current !== output))
    issue(
      plan,
      'OUTPUT_DRIFT',
      'MCP output differs. Run anyagents apply.',
      dest,
    );
  return true;
}

/** Project links and MCP for every selected target. */
async function planProject(planning: Planning, mcp: Mcp): Promise<void> {
  const { ctx, plan, old, checking } = planning;
  if (!ctx.config.project) return;
  for (const target of ctx.targets) {
    const managed: Managed = { links: {}, generated: {}, servers: {} };
    const previous = old.managed[target];
    await planLinks(planning, target, managed, previous);
    const usable = await planMcp(planning, target, mcp, managed, previous);
    if (usable && checking && previous && stable(previous) !== stable(managed))
      issue(
        plan,
        'OUTPUT_DRIFT',
        'Ownership state differs. Run anyagents apply.',
        STATE_PATH,
      );
    plan.state.managed[target] = managed;
  }
}

/** Writes desired marketplace artifacts and removes obsolete owned ones. */
async function planMarketplaces(
  planning: Planning,
  marketplaces: MarketplaceInputs,
): Promise<void> {
  const { ctx, plan, old, checking } = planning;
  const allDestinations = new Set<string>();
  for (const target of ctx.targets) {
    const prior = Object.fromEntries(
      Object.entries(old.marketplaces[target] ?? {}).map(([dest, digest]) => [
        pathIdentity(dest),
        digest,
      ]),
    );
    const hashes: Record<string, string> = {};
    for (const artifact of marketplaces.artifacts[target]) {
      const dest = artifact.destination;
      const key = pathIdentity(dest);
      if (
        allDestinations.has(key) ||
        plan.operations.some((op) => pathIdentity(op.destination) === key)
      )
        fail('DESTINATION_CONFLICT', 'Generated destinations collide.', dest);
      allDestinations.add(key);
      const full = path.join(ctx.root, dest);
      await safePath(ctx.root, full);
      const stat = await exists(full);
      if (stat && !stat.isFile())
        fail(
          'DESTINATION_CONFLICT',
          'Generated artifact must be an ordinary file.',
          dest,
        );
      const actual = stat ? artifactHash(await fs.readFile(full)) : null;
      const expected = artifactHash(artifact.content);
      hashes[dest] = expected;
      const modeDiffers =
        process.platform !== 'win32' &&
        stat &&
        artifact.mode !== undefined &&
        (stat.mode & 0o111) !== (artifact.mode & 0o111);
      if (actual === expected && !modeDiffers) continue;
      if (checking)
        issue(
          plan,
          'OUTPUT_DRIFT',
          'Marketplace artifact differs; run anyagents apply.',
          dest,
        );
      else if (
        actual !== null &&
        actual !== expected &&
        (!prior[key] || (prior[key] !== actual && !ctx.force))
      )
        issue(
          plan,
          prior[key] ? 'OUTPUT_DRIFT' : 'DESTINATION_CONFLICT',
          'Artifact is unmanaged or edited; restore it before applying.',
          dest,
        );
      else plan.operations.push({ kind: 'generate', ...artifact });
    }
    await planObsolete(planning, marketplaces, prior, hashes);
    plan.state.marketplaces[target] = hashes;
  }
}

/** Removes previously generated artifacts that are no longer desired. */
async function planObsolete(
  { ctx, plan, checking }: Planning,
  marketplaces: MarketplaceInputs,
  prior: Record<string, string>,
  desired: Record<string, string>,
): Promise<void> {
  for (const dest of Object.keys(prior)) {
    if (Object.keys(desired).some((d) => pathIdentity(d) === dest)) continue;
    const full = path.join(ctx.root, dest);
    await safePath(ctx.root, full);
    if (
      marketplaces.sources.some(
        (source) => pathIdentity(source) === pathIdentity(full),
      ) ||
      pathIdentity(full) === pathIdentity(ctx.configPath) ||
      pathIdentity(full).startsWith(`${pathIdentity(ctx.source)}${path.sep}`)
    )
      fail(
        'DESTINATION_CONFLICT',
        'Prior output overlaps canonical input.',
        dest,
      );
    const stat = await exists(full);
    if (!stat) continue;
    if (!stat.isFile() || artifactHash(await fs.readFile(full)) !== prior[dest])
      issue(
        plan,
        'DESTINATION_CONFLICT',
        'Obsolete artifact was edited; move it before applying.',
        dest,
      );
    else if (checking)
      issue(
        plan,
        'OUTPUT_DRIFT',
        'Obsolete managed artifact remains; run anyagents apply.',
        dest,
      );
    else plan.operations.push({ kind: 'remove', destination: dest });
  }
}

/** Generated plugin bundle directories may only contain owned files. */
async function checkBundleRoots(
  { ctx, plan }: Planning,
  roots: string[],
): Promise<void> {
  const owned = (dest: string) =>
    ctx.targets.some((target) =>
      Object.keys(plan.state.marketplaces[target] ?? {}).some(
        (desired) => pathIdentity(desired) === pathIdentity(dest),
      ),
    ) ||
    plan.operations.some(
      (op) =>
        op.kind === 'remove' &&
        pathIdentity(op.destination) === pathIdentity(dest),
    );
  for (const root of roots) {
    await safePath(ctx.root, root);
    const stat = await exists(root);
    if (!stat) continue;
    if (!stat.isDirectory())
      fail(
        'DESTINATION_CONFLICT',
        'Plugin bundle root must be a directory.',
        root,
      );
    for (const file of await files(root)) {
      const dest = path.relative(ctx.root, file).split(path.sep).join('/');
      if (!owned(dest))
        issue(
          plan,
          'DESTINATION_CONFLICT',
          'Unexpected file in generated plugin bundles; move it or restore canonical sources.',
          dest,
        );
    }
  }
}

/** Keeps `.anyagents/` ignored through a single managed block. */
async function planGitignore({ ctx, plan }: Planning): Promise<void> {
  const ignore = path.join(ctx.root, '.gitignore');
  await safePath(ctx.root, ignore);
  const current = (await exists(ignore))
    ? await fs.readFile(ignore, 'utf8')
    : '';
  const block = `${GITIGNORE_BEGIN}\n.anyagents/\n${GITIGNORE_END}`;
  const starts = current.split(GITIGNORE_BEGIN).length - 1;
  const ends = current.split(GITIGNORE_END).length - 1;
  if (starts !== ends || starts > 1)
    fail('DESTINATION_CONFLICT', 'Malformed managed gitignore block.', ignore);
  const output = starts
    ? current.replace(
        new RegExp(`${GITIGNORE_BEGIN}[\\s\\S]*?${GITIGNORE_END}`),
        block,
      )
    : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${block}\n`;
  if (output !== current)
    plan.operations.push({
      kind: 'generate',
      destination: '.gitignore',
      content: output,
    });
}

export async function plan(ctx: Context, checking = false): Promise<Plan> {
  const input = await inputs(ctx);
  const marketplaces = await marketplaceInputs(ctx);
  const old = await loadState(ctx);
  const marketplaceHash = await sourceHash(
    ctx.root,
    [
      ...marketplaces.sources,
      ...((await exists(ctx.configPath)) ? [ctx.configPath] : []),
    ],
    version,
  );
  const combinedHash = hash(`${input.sourceHash}:${marketplaceHash}`);
  const planning: Planning = {
    ctx,
    old,
    checking,
    plan: {
      operations: [],
      issues: [],
      state: {
        ...old,
        toolVersion: version,
        sourceHash: combinedHash,
        managed: { ...old.managed },
        marketplaces: { ...old.marketplaces },
      },
    },
  };
  for (const target of Object.keys(old.managed))
    if (!ctx.targets.includes(target as Target))
      warn(
        ctx.warnings,
        `Target ${target} is unselected; existing outputs remain untouched.`,
      );
  await planProject(planning, input.mcp);
  await planMarketplaces(planning, marketplaces);
  await checkBundleRoots(planning, marketplaces.roots);
  if (checking && old.sourceHash && old.sourceHash !== combinedHash)
    issue(
      planning.plan,
      'OUTPUT_DRIFT',
      'Canonical source changed. Run anyagents apply.',
      STATE_PATH,
    );
  if (!checking) await planGitignore(planning);
  return planning.plan;
}

interface Snapshot {
  path: string;
  content?: Buffer;
  link?: string;
  mode?: number;
}
const linkType = (p: string) =>
  p.endsWith('/skills') || p.endsWith(`${path.sep}skills`) ? 'dir' : 'file';
const summarize = (operations: Operation[]): Operation[] =>
  operations.map((op) => ({
    kind: op.kind,
    destination: op.destination,
    ...(op.source ? { source: op.source } : {}),
  }));
function failOnIssues(plan: Plan): void {
  const [first] = plan.issues;
  if (first) fail(first.code, first.message, first.path);
}

/** Creates missing parent directories, recording each one for rollback. */
async function ensureParents(full: string, created: string[]): Promise<void> {
  let parent = path.dirname(full);
  const missing: string[] = [];
  while (!(await exists(parent))) {
    missing.unshift(parent);
    parent = path.dirname(parent);
  }
  for (const p of missing) {
    await fs.mkdir(p);
    created.push(p);
  }
}
async function snapshot(full: string): Promise<Snapshot> {
  const stat = await exists(full);
  if (stat?.isSymbolicLink())
    return { path: full, link: await fs.readlink(full) };
  if (stat?.isFile())
    return { path: full, content: await fs.readFile(full), mode: stat.mode };
  return { path: full };
}
async function execute(op: Operation, full: string): Promise<void> {
  if (op.kind === 'generate') {
    await atomicWrite(full, op.content ?? '');
    if (op.mode !== undefined && process.platform !== 'win32')
      await fs.chmod(full, op.mode);
    return;
  }
  if (op.kind === 'remove') return fs.unlink(full);
  const temp = `${full}.${randomUUID()}.tmp`;
  try {
    await fs.symlink(op.source ?? '', temp, linkType(op.destination));
    await fs.rename(temp, full);
  } catch (e) {
    await fs.rm(temp, { force: true });
    if (
      ['EPERM', 'EACCES', 'ENOTSUP'].includes(
        (e as NodeJS.ErrnoException).code ?? '',
      )
    )
      fail(
        'LINK_UNSUPPORTED',
        'Enable symlink privileges (Windows Developer Mode) and retry.',
        full,
      );
    throw e;
  }
}
/**
 * Restores snapshots in reverse order. Every step is attempted; paths that
 * could not be restored are returned so the caller can report them.
 */
async function rollback(
  snapshots: Snapshot[],
  created: string[],
): Promise<string[]> {
  const failed: string[] = [];
  for (const item of [...snapshots].reverse()) {
    try {
      await fs.rm(item.path, { force: true });
      if (item.link !== undefined)
        await fs.symlink(item.link, item.path, linkType(item.path));
      else if (item.content !== undefined) {
        await fs.writeFile(item.path, item.content);
        if (item.mode !== undefined) await fs.chmod(item.path, item.mode);
      }
    } catch {
      failed.push(item.path);
    }
  }
  for (const p of [...created].reverse())
    await fs.rmdir(p).catch(() => failed.push(p));
  return failed;
}

export async function apply(
  ctx: Context,
  dryRun = false,
): Promise<{ operations: Operation[]; warnings: string[] }> {
  const initial = await plan(ctx);
  failOnIssues(initial);
  if (dryRun)
    return {
      operations: summarize(initial.operations),
      warnings: ctx.warnings,
    };
  const stateDir = path.join(ctx.root, '.anyagents');
  await safePath(ctx.root, stateDir);
  const newStateDir = !(await exists(stateDir));
  let succeeded = false;
  await fs.mkdir(stateDir, { recursive: true });
  const lock = path.join(stateDir, 'apply.lock');
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(lock, 'wx');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST')
      fail(
        'APPLY_FAILED',
        'Another apply is running, or a stale .anyagents/apply.lock must be removed.',
      );
    throw e;
  }
  const snapshots: Snapshot[] = [];
  const created: string[] = [];
  try {
    // Re-plan under the lock: the tree may have changed since the first plan.
    const desired = await plan(ctx);
    failOnIssues(desired);
    const stateContent = `${JSON.stringify(stateSchema.parse(desired.state), null, 2)}\n`;
    const statePath = path.join(ctx.root, STATE_PATH);
    const stateCurrent = (await exists(statePath))
      ? await fs.readFile(statePath, 'utf8')
      : null;
    const operations: Operation[] = [
      ...desired.operations,
      ...(stateCurrent !== stateContent
        ? [
            {
              kind: 'generate' as const,
              destination: STATE_PATH,
              content: stateContent,
            },
          ]
        : []),
    ];
    for (const op of operations) {
      const full = path.join(ctx.root, op.destination);
      await safePath(ctx.root, full, op.kind !== 'symlink');
      snapshots.push(await snapshot(full));
      await ensureParents(full, created);
      await execute(op, full);
    }
    succeeded = true;
    return {
      operations: summarize(desired.operations),
      warnings: ctx.warnings,
    };
  } catch (e) {
    const unrestored = await rollback(snapshots, created);
    if (unrestored.length)
      throw new AnyAgentsError(
        'APPLY_FAILED',
        `Apply failed and rollback was incomplete; restore these paths from Git: ${unrestored.map((p) => path.relative(ctx.root, p)).join(', ')}.`,
        undefined,
        { cause: e },
      );
    throw e;
  } finally {
    await handle.close();
    await fs.rm(lock, { force: true });
    if (newStateDir && !succeeded && (await fs.readdir(stateDir)).length === 0)
      await fs.rmdir(stateDir);
  }
}
