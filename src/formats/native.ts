import { fail } from '../core/errors.js';
import type { Mcp, Server } from './canonical.js';
export function claudeServer(server: Server): Record<string, unknown> {
  if (server.transport === 'http')
    return {
      type: 'http',
      url: server.url,
      ...(server.headers ? { headers: server.headers } : {}),
    };
  if (server.cwd)
    fail(
      'CANONICAL_MCP_INVALID',
      'Claude project MCP has no documented cwd field; omit cwd when targeting Claude.',
    );
  return {
    command: server.command,
    ...(server.args ? { args: server.args } : {}),
    ...(server.env ? { env: server.env } : {}),
  };
}
export function codexServer(server: Server): Record<string, unknown> {
  if (server.transport === 'stdio') {
    const env: Record<string, string> = {};
    const env_vars: string[] = [];
    for (const [name, value] of Object.entries(server.env ?? {})) {
      const variable = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
      if (variable && variable[1] === name) env_vars.push(name);
      else {
        if (value.includes('${'))
          fail(
            'CANONICAL_MCP_INVALID',
            'Codex env placeholders must reference the same variable name.',
          );
        env[name] = value;
      }
    }
    for (const value of [
      server.command,
      ...(server.args ?? []),
      server.cwd ?? '',
    ])
      if (value.includes('${'))
        fail(
          'CANONICAL_MCP_INVALID',
          'Codex cannot expand command, args, or cwd placeholders.',
        );
    return {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(Object.keys(env).length ? { env } : {}),
      ...(env_vars.length ? { env_vars: env_vars.sort() } : {}),
      ...(server.cwd ? { cwd: server.cwd } : {}),
    };
  }
  if (server.url.includes('${'))
    fail('CANONICAL_MCP_INVALID', 'Codex cannot expand URL placeholders.');
  const http_headers: Record<string, string> = {};
  const env_http_headers: Record<string, string> = {};
  let bearer_token_env_var: string | undefined;
  for (const [name, value] of Object.entries(server.headers ?? {})) {
    const bearer = value.match(/^Bearer \$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
    const variable = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
    if (name.toLowerCase() === 'authorization' && bearer)
      bearer_token_env_var = bearer[1];
    else if (variable) env_http_headers[name] = variable[1];
    else {
      if (value.includes('${'))
        fail(
          'CANONICAL_MCP_INVALID',
          'Codex supports whole-header env placeholders and Authorization Bearer placeholders only.',
        );
      http_headers[name] = value;
    }
  }
  return {
    url: server.url,
    ...(bearer_token_env_var ? { bearer_token_env_var } : {}),
    ...(Object.keys(http_headers).length ? { http_headers } : {}),
    ...(Object.keys(env_http_headers).length ? { env_http_headers } : {}),
  };
}
export function nativeServers(
  mcp: Mcp,
  target: 'claude' | 'codex',
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.keys(mcp.mcp)
      .sort()
      .filter((name) => mcp.mcp[name].enabled)
      .map((name) => [
        name,
        target === 'claude'
          ? claudeServer(mcp.mcp[name])
          : codexServer(mcp.mcp[name]),
      ]),
  );
}
