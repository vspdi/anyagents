export class OmniError extends Error {
  constructor(
    public code: string,
    message: string,
    public path?: string,
  ) {
    super(message);
  }
}
export function fail(code: string, message: string, path?: string): never {
  throw new OmniError(code, message, path);
}
