import { parse, stringify } from 'smol-toml';
import { stable } from '../core/filesystem.js';

type Table = Record<string, unknown>;

/**
 * For each line, whether it starts inside a multiline string. Header-like
 * text inside such strings must not be treated as a table header.
 */
function linesInsideStrings(text: string): boolean[] {
  type State =
    | 'normal'
    | 'comment'
    | 'basic'
    | 'literal'
    | 'mlBasic'
    | 'mlLiteral';
  let state: State = 'normal';
  const result = [false];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') {
      if (state !== 'mlBasic' && state !== 'mlLiteral') state = 'normal';
      result.push(state !== 'normal');
      continue;
    }
    if (state === 'normal') {
      if (c === '#') state = 'comment';
      else if (text.startsWith('"""', i)) {
        state = 'mlBasic';
        i += 2;
      } else if (text.startsWith("'''", i)) {
        state = 'mlLiteral';
        i += 2;
      } else if (c === '"') state = 'basic';
      else if (c === "'") state = 'literal';
    } else if (state === 'basic' || state === 'mlBasic') {
      if (c === '\\') i++;
      else if (state === 'basic' && c === '"') state = 'normal';
      else if (state === 'mlBasic' && text.startsWith('"""', i)) {
        state = 'normal';
        i += 2;
      }
    } else if (state === 'literal' && c === "'") state = 'normal';
    else if (state === 'mlLiteral' && text.startsWith("'''", i)) {
      state = 'normal';
      i += 2;
    }
  }
  return result;
}

/** Key path of a `[table]` or `[[array]]` header line, or null if unreadable. */
function headerPath(line: string): string[] | null {
  let i = line.indexOf('[') + 1;
  if (line[i] === '[') i++;
  const keys: string[] = [];
  const skipSpace = () => {
    while (line[i] === ' ' || line[i] === '\t') i++;
  };
  for (;;) {
    skipSpace();
    let key: string;
    if (line[i] === '"') {
      const end = /^"(?:[^"\\]|\\.)*"/.exec(line.slice(i));
      if (!end) return null;
      try {
        key = JSON.parse(end[0]);
      } catch {
        return null;
      }
      i += end[0].length;
    } else if (line[i] === "'") {
      const end = line.indexOf("'", i + 1);
      if (end < 0) return null;
      key = line.slice(i + 1, end);
      i = end + 1;
    } else {
      const bare = /^[A-Za-z0-9_-]+/.exec(line.slice(i));
      if (!bare) return null;
      key = bare[0];
      i += key.length;
    }
    keys.push(key);
    skipSpace();
    if (line[i] === '.') i++;
    else if (line[i] === ']') return keys;
    else return null;
  }
}

interface Section {
  path: string[] | null;
  start: number;
  /** Exclusive; trailing comments and blank lines belong to the next section. */
  end: number;
}
function sections(lines: string[]): Section[] {
  const inside = linesInsideStrings(lines.join('\n'));
  const headers = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => !inside[index] && /^\s*\[/.test(line));
  return headers.map(({ line, index }, n) => {
    let end = headers[n + 1]?.index ?? lines.length;
    while (end > index + 1 && /^\s*(#.*)?$/.test(lines[end - 1])) end--;
    return { path: headerPath(line), start: index, end };
  });
}

/**
 * Replaces, adds, or removes `[<table>.<name>]` sections in TOML text,
 * keeping every other line (including comments) as written. `updates`
 * maps each changed name to its new value, or undefined to remove it.
 * The result is re-parsed and must equal `expected`; otherwise the whole
 * document is re-serialized, which is always correct but drops comments.
 */
export function replaceTomlTables(
  text: string,
  table: string,
  updates: Record<string, Table | undefined>,
  expected: Table,
): string {
  const lines = text.replace(/\n$/, '').split('\n');
  const all = sections(lines);
  const removed = new Set<number>();
  const insertAt = new Map<number, string[]>();
  const appended: string[] = [];
  const block = (name: string, value: Table) =>
    stringify({ [table]: { [name]: value } })
      .trimEnd()
      .split('\n');
  for (const [name, value] of Object.entries(updates).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const owned = all.filter(
      (s) =>
        s.path &&
        s.path.length >= 2 &&
        s.path[0] === table &&
        s.path[1] === name,
    );
    for (const section of owned)
      for (let i = section.start; i < section.end; i++) removed.add(i);
    if (!value) continue;
    if (owned.length) insertAt.set(owned[0].start, block(name, value));
    else appended.push('', ...block(name, value));
  }
  const output: string[] = [];
  // Removing adjacent sections can leave their blank separators stacked.
  let removedSinceContent = false;
  lines.forEach((line, index) => {
    const inserted = insertAt.get(index);
    if (inserted) output.push(...inserted);
    if (removed.has(index)) {
      removedSinceContent = true;
      return;
    }
    const blank = line.trim() === '';
    if (blank && removedSinceContent && output.at(-1)?.trim() === '') return;
    if (!blank) removedSinceContent = false;
    output.push(line);
  });
  while (output.length && output[output.length - 1].trim() === '') output.pop();
  if (!output.length) appended.shift();
  const result = `${[...output, ...appended].join('\n')}\n`;
  try {
    if (stable(parse(result)) === stable(expected)) return result;
  } catch {
    // Fall through to a full rewrite.
  }
  return stringify(expected);
}
