import type { Target } from '../core/context.js';
import type { Mcp } from '../formats/canonical.js';
import { nativeServers } from '../formats/native.js';
export interface TargetAdapter {
  name: Target;
  instructionPath: string;
  skillsPath: string;
  mcpPath: string;
  /** Relative to a marketplace output root. */
  catalogPath: string;
  /** Relative to a generated plugin bundle. */
  pluginManifestPath: string;
  /** Relative to a generated plugin bundle. */
  pluginMcpPath: string;
  servers(mcp: Mcp): Record<string, Record<string, unknown>>;
}
export const adapters: Record<Target, TargetAdapter> = {
  claude: {
    name: 'claude',
    instructionPath: 'CLAUDE.md',
    skillsPath: '.claude/skills',
    mcpPath: '.mcp.json',
    catalogPath: '.claude-plugin/marketplace.json',
    pluginManifestPath: '.claude-plugin/plugin.json',
    pluginMcpPath: '.mcp.json',
    servers: (mcp) => nativeServers(mcp, 'claude'),
  },
  codex: {
    name: 'codex',
    instructionPath: 'AGENTS.md',
    skillsPath: '.agents/skills',
    mcpPath: '.codex/config.toml',
    catalogPath: '.agents/plugins/marketplace.json',
    pluginManifestPath: 'plugin.json',
    pluginMcpPath: 'mcp.json',
    servers: (mcp) => nativeServers(mcp, 'codex'),
  },
};
/** Project outputs for one target, keyed by the canonical asset they come from. */
export const projectOutputs = (target: Target) => {
  const adapter = adapters[target];
  return [
    {
      asset: 'instructions',
      path: adapter.instructionPath,
      source: 'AGENTS.md',
    },
    { asset: 'skills', path: adapter.skillsPath, source: 'skills' },
    { asset: 'mcp', path: adapter.mcpPath, source: 'mcp.yaml' },
  ] as const;
};
