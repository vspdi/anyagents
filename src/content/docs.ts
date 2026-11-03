import { targets } from '@alchemisten/anyagents-marketplaces';
import pkg from '../../package.json' with { type: 'json' };
import { adapters, projectOutputs } from '../adapters/targets.js';
import type { Target } from '../core/context.js';
import { authoringFiles, authoringGuide, ciGuide } from './authoring.js';
export const version = pkg.version;
export const templates: Record<string, string> = {
  marketplace:
    'version: 1\nowner:\n  name: Example Team\nplugins:\n  review:\n    source:\n      kind: local\n      path: ./plugins/review\n    detail:\n      codex:\n        category: Productivity\n        policy:\n          installation: AVAILABLE\n          authentication: ON_INSTALL\n',
  plugin:
    'version: 1\nrelease: 0.1.0\ndescription: Code review tools\nauthor:\n  name: Example Team\n',
  'authoring-skill': authoringFiles['SKILL.md'],
  config:
    'version: 1\nsource:\n  dir: .ai\ntargets:\n  claude: true\n  codex: true\n  opencode: false\n  copilot: false\nopencode:\n  schema: v2\nlinks:\n  mode: symlink\ngit:\n  managed_outputs: commit\n',
  skill:
    '---\nname: example\ndescription: Explain repository conventions when asked how to work in this repository.\n---\n\n# Example\n\nRead repository instructions and report the relevant conventions.\n',
  'mcp-stdio':
    'version: 1\nmcp:\n  playwright:\n    transport: stdio\n    command: npx\n    args:\n      - -y\n      - "@playwright/mcp@latest"\n',
  'mcp-http':
    'version: 1\nmcp:\n  project-docs:\n    transport: http\n    url: https://example.invalid/mcp\n    headers:\n      Authorization: Bearer ${PROJECT_DOCS_TOKEN}\n',
};
export function instructions(source: string): string {
  return `# Repository instructions\n\nAdd repository-specific guidance here.\n\n## AnyAgents authoring contract\n\nThis repository uses AnyAgents to share instructions, skills, and MCP configuration across the coding clients enabled in \`anyagents.yaml\` (Claude Code, Codex, OpenCode, and GitHub Copilot).\n\n- Edit \`${source}/AGENTS.md\` for shared repository instructions.\n- Add skills under \`${source}/skills/<name>/SKILL.md\`.\n- Add MCP servers to \`${source}/mcp.yaml\`.\n- Configure source and targets in \`anyagents.yaml\`.\n- Author canonical sources only; do not edit linked or generated native destinations.\n\nUse the project's pinned AnyAgents version when it is a dev dependency (\`npx anyagents\` runs it). Before authoring unfamiliar assets, run:\n\n\`\`\`sh\nnpx anyagents explain authoring\nnpx anyagents explain skills\nnpx anyagents explain mcp\nnpx anyagents schema config\nnpx anyagents schema mcp\nnpx anyagents schema skill\nnpx anyagents template skill\nnpx anyagents template mcp-stdio\n\`\`\`\n\nFor plugins and marketplaces, run \`npx anyagents explain marketplaces\`, \`npx anyagents explain plugins\`, and \`npx anyagents explain ci\`. The bundled anyagents-authoring skill describes their scoped definitions.\n\nAfter canonical changes, run \`npx anyagents apply\`, then \`npx anyagents check\`. If you applied a single target with \`apply --target <target>\`, verify it with \`check --target <target>\` and run a full \`apply\` before committing. Report changed canonical files and verification results.\n`;
}
const targetOutputs = (target: Target) =>
  projectOutputs(target).map((output) => output.path);
/** Targets share destinations such as AGENTS.md; list each path once. */
const unique = (values: string[]): string[] => [...new Set(values)];
const projectPaths = unique(targets.flatMap(targetOutputs));
const bundlePaths = targets.map((target) => `<output>/plugins/${target}/<id>/`);
const marketplacePaths = [
  ...targets.flatMap((target) => {
    const catalogPath = adapters[target].catalogPath;
    return catalogPath ? [`<output>/${catalogPath}`] : [];
  }),
  ...bundlePaths,
];
export interface Explanation {
  topic: string;
  summary: string;
  canonicalPath: string;
  structure: string;
  examples: string[];
  nativeOutputs: string[];
  commands: string[];
  commonMistakes: string[];
}
function topic(
  name: string,
  summary: string,
  canonicalPath: string,
  structure: string,
  example: string,
  commonMistakes: string[],
  {
    nativeOutputs = projectPaths,
    commands = ['anyagents apply', 'anyagents check'],
  }: { nativeOutputs?: string[]; commands?: string[] } = {},
): Explanation {
  return {
    topic: name,
    summary,
    canonicalPath,
    structure,
    examples: [example],
    nativeOutputs,
    commands,
    commonMistakes,
  };
}
export const explanations: Record<string, Explanation> = {
  marketplaces: topic(
    'marketplaces',
    'Author one or more marketplace catalogs.',
    'anyagents.yaml marketplaces.<id>.source',
    authoringGuide,
    templates.marketplace,
    [
      'Editing generated catalogs.',
      'Missing Codex category or policy.',
      'Expecting an OpenCode catalog: OpenCode has none, so each plugin becomes a package you publish or install from Git.',
    ],
    { nativeOutputs: marketplacePaths },
  ),
  plugins: topic(
    'plugins',
    'Author isolated plugin bundles.',
    '<plugin>/plugin.yaml',
    authoringGuide,
    templates.plugin,
    [
      'Mixing project and plugin MCP.',
      'Overriding canonical fields in detail.',
    ],
    { nativeOutputs: bundlePaths },
  ),
  ci: topic(
    'ci',
    'Read-only CI checks on fresh checkouts.',
    'anyagents.yaml',
    ciGuide,
    'anyagents check --strict',
    ['Running apply before check in CI.'],
    { commands: ['anyagents check --strict'] },
  ),
  concepts: topic(
    'concepts',
    'One canonical source, native discovery files for Claude Code, Codex, OpenCode, and GitHub Copilot. Local-only, explicit apply, no telemetry.',
    '.ai/',
    'Instructions, portable Agent Skills, and MCP definitions.',
    instructions('.ai'),
    ['Editing generated native files.'],
  ),
  config: topic(
    'config',
    'Configure source, enabled targets, symlink mode, and committed native outputs.',
    'anyagents.yaml',
    'version: 1; project (default true); marketplaces.<id>.source/output; source.dir; targets.claude/codex (default true) and targets.opencode/copilot (default false); opencode.schema=v1|v2 (default v2) selects where OpenCode MCP servers go in opencode.json; links.mode=symlink; git.managed_outputs=commit. CLI overrides config; --target all selects every target. Config paths are relative to its containing directory; --source is relative to --cwd. Unknown config fields warn.',
    templates.config,
    ['Source outside project root.', 'Unsupported copy or ignore mode.'],
  ),
  skills: topic(
    'skills',
    'Portable Agent Skills shared through directory links.',
    '.ai/skills/<name>/SKILL.md',
    'YAML frontmatter requires kebab-case name matching directory and nonempty description. Unknown metadata warns. Markdown body and supporting files are preserved. Canonical symlinks are refused.',
    templates.skill,
    [
      'Directory/frontmatter name mismatch.',
      'Missing SKILL.md or frontmatter.',
    ],
    {
      nativeOutputs: unique(
        targets.map((target) => adapters[target].skillsPath),
      ),
    },
  ),
  mcp: topic(
    'mcp',
    'Define STDIO and HTTP servers once; never resolve secrets.',
    '.ai/mcp.yaml',
    'version: 1; mcp.<name> with transport, enabled (default true). stdio: command, args, env, cwd. http: url, headers. Server names sorted; args order retained. Claude and Copilot project MCP have no documented cwd support: cwd works for Codex and OpenCode only. OpenCode maps stdio to type local (command and args become one command array, env becomes environment) and http to type remote, converts ${NAME} to {env:NAME}, and cannot express ${NAME:-default}. Copilot shares the Claude .mcp.json and cannot expand URL placeholders. Codex translates Authorization="Bearer ${TOKEN}" to bearer_token_env_var and whole-header ${VAR} to env_http_headers. STDIO env placeholders must reference the same variable name. Codex cannot interpolate URL/command/args/cwd or arbitrary embedded placeholders. Unsupported selected-target mappings fail before mutation.',
    templates['mcp-http'],
    [
      'Committing plaintext credentials.',
      'Unsupported embedded placeholder mappings.',
      'Executing untrusted MCP commands.',
    ],
    {
      nativeOutputs: unique(targets.map((target) => adapters[target].mcpPath)),
    },
  ),
  authoring: topic(
    'authoring',
    'Humans and agents edit canonical sources, then apply and check.',
    '.ai/',
    'Before authoring an unfamiliar asset, use explain, schema, and template. apply --target can update one target; check without --target validates all enabled targets.',
    instructions('.ai'),
    [
      'Editing native outputs.',
      'Checking all targets after applying only one changed target.',
    ],
  ),
  ownership: topic(
    'ownership',
    'Refuse unmanaged conflicts; force repairs only previously managed generated entries.',
    '.anyagents/state.json',
    'State records links, generated hashes, individual Codex and OpenCode MCP entry hashes, and marketplace artifact hashes. CI checks do not require this local state. State is Git-ignored. Exact generated content and correct links can be adopted after clone. Targets that share a destination (AGENTS.md, .agents/skills, and the Claude/Copilot .mcp.json) must agree on it and plan it once. Unrelated Codex settings/servers and comments remain intact; only the lines of managed mcp_servers entries change (verified by re-parsing; a full rewrite, if ever needed, is reported as a warning). opencode.json keeps its other settings and comments; only managed MCP entries change. State commits only after successful execution; failed writes roll back. Removing targets leaves their outputs untouched. There is no uninstall command.',
    templates.config,
    [
      'Using --force to overwrite unmanaged files.',
      'Deleting state while relying on drift ownership.',
    ],
  ),
  'target claude': topic(
    'target claude',
    'Claude Code discovers CLAUDE.md, .claude/skills, and .mcp.json.',
    '.ai/',
    'Relative instruction/skill symlinks; deterministic project MCP JSON. The entire .mcp.json is owned. cwd cannot be mapped portably.',
    templates['mcp-stdio'],
    ['Existing unmanaged .mcp.json.', 'Expecting cwd to work in Claude.'],
    { nativeOutputs: targetOutputs('claude') },
  ),
  'target codex': topic(
    'target codex',
    'Codex discovers AGENTS.md, .agents/skills, and project .codex/config.toml.',
    '.ai/',
    'Relative links; structural TOML merge owns only corresponding mcp_servers entries. Unrelated settings and unmanaged servers are preserved. Codex may require project trust before project MCP is loaded.',
    templates['mcp-http'],
    [
      'Treating static http_headers as environment expansion.',
      'Overwriting unrelated Codex config.',
    ],
    { nativeOutputs: targetOutputs('codex') },
  ),
  'target opencode': topic(
    'target opencode',
    'OpenCode discovers AGENTS.md, .agents/skills, and MCP servers in opencode.json.',
    '.ai/',
    'AGENTS.md and .agents/skills are shared links, also used by Codex and Copilot. Only managed entries of the mcp object in opencode.json change; other settings and comments stay. Set opencode.schema to v2 (default; servers under mcp.servers) or v1 (servers directly under mcp). OpenCode starts OAuth for remote servers that answer 401; AnyAgents does not disable it. Marketplace output is one npm package per plugin (package.json, a fixed index.js loader for OpenCode 1 and 2, skills, and generated MCP data) under <output>/plugins/opencode/<id>/. Publish it to npm or install it from Git; AnyAgents does neither. The loader expands {env:NAME} from the environment in memory at startup and never writes secrets.',
    templates['mcp-stdio'],
    [
      'Using the v1 layout with OpenCode 2, or the reverse.',
      'Expecting a catalog file: OpenCode has none.',
      'Using ${NAME:-default}, which OpenCode cannot express.',
    ],
    { nativeOutputs: targetOutputs('opencode') },
  ),
  'target copilot': topic(
    'target copilot',
    'GitHub Copilot CLI discovers AGENTS.md, .agents/skills, and project .mcp.json.',
    '.ai/',
    'AGENTS.md and .agents/skills are shared links. The project .mcp.json has the same content as Claude, so selecting both plans it once. Copilot CLI loads it only after folder trust. cwd and URL placeholders are not supported. Marketplace output is <output>/.github/plugin/marketplace.json plus Agent Plugins 1.0 bundles under <output>/plugins/copilot/<id>/ with skills, assets, scripts, and mcp.json. Hooks, agents, and commands are not packaged for Copilot. Instructions are verified for the CLI only, not for VS Code or GitHub.com.',
    templates['mcp-http'],
    [
      'Expecting hooks, agents, or commands in Copilot bundles.',
      'Expecting URL placeholders to expand.',
    ],
    { nativeOutputs: targetOutputs('copilot') },
  ),
};
