import { parseDocument } from 'yaml';
import { fail } from '../core/errors.js';

export const yaml = (
  text: string,
  code = 'CONFIG_INVALID',
  path?: string,
): Record<string, unknown> => {
  const doc = parseDocument(text, {
    uniqueKeys: true,
    version: '1.2',
    schema: 'core',
  });
  if (doc.errors.length || doc.warnings.length)
    fail(code, 'Invalid YAML; use unique keys and standard YAML types.', path);
  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 0 });
  } catch {
    return fail(
      code,
      'YAML aliases are not supported; write explicit values.',
      path,
    );
  }
  const inspect = (item: unknown, depth: number): void => {
    if (depth > 64) fail(code, 'YAML nesting exceeds 64 levels.', path);
    if (item && typeof item === 'object') {
      for (const [key, nested] of Object.entries(item)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          fail(code, 'Unsafe YAML property name.', path);
        inspect(nested, depth + 1);
      }
    }
  };
  inspect(value, 0);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(code, 'Expected a YAML mapping.', path);
  return value as Record<string, unknown>;
};
