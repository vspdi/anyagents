// Embedded verbatim into every generated OpenCode package (see opencode.ts).
// It runs inside the consumer's OpenCode, so keep it dependency-free and
// offline: no network access, no child processes, no dynamic code.
//
// OpenCode 2 calls `setup`; OpenCode 1 (1.18.7+) calls `server`. Skills and
// MCP servers the user already defines under the same name are never replaced.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(path.join(root, 'anyagents.opencode.json'), 'utf8'),
);
const skillsDir = path.join(root, 'skills');
const servers = Object.entries(data.mcp);

// Fills {plugin:root} and {env:NAME} in memory. Secrets are never written.
const expand = (value) => {
  if (typeof value === 'string')
    return value
      .replaceAll('{plugin:root}', root)
      .replace(
        /\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g,
        (_, name) => process.env[name] ?? '',
      );
  if (Array.isArray(value)) return value.map(expand);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, expand(item)]),
    );
  return value;
};

const readSkill = ({ id, name, description }) => {
  const file = path.join(skillsDir, id, 'SKILL.md');
  const content = readFileSync(file, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n?/, '');
  return { id, name, description, path: file, content };
};

export default {
  id: data.id,

  async setup(ctx) {
    if (data.skills.length)
      await ctx.skill.transform((editor) => {
        for (const skill of data.skills) {
          if (editor.get(skill.id)) continue;
          // A throw here would disable the whole plugin, so skip one skill.
          try {
            editor.add(readSkill(skill));
          } catch (error) {
            console.error(`[${data.id}] skipped skill ${skill.id}:`, error);
          }
        }
      });
    if (servers.length)
      await ctx.mcp.transform((editor) => {
        for (const [name, server] of servers)
          if (!editor.get(name)) editor.set(name, expand(server));
      });
  },

  async server() {
    return {
      config: async (config) => {
        if (data.skills.length) {
          config.skills = config.skills || {};
          config.skills.paths = config.skills.paths || [];
          if (!config.skills.paths.includes(skillsDir))
            config.skills.paths.push(skillsDir);
        }
        if (servers.length) {
          config.mcp = config.mcp || {};
          for (const [name, server] of servers)
            if (!(name in config.mcp)) config.mcp[name] = expand(server);
        }
      },
    };
  },
};
