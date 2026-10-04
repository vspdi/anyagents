import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'omniagents-pack-'));
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
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
      '--no-audit',
      '--no-fund',
      tarball,
    ],
    temp,
  );
  const cli = path.join(
    temp,
    'node_modules',
    '@vspdi',
    'omniagents',
    'dist',
    'cli.js',
  );
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
  if (
    !readFileSync(path.join(temp, '.ai', 'AGENTS.md'), 'utf8').includes(
      'authoring',
    )
  )
    throw new Error('Missing bootstrap contract');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
