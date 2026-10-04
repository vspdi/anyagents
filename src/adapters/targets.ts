import type { Target } from '../core/context.js';
import type { Mcp } from '../formats/canonical.js';
import { nativeServers } from '../formats/native.js';
export interface TargetAdapter {
  name: Target;
  instructionPath: string;
  skillsPath: string;
  mcpPath: string;
  servers(mcp: Mcp): Record<string, Record<string, unknown>>;
}
export const adapters: Record<Target, TargetAdapter> = {
  claude: {
    name: 'claude',
    instructionPath: 'CLAUDE.md',
    skillsPath: '.claude/skills',
    mcpPath: '.mcp.json',
    servers: (mcp) => nativeServers(mcp, 'claude'),
  },
  codex: {
    name: 'codex',
    instructionPath: 'AGENTS.md',
    skillsPath: '.agents/skills',
    mcpPath: '.codex/config.toml',
    servers: (mcp) => nativeServers(mcp, 'codex'),
  },
};
