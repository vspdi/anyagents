import { parse, stringify } from 'smol-toml';
import { stable } from '../core/filesystem.js';

type Table = Record<string, unknown>;

/** One top-level line group of a TOML document. */
interface Item {
  kind: 'trivia' | 'header' | 'keyValue';
  /** Full key path: the header path, or table path plus dotted key. */
  path: string[] | null;
  /** First line, inclusive. */
  start: number;
  /** Last line, exclusive (a value can span several lines). */
  end: number;
}

/**
 * For each line, whether a new statement can start there: not inside a
 * multiline string and not inside an open array or inline table.
 */
function statementStarts(text: string): boolean[] {
  type State =
    | 'normal'
    | 'comment'
    | 'basic'
    | 'literal'
    | 'mlBasic'
    | 'mlLiteral';
  let state: State = 'normal';
  let depth = 0;
  const result = [true];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') {
      if (state !== 'mlBasic' && state !== 'mlLiteral') state = 'normal';
      result.push(state === 'normal' && depth === 0);
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
      else if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth = Math.max(0, depth - 1);
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

/**
 * Reads a dotted key starting at `from`, stopping at `terminator`.
 * Returns null when the text is not a readable key.
 */
function readKey(
  line: string,
  from: number,
  terminator: string,
): string[] | null {
  let i = from;
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
    else if (line.startsWith(terminator, i)) return keys;
    else return null;
  }
}

function items(lines: string[]): Item[] {
  const starts = statementStarts(lines.join('\n'));
  const result: Item[] = [];
  let table: string[] | null = [];
  for (let start = 0; start < lines.length; start++) {
    if (!starts[start]) continue;
    let end = start + 1;
    while (end < lines.length && !starts[end]) end++;
    const line = lines[start];
    const first = line.search(/\S/);
    if (first < 0 || line[first] === '#') {
      result.push({ kind: 'trivia', path: null, start, end });
    } else if (line[first] === '[') {
      const array = line[first + 1] === '[';
      table = readKey(line, first + (array ? 2 : 1), array ? ']]' : ']');
      result.push({ kind: 'header', path: table, start, end });
    } else {
      const key = readKey(line, first, '=');
      result.push({
        kind: 'keyValue',
        path: table && key ? [...table, ...key] : null,
        start,
        end,
      });
    }
  }
  return result;
}

const isTrivia = (item: Item | undefined) => item?.kind === 'trivia';

/**
 * Replaces, adds, or removes the entries of `<table>` named in `updates`
 * (value, or undefined to remove), keeping every other line, including
 * comments, as written. Entries may be written as `[table.name]` sections,
 * dotted keys, or inline tables; edited entries are written back as
 * sections. The result is re-parsed and must equal `expected`. If it does
 * not, the whole document is re-serialized: still correct, but comments
 * are lost, so `preserved` is false and callers should tell the user.
 */
export function replaceTomlTables(
  text: string,
  table: string,
  updates: Record<string, Table | undefined>,
  expected: Table,
): { text: string; preserved: boolean } {
  const lines = text.replace(/\n$/, '').split('\n');
  const all = items(lines);
  const expectedEntries = (expected[table] ?? {}) as Record<string, Table>;
  const removed = new Set<number>();
  const remove = (item: Item) => {
    for (let i = item.start; i < item.end; i++) removed.add(i);
  };
  /** Entry names to write as sections, with where to put them. */
  const writes = new Map<string, number | 'end'>();
  const sectionOf = (header: number) => {
    const section = [all[header]];
    for (let n = header + 1; n < all.length && all[n].kind !== 'header'; n++)
      section.push(all[n]);
    // Trailing comments and blank lines belong to the next section.
    while (section.length > 1 && isTrivia(section.at(-1))) section.pop();
    return section;
  };
  const owner = (path: string[] | null) =>
    path && path.length >= 2 && path[0] === table ? path[1] : undefined;

  all.forEach((item, index) => {
    const path = item.path;
    if (!path || item.kind === 'trivia') return;
    // `table = { … }` holds several entries inline: rewrite all as sections.
    if (item.kind === 'keyValue' && path.length === 1 && path[0] === table) {
      remove(item);
      for (const name of Object.keys(expectedEntries))
        if (!writes.has(name)) writes.set(name, 'end');
      return;
    }
    const name = owner(path);
    if (name === undefined || !Object.hasOwn(updates, name)) return;
    if (item.kind === 'header') {
      sectionOf(index).forEach(remove);
      // In place only at a header: inserted sections would capture any
      // root-level keys that follow a dotted key.
      if (!writes.has(name)) writes.set(name, item.start);
    } else {
      remove(item);
      if (writes.get(name) === undefined) writes.set(name, 'end');
    }
  });
  for (const name of Object.keys(updates))
    if (!writes.has(name)) writes.set(name, 'end');
  // A bare `[table]` header left with no entries would parse as an empty table.
  if (!(table in expected))
    all.forEach((item, index) => {
      if (
        item.kind === 'header' &&
        item.path?.length === 1 &&
        item.path[0] === table &&
        sectionOf(index)
          .slice(1)
          .every((member) => isTrivia(member) || removed.has(member.start))
      )
        remove(item);
    });

  const block = (name: string) =>
    stringify({ [table]: { [name]: expectedEntries[name] } })
      .trimEnd()
      .split('\n');
  const insertAt = new Map<number, string[]>();
  const appended: string[] = [];
  for (const [name, at] of [...writes].sort(([a], [b]) => a.localeCompare(b))) {
    if (!expectedEntries[name]) continue;
    if (at === 'end') appended.push('', ...block(name));
    else insertAt.set(at, block(name));
  }

  const output: string[] = [];
  // Removing adjacent statements can leave their blank separators stacked.
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
    if (stable(parse(result)) === stable(expected))
      return { text: result, preserved: true };
  } catch {
    // Fall through to a full rewrite.
  }
  return { text: stringify(expected), preserved: false };
}
