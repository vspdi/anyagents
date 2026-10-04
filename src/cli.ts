#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { Command, CommanderError } from 'commander';
import { explanations, templates, version } from './content/docs.js';
import { context, type Options } from './core/context.js';
import { apply, plan } from './core/engine.js';
import { fail, OmniError } from './core/errors.js';
import { exists, safePath } from './core/filesystem.js';
import { init } from './core/init.js';
import { schemas } from './formats/canonical.js';

const program = new Command()
  .name('omniagents')
  .description('Canonical AI assets for Claude Code and Codex.')
  .version(version)
  .option('--cwd <path>', 'project root')
  .option('--config <path>', 'explicit config path')
  .option('--source <path>', 'canonical source override')
  .option(
    '--target <target>',
    'claude, codex, or all (repeatable or comma-separated)',
    (value: string, previous: string[]) => [...previous, value],
    [],
  )
  .option('--json', 'machine-readable output')
  .option('--quiet', 'suppress non-error output')
  .option('--no-color', 'disable ANSI colors');
program.addHelpText(
  'after',
  '\nAuthoring documentation:\n  omniagents explain <authoring|skills|mcp|config|ownership>\n  omniagents schema <config|mcp|skill|all>\n  omniagents template <skill|mcp-stdio|mcp-http|config>',
);
program.exitOverride();
program.configureOutput({ outputError: () => {} });
function options(command: Command): Options {
  const opts = command.optsWithGlobals();
  if (opts.target?.length === 0) delete opts.target;
  return opts;
}
function output(data: unknown, opts: Options) {
  if (opts.quiet && !opts.json) return;
  if (opts.json) process.stdout.write(`${JSON.stringify(data)}\n`);
  else if (typeof data === 'string')
    process.stdout.write(`${data}${data.endsWith('\n') ? '' : '\n'}`);
  else process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}
program
  .command('init')
  .description('Scaffold canonical assets and apply enabled targets.')
  .option('--force', 'replace authored scaffolding')
  .option('--no-apply', 'only scaffold sources')
  .action(async (_opts, command: Command) => {
    const opts = options(command);
    output(await init(await context(opts), opts.apply === false), opts);
  });
program
  .command('apply')
  .description('Safely synchronize native assets.')
  .option('--force', 'repair drifted managed generated outputs')
  .option('--dry-run', 'print operations without mutation')
  .action(async (_opts, command: Command) => {
    const opts = options(command);
    output(await apply(await context(opts), opts.dryRun), opts);
  });
program
  .command('check')
  .description('Read-only strict validation for CI.')
  .action(async (_opts, command: Command) => {
    const opts = options(command);
    const ctx = await context(opts);
    const desired = await plan(ctx, true);
    output(
      {
        current: desired.issues.length === 0,
        issues: desired.issues,
        warnings: ctx.warnings,
      },
      opts,
    );
    if (desired.issues.length) process.exitCode = 1;
  });
program
  .command('status')
  .description('Fast read-only informational summary.')
  .action(async (_opts, command: Command) => {
    const opts = options(command);
    const ctx = await context(opts);
    const rows: {
      target: string;
      asset: string;
      path: string;
      state: string;
    }[] = [];
    for (const target of ctx.targets)
      for (const asset of ['instructions', 'skills', 'mcp']) {
        const name =
          target === 'claude'
            ? asset === 'instructions'
              ? 'CLAUDE.md'
              : asset === 'skills'
                ? '.claude/skills'
                : '.mcp.json'
            : asset === 'instructions'
              ? 'AGENTS.md'
              : asset === 'skills'
                ? '.agents/skills'
                : '.codex/config.toml';
        const p = path.join(ctx.root, name);
        await safePath(ctx.root, p, false);
        const stat = await exists(p);
        let state = stat ? 'present (run check to verify)' : 'missing';
        if (asset !== 'mcp' && stat?.isSymbolicLink()) {
          const expected = path.join(
            ctx.source,
            asset === 'skills' ? 'skills' : 'AGENTS.md',
          );
          state =
            path.resolve(path.dirname(p), await fs.readlink(p)) === expected &&
            (await exists(expected))
              ? 'linked'
              : 'drift';
        }
        rows.push({ target, asset, path: name, state });
      }
    output(
      {
        source: path.relative(ctx.root, ctx.source),
        sourceState: (await exists(ctx.source)) ? 'present' : 'missing',
        targets: rows,
        warnings: ctx.warnings,
      },
      opts,
    );
  });
program
  .command('doctor')
  .description('Read-only troubleshooting; --probe tests link creation.')
  .option('--probe', 'create and remove temporary probe files')
  .action(async (_opts, command: Command) => {
    const opts = options(command);
    const ctx = await context(opts);
    const diagnostics: Record<string, unknown> = {
      node: process.version,
      platform: process.platform,
      config: ctx.configPath,
      source: ctx.source,
      targets: ctx.targets,
    };
    try {
      const desired = await plan(ctx, true);
      diagnostics.issues = desired.issues;
    } catch (e) {
      diagnostics.error =
        e instanceof OmniError
          ? { code: e.code, message: e.message, path: e.path }
          : { code: 'APPLY_FAILED', message: 'Cannot inspect project.' };
    }
    try {
      await fs.access(ctx.root, fs.constants.W_OK);
      diagnostics.writableRoot = true;
    } catch {
      diagnostics.writableRoot = false;
    }
    diagnostics.linkCapability = 'not probed; run doctor --probe';
    if (opts.probe) {
      const dir = path.join(ctx.root, `.omniagents-probe-${randomUUID()}`);
      try {
        await fs.mkdir(dir);
        await fs.writeFile(path.join(dir, 'source'), 'probe');
        await fs.symlink('source', path.join(dir, 'link'), 'file');
        diagnostics.linkCapability = 'supported';
      } catch {
        diagnostics.linkCapability = 'unsupported; enable symlink privileges';
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
    diagnostics.suggestedFixes = [
      'omniagents explain ownership',
      'omniagents apply',
      'omniagents check',
    ];
    diagnostics.warnings = ctx.warnings;
    output(diagnostics, opts);
  });
program
  .command('explain [topic...]')
  .description('Bundled authoring documentation.')
  .action((topics: string[] | undefined, _opts, command: Command) => {
    const opts = options(command);
    const key = topics?.join(' ') || 'concepts';
    const doc = explanations[key];
    if (!doc)
      fail(
        'USAGE_ERROR',
        `Unknown topic. Available: ${Object.keys(explanations).join(', ')}`,
      );
    output(
      opts.json
        ? doc
        : `${doc.summary}\n\nCanonical path: ${doc.canonicalPath}\n${doc.structure}\n\n${doc.examples.join('\n')}\nNative outputs: ${doc.nativeOutputs.join(', ')}\nVerify: ${doc.commands.join('; ')}\nCommon mistakes: ${doc.commonMistakes.join('; ')}`,
      opts,
    );
  });
program
  .command('schema <topic>')
  .description('Emit JSON Schema draft 2020-12.')
  .action((topic: string) => {
    const data = topic === 'all' ? schemas : schemas[topic];
    if (!data)
      fail('USAGE_ERROR', 'Schema topic must be config, mcp, skill, or all.');
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  });
program
  .command('template <topic>')
  .description('Print a canonical template without mutation.')
  .action((topic: string) => {
    if (!templates[topic])
      fail(
        'USAGE_ERROR',
        `Unknown template. Available: ${Object.keys(templates).join(', ')}`,
      );
    process.stdout.write(templates[topic]);
  });
program
  .command('describe')
  .description('Describe product interfaces and resolved project.')
  .action(async (_opts, command: Command) => {
    const opts = options(command);
    const ctx = await context(opts);
    output(
      {
        version,
        source: path.relative(ctx.root, ctx.source),
        targets: ctx.targets,
        canonicalPaths: ['AGENTS.md', 'skills', 'mcp.toml'].map((p) =>
          path.relative(ctx.root, path.join(ctx.source, p)),
        ),
        configPath: path.relative(ctx.root, ctx.configPath),
        targetOutputs: {
          claude: ['CLAUDE.md', '.claude/skills', '.mcp.json'],
          codex: ['AGENTS.md', '.agents/skills', '.codex/config.toml'],
        },
        explainTopics: Object.keys(explanations),
        schemaTopics: Object.keys(schemas),
        templateTopics: Object.keys(templates),
        ownershipPolicy:
          'Refuse unmanaged conflicts; --force repairs only managed generated outputs.',
        warnings: ctx.warnings,
      },
      opts,
    );
  });
try {
  await program.parseAsync();
} catch (e) {
  if (e instanceof CommanderError && e.exitCode === 0) {
    /* help/version already printed */
  } else {
    const error =
      e instanceof OmniError
        ? e
        : e instanceof CommanderError
          ? new OmniError('USAGE_ERROR', e.message)
          : new OmniError(
              'APPLY_FAILED',
              'Operation failed. Run omniagents doctor and check filesystem permissions.',
            );
    if (process.argv.includes('--json'))
      process.stderr.write(
        `${JSON.stringify({ code: error.code, message: error.message, path: error.path })}\n`,
      );
    else
      process.stderr.write(
        `${error.code}: ${error.message}${error.path ? ` (${error.path})` : ''}\n`,
      );
    process.exitCode = error.code === 'USAGE_ERROR' ? 2 : 1;
  }
}
