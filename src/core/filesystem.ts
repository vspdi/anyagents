import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fail } from './errors.js';
export const exists = async (p: string) => {
  try {
    return await fs.lstat(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
};
export function inside(root: string, candidate: string): boolean {
  const r = path.relative(root, candidate);
  return (
    r === '' ||
    (!r.startsWith(`..${path.sep}`) && r !== '..' && !path.isAbsolute(r))
  );
}
export async function safePath(
  root: string,
  candidate: string,
  includeLeaf = true,
): Promise<void> {
  if (!inside(root, candidate))
    fail('CONFIG_INVALID', 'Path must remain inside project root.', candidate);
  const relative = path.relative(
    root,
    includeLeaf ? candidate : path.dirname(candidate),
  );
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await exists(current);
    if (stat?.isSymbolicLink())
      fail(
        'DESTINATION_CONFLICT',
        'Symlink traversal is refused; use an ordinary directory.',
        current,
      );
  }
}
export function hash(data: string | Buffer): string {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`;
}
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export async function atomicWrite(p: string, content: string): Promise<void> {
  const temp = `${p}.${randomUUID()}.tmp`;
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    const previous = await exists(p);
    await fs.writeFile(temp, content, {
      flag: 'wx',
      mode: previous?.mode ?? 0o644,
    });
    await fs.rename(temp, p);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
export async function files(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink())
        fail(
          'CONFIG_INVALID',
          'Canonical source cannot contain symlinks.',
          full,
        );
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) result.push(full);
      else
        fail(
          'CONFIG_INVALID',
          'Canonical source must contain regular files.',
          full,
        );
    }
  }
  await walk(root);
  return result.sort();
}
export async function sourceHash(
  root: string,
  paths: string[],
  version: string,
): Promise<string> {
  const h = createHash('sha256').update(`1:${version}`);
  for (const p of paths.sort((a, b) =>
    path.relative(root, a) < path.relative(root, b)
      ? -1
      : path.relative(root, a) > path.relative(root, b)
        ? 1
        : 0,
  )) {
    const name = Buffer.from(path.relative(root, p).split(path.sep).join('/'));
    const bytes = await fs.readFile(p);
    const decoded = bytes.toString('utf8');
    const content =
      !bytes.includes(0) && Buffer.from(decoded).equals(bytes)
        ? Buffer.from(decoded.replace(/\r\n/g, '\n'))
        : bytes;
    h.update(`${name.length}:`)
      .update(name)
      .update(`${content.length}:`)
      .update(content);
  }
  return `sha256:${h.digest('hex')}`;
}
