import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'smol-toml';
import { z } from 'zod';
import { adapters } from '../adapters/targets.js';
import { version } from '../content/docs.js';
import { toml, validate } from '../formats/canonical.js';
import type { Context, Target } from './context.js';
import { fail } from './errors.js';
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
import { marketplaceInputs } from './marketplaces.js';
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
interface Plan {
  operations: Operation[];
  state: State;
  issues: { code: string; message: string; path: string }[];
}
function issue(plan: Plan, code: string, message: string, p: string) {
  plan.issues.push({ code, message, path: p });
}
async function loadState(ctx: Context): Promise<State> {
  const p = path.join(ctx.root, '.anyagents/state.json');
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
  input.sourceHash = hash(`${input.sourceHash}:${marketplaceHash}`);
  const next: State = {
    ...old,
    toolVersion: version,
    sourceHash: input.sourceHash,
    managed: { ...old.managed },
    marketplaces: { ...old.marketplaces },
  };
  const plan: Plan = { operations: [], state: next, issues: [] };
  for (const target of Object.keys(old.managed))
    if (!ctx.targets.includes(target as Target))
      ctx.warnings.push(
        `Target ${target} is unselected; existing outputs remain untouched.`,
      );
  for (const target of ctx.targets) {
    if (!ctx.config.project) continue;
    const managed: Managed = { links: {}, generated: {}, servers: {} };
    const previous = old.managed[target];
    const adapter = adapters[target];
    const links = [adapter.instructionPath, adapter.skillsPath];
    for (let i = 0; i < links.length; i++) {
      const dest = links[i];
      const full = path.join(ctx.root, dest);
      await safePath(ctx.root, full, false);
      const source = path.relative(
        path.dirname(full),
        path.join(ctx.source, i === 0 ? 'AGENTS.md' : 'skills'),
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
        else
          plan.operations.push({ kind: 'symlink', destination: dest, source });
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
    const servers = adapter.servers(input.mcp);
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
      next.managed[target] = managed;
      continue;
    }
    const current = stat
      ? (await fs.readFile(full, 'utf8')).replace(/\r\n/g, '\n')
      : null;
    let output: string;
    if (target === 'claude') {
      output = `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`;
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
    } else {
      const config =
        current === null ? {} : toml(current, 'CONFIG_INVALID', dest);
      const rawServers = config.mcp_servers;
      if (
        rawServers !== undefined &&
        (!rawServers ||
          typeof rawServers !== 'object' ||
          Array.isArray(rawServers))
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
      const changed = stable(rawServers ?? {}) !== stable(existing);
      output = current !== null && !changed ? current : stringify(config);
      managed.generated[dest] = hash(stable(servers));
    }
    if (checking) {
      if (current === null || (target === 'claude' && current !== output))
        issue(
          plan,
          'OUTPUT_DRIFT',
          'MCP output differs. Run anyagents apply.',
          dest,
        );
      if (previous && stable(previous) !== stable(managed))
        issue(
          plan,
          'OUTPUT_DRIFT',
          'Ownership state differs. Run anyagents apply.',
          '.anyagents/state.json',
        );
    } else if (current !== output)
      plan.operations.push({
        kind: 'generate',
        destination: dest,
        content: output,
      });
    next.managed[target] = managed;
  }
  const allDestinations = new Set<string>();
  for (const target of ctx.targets) {
    const prior = Object.fromEntries(
      Object.entries(old.marketplaces[target] ?? {}).map(([dest, digest]) => [
        pathIdentity(dest),
        digest,
      ]),
    );
    const desired = marketplaces.artifacts[target];
    const hashes: Record<string, string> = {};
    for (const artifact of desired) {
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
    for (const dest of Object.keys(prior)) {
      if (Object.keys(hashes).some((desired) => pathIdentity(desired) === dest))
        continue;
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
      if (
        !stat.isFile() ||
        artifactHash(await fs.readFile(full)) !== prior[dest]
      )
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
    next.marketplaces[target] = hashes;
  }
  for (const root of marketplaces.roots) {
    await safePath(ctx.root, root);
    if (!(await exists(root))) continue;
    if (!(await exists(root))?.isDirectory())
      fail(
        'DESTINATION_CONFLICT',
        'Plugin bundle root must be a directory.',
        root,
      );
    for (const file of await files(root)) {
      const dest = path.relative(ctx.root, file).split(path.sep).join('/');
      if (
        !ctx.targets.some((target) =>
          Object.keys(next.marketplaces[target] ?? {}).some(
            (desired) => pathIdentity(desired) === pathIdentity(dest),
          ),
        ) &&
        !plan.operations.some(
          (op) =>
            op.kind === 'remove' &&
            pathIdentity(op.destination) === pathIdentity(dest),
        )
      )
        issue(
          plan,
          'DESTINATION_CONFLICT',
          'Unexpected file in generated plugin bundles; move it or restore canonical sources.',
          dest,
        );
    }
  }
  if (checking && old.sourceHash && old.sourceHash !== input.sourceHash)
    issue(
      plan,
      'OUTPUT_DRIFT',
      'Canonical source changed. Run anyagents apply.',
      '.anyagents/state.json',
    );
  if (!checking) {
    const ignore = path.join(ctx.root, '.gitignore');
    await safePath(ctx.root, ignore);
    const current = (await exists(ignore))
      ? await fs.readFile(ignore, 'utf8')
      : '';
    const block =
      '# BEGIN AnyAgents managed outputs\n.anyagents/\n# END AnyAgents managed outputs';
    const starts =
      current.match(/# BEGIN AnyAgents managed outputs/g)?.length ?? 0;
    const ends = current.match(/# END AnyAgents managed outputs/g)?.length ?? 0;
    if (starts !== ends || starts > 1)
      fail(
        'DESTINATION_CONFLICT',
        'Malformed managed gitignore block.',
        ignore,
      );
    const output = starts
      ? current.replace(
          /# BEGIN AnyAgents managed outputs[\s\S]*?# END AnyAgents managed outputs/,
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
  return plan;
}
interface Snapshot {
  path: string;
  content?: Buffer;
  link?: string;
  mode?: number;
}
export async function apply(
  ctx: Context,
  dryRun = false,
): Promise<{ operations: Operation[]; warnings: string[] }> {
  if (dryRun) {
    const preview = await plan(ctx);
    if (preview.issues.length)
      fail(
        preview.issues[0].code,
        preview.issues[0].message,
        preview.issues[0].path,
      );
    return {
      operations: preview.operations.map((op) => ({
        kind: op.kind,
        destination: op.destination,
        ...(op.source ? { source: op.source } : {}),
      })),
      warnings: ctx.warnings,
    };
  }
  const initial = await plan(ctx);
  if (initial.issues.length)
    fail(
      initial.issues[0].code,
      initial.issues[0].message,
      initial.issues[0].path,
    );
  ctx.warnings = [...new Set(ctx.warnings)];
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
    const desired = await plan(ctx);
    if (desired.issues.length)
      fail(
        desired.issues[0].code,
        desired.issues[0].message,
        desired.issues[0].path,
      );
    const stateContent = `${JSON.stringify(stateSchema.parse(desired.state), null, 2)}\n`;
    const statePath = path.join(stateDir, 'state.json');
    const stateCurrent = (await exists(statePath))
      ? await fs.readFile(statePath, 'utf8')
      : null;
    const operations = [
      ...desired.operations,
      ...(stateCurrent !== stateContent
        ? [
            {
              kind: 'generate' as const,
              destination: '.anyagents/state.json',
              content: stateContent,
            },
          ]
        : []),
    ];
    for (const op of operations) {
      const full = path.join(ctx.root, op.destination);
      await safePath(ctx.root, full, op.kind !== 'symlink');
      const stat = await exists(full);
      snapshots.push({
        path: full,
        ...(stat?.isSymbolicLink()
          ? { link: await fs.readlink(full) }
          : stat?.isFile()
            ? { content: await fs.readFile(full), mode: stat.mode }
            : {}),
      });
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
      if (op.kind === 'generate') {
        await atomicWrite(full, op.content ?? '');
        if (op.mode !== undefined && process.platform !== 'win32')
          await fs.chmod(full, op.mode);
      } else if (op.kind === 'remove') await fs.unlink(full);
      else {
        const temp = `${full}.${randomUUID()}.tmp`;
        try {
          await fs.symlink(
            op.source ?? '',
            temp,
            op.destination.endsWith('/skills') ? 'dir' : 'file',
          );
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
    }
    succeeded = true;
    ctx.warnings = [...new Set(ctx.warnings)];
    return {
      operations: desired.operations.map((op) => ({
        kind: op.kind,
        destination: op.destination,
        ...(op.source ? { source: op.source } : {}),
      })),
      warnings: ctx.warnings,
    };
  } catch (e) {
    for (const snapshot of snapshots.reverse()) {
      await fs.rm(snapshot.path, { force: true });
      if (snapshot.link !== undefined)
        await fs.symlink(
          snapshot.link,
          snapshot.path,
          snapshot.path.endsWith(`${path.sep}skills`) ? 'dir' : 'file',
        );
      else if (snapshot.content !== undefined) {
        await fs.writeFile(snapshot.path, snapshot.content);
        if (snapshot.mode !== undefined)
          await fs.chmod(snapshot.path, snapshot.mode);
      }
    }
    for (const p of created.reverse()) await fs.rmdir(p);
    throw e;
  } finally {
    await handle.close();
    await fs.rm(lock, { force: true });
    if (newStateDir && !succeeded && (await fs.readdir(stateDir)).length === 0)
      await fs.rmdir(stateDir);
  }
}
