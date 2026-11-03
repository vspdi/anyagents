import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'anyagents-pack-'));
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === 'npm',
  });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
try {
  const packed = JSON.parse(
    run(
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', temp],
      root,
    ),
  );
  const tarball = path.join(temp, packed[0].filename);
  run(
    'npm',
    [
      'install',
      '--prefix',
      temp,
      '--ignore-scripts',
      '--offline',
      '--no-audit',
      '--no-fund',
      tarball,
    ],
    temp,
  );
  const installed = JSON.parse(
    readFileSync(
      path.join(temp, 'node_modules', 'anyagents', 'package.json'),
      'utf8',
    ),
  );
  if (Object.keys(installed.dependencies ?? {}).length)
    throw new Error('Bundled package must not install production dependencies');
  const cli = path.join(temp, 'node_modules', 'anyagents', 'dist', 'cli.js');
  run('npm', ['exec', '--offline', '--', 'anyagents', '--help'], temp);
  run(process.execPath, [cli, '--help'], temp);
  run(process.execPath, [cli, 'init', '--no-apply'], temp);
  const initialized = spawnSync(process.execPath, [cli, 'apply', '--json'], {
    cwd: temp,
    encoding: 'utf8',
  });
  if (
    initialized.status !== 0 &&
    initialized.stderr.includes('LINK_UNSUPPORTED')
  ) {
    console.log(
      'Packed CLI works; platform correctly reports unavailable file symlink privileges.',
    );
  } else {
    if (initialized.status !== 0) throw new Error(initialized.stderr);
    run(process.execPath, [cli, 'check'], temp);
    const reapplied = JSON.parse(
      run(process.execPath, [cli, 'apply', '--json'], temp),
    );
    if (reapplied.operations.length)
      throw new Error('Packed CLI apply is not idempotent');
    console.log(
      'Packed CLI install, init, apply, check, and idempotence passed.',
    );
  }
  const marketplace = path.join(temp, 'marketplace-smoke');
  mkdirSync(path.join(marketplace, '.ai', 'plugins', 'review'), {
    recursive: true,
  });
  writeFileSync(
    path.join(marketplace, 'anyagents.yaml'),
    'version: 1\nproject: false\nmarketplaces:\n  sample:\n    source: .ai/marketplace.yaml\n    output: .\n',
  );
  writeFileSync(
    path.join(marketplace, '.ai', 'marketplace.yaml'),
    run(process.execPath, [cli, 'template', 'marketplace'], temp),
  );
  writeFileSync(
    path.join(marketplace, '.ai', 'plugins', 'review', 'plugin.yaml'),
    run(process.execPath, [cli, 'template', 'plugin'], temp),
  );
  run(process.execPath, [cli, 'apply'], marketplace);
  rmSync(path.join(marketplace, '.anyagents'), { recursive: true });
  run(process.execPath, [cli, 'check', '--strict'], marketplace);
  const manifest = JSON.parse(
    readFileSync(
      path.join(marketplace, 'plugins', 'codex', 'review', 'plugin.json'),
      'utf8',
    ),
  );
  if (manifest.name !== 'review')
    throw new Error('Packed CLI generated an invalid plugin identity');
  run(process.execPath, [cli, 'explain', 'ci'], temp);
  if (
    !readFileSync(
      path.join(
        temp,
        '.ai',
        'skills',
        'anyagents-authoring',
        'references',
        'ci.md',
      ),
      'utf8',
    ).includes('check --strict')
  )
    throw new Error('Missing bundled CI recipe');
  console.log(
    'Packed CLI marketplace generation, fresh-checkout strict validation, and authoring skill passed.',
  );
  const clients = path.join(temp, 'clients-smoke');
  mkdirSync(path.join(clients, '.ai', 'plugins', 'review'), {
    recursive: true,
  });
  run(
    process.execPath,
    [cli, 'init', '--target', 'opencode,copilot', '--no-apply'],
    clients,
  );
  const clientConfig = path.join(clients, 'anyagents.yaml');
  writeFileSync(
    clientConfig,
    readFileSync(clientConfig, 'utf8').replace(
      'marketplaces: {}',
      'marketplaces:\n  sample:\n    source: .ai/marketplace.yaml\n    output: .',
    ),
  );
  writeFileSync(
    path.join(clients, '.ai', 'mcp.yaml'),
    'version: 1\nmcp:\n  docs:\n    transport: http\n    url: https://example.invalid/mcp\n',
  );
  writeFileSync(
    path.join(clients, '.ai', 'marketplace.yaml'),
    run(process.execPath, [cli, 'template', 'marketplace'], temp),
  );
  writeFileSync(
    path.join(clients, '.ai', 'plugins', 'review', 'plugin.yaml'),
    run(process.execPath, [cli, 'template', 'plugin'], temp),
  );
  const clientApply = spawnSync(process.execPath, [cli, 'apply', '--json'], {
    cwd: clients,
    encoding: 'utf8',
  });
  if (
    clientApply.status !== 0 &&
    clientApply.stderr.includes('LINK_UNSUPPORTED')
  )
    console.log(
      'Packed CLI OpenCode and Copilot targets skipped; platform reports unavailable file symlink privileges.',
    );
  else {
    if (clientApply.status !== 0) throw new Error(clientApply.stderr);
    const readClient = (...parts) =>
      readFileSync(path.join(clients, ...parts), 'utf8');
    const opencode = JSON.parse(readClient('opencode.json'));
    if (opencode.mcp?.servers?.docs?.type !== 'remote')
      throw new Error('Packed CLI wrote an invalid OpenCode MCP layout');
    if (JSON.parse(readClient('.mcp.json')).mcpServers?.docs?.type !== 'http')
      throw new Error('Packed CLI wrote an invalid Copilot MCP file');
    if (
      JSON.parse(readClient('.github', 'plugin', 'marketplace.json')).name !==
      'sample'
    )
      throw new Error('Packed CLI generated an invalid Copilot catalog');
    const loader = readClient('plugins', 'opencode', 'review', 'index.js');
    if (
      !loader.startsWith('// Generated by AnyAgents') ||
      !loader.includes('export default {')
    )
      throw new Error('Packed CLI did not embed the OpenCode loader');
    if (
      JSON.parse(readClient('plugins', 'opencode', 'review', 'package.json'))
        .name !== 'review'
    )
      throw new Error('Packed CLI generated an invalid OpenCode package');
    rmSync(path.join(clients, '.anyagents'), { recursive: true });
    run(process.execPath, [cli, 'check', '--strict'], clients);
    console.log(
      'Packed CLI OpenCode and Copilot project output, catalogs, loader embedding, and strict validation passed.',
    );
  }
  if (
    !readFileSync(path.join(temp, '.ai', 'AGENTS.md'), 'utf8').includes(
      'authoring',
    )
  )
    throw new Error('Missing bootstrap contract');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
