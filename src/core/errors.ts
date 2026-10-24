export type ErrorCode =
  | 'USAGE_ERROR'
  | 'CONFIG_INVALID'
  | 'CONFIG_NOT_FOUND'
  | 'SOURCE_NOT_FOUND'
  | 'CANONICAL_MCP_INVALID'
  | 'SKILL_INVALID'
  | 'MARKETPLACE_INVALID'
  | 'DESTINATION_CONFLICT'
  | 'OUTPUT_DRIFT'
  | 'LINK_UNSUPPORTED'
  | 'APPLY_FAILED';
export class AnyAgentsError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public path?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
export function fail(code: ErrorCode, message: string, path?: string): never {
  throw new AnyAgentsError(code, message, path);
}
/** Adds a warning once; planning runs more than once per apply. */
export function warn(warnings: string[], message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}
/** Warns when an MCP header looks like a literal bearer token. */
export function warnPlaintextBearer(
  warnings: string[],
  headers: Record<string, string> | undefined,
  owner: string,
): void {
  if (
    Object.values(headers ?? {}).some(
      (value) => /^Bearer\s+/.test(value) && !value.includes('${'),
    )
  )
    warn(
      warnings,
      `${owner} contains a possible plaintext bearer token. Prefer an environment placeholder.`,
    );
}
