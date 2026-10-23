import pkg from '../../package.json' with { type: 'json' };
import { authoringFiles, authoringGuide, ciGuide } from './authoring.js';
export const version = pkg.version;
export const templates: Record<string, string> = {
  marketplace:
    'version: 1\nowner:\n  name: Example Team\nplugins:\n  review:\n    source:\n      kind: local\n      path: ./plugins/review\n    detail:\n      codex:\n        category: Productivity\n        policy:\n          installation: AVAILABLE\n          authentication: ON_INSTALL\n',
  plugin:
    'version: 1\nrelease: 0.1.0\ndescription: Code review tools\nauthor:\n  name: Example Team\n',
  'authoring-skill': authoringFiles['SKILL.md'],
  config:
    'version: 1\nsource:\n  dir: .ai\ntargets:\n  claude: true\n  codex: true\nlinks:\n  mode: symlink\ngit:\n  managed_outputs: commit\n',
  skill:
    '---\nname: example\ndescription: Explain repository conventions when asked how to work in this repository.\n---\n\n# Example\n\nRead repository instructions and report the relevant conventions.\n',
  'mcp-stdio':
    'version: 1\nmcp:\n  playwright:\n    transport: stdio\n    command: npx\n    args:\n      - -y\n      - "@playwright/mcp@latest"\n',
  'mcp-http':
    'version: 1\nmcp:\n  project-docs:\n    transport: http\n    url: https://example.invalid/mcp\n    headers:\n      Authorization: Bearer ${PROJECT_DOCS_TOKEN}\n',
};
export function instructions(source: string): string {
  return `# Repository instructions\n\nAdd repository-specific guidance here.\n\n## AnyAgents authoring contract\n\nThis repository uses AnyAgents to share instructions, skills, and MCP configuration across Claude Code and Codex.\n\n- Edit \`${source}/AGENTS.md\` for shared repository instructions.\n- Add skills under \`${source}/skills/<name>/SKILL.md\`.\n- Add MCP servers to \`${source}/mcp.yaml\`.\n- Configure source and targets in \`anyagents.yaml\`.\n- Author canonical sources only; do not edit linked or generated native destinations.\n\nBefore authoring unfamiliar assets, run:\n\n\`\`\`sh\nnpx anyagents explain authoring\nnpx anyagents explain skills\nnpx anyagents explain mcp\nnpx anyagents schema config\nnpx anyagents schema mcp\nnpx anyagents schema skill\nnpx anyagents template skill\nnpx anyagents template mcp-stdio\n\`\`\`\n\nFor plugins and marketplaces, run \`npx anyagents explain marketplaces\`, \`npx anyagents explain plugins\`, and \`npx anyagents explain ci\`. The bundled anyagents-authoring skill describes their scoped definitions.\n\nAfter canonical changes, run \`npx anyagents apply\` (or \`apply --target <current-target>\`), then \`npx anyagents check\`. Report changed canonical files and verification results.\n`;
}
const outputs = [
  'CLAUDE.md',
  '.claude/skills',
  '.mcp.json',
  'AGENTS.md',
  '.agents/skills',
  '.codex/config.toml',
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
): Explanation {
  return {
    topic: name,
    summary,
    canonicalPath,
    structure,
    examples: [example],
    nativeOutputs: outputs,
    commands: ['anyagents apply', 'anyagents check'],
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
    ['Editing generated catalogs.', 'Missing Codex category or policy.'],
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
  ),
  ci: topic(
    'ci',
    'Read-only CI checks on fresh checkouts.',
    'anyagents.yaml',
    ciGuide,
    'anyagents check --strict',
    ['Running apply before check in CI.'],
  ),
  concepts: topic(
    'concepts',
    'One canonical source, native discovery files for Claude Code and Codex. Local-only, explicit apply, no telemetry.',
    '.ai/',
    'Instructions, portable Agent Skills, and MCP definitions.',
    instructions('.ai'),
    ['Editing generated native files.'],
  ),
  config: topic(
    'config',
    'Configure source, enabled targets, symlink mode, and committed native outputs.',
    'anyagents.yaml',
    'version: 1; project (default true); marketplaces.<id>.source/output; source.dir; targets.claude/codex; links.mode=symlink; git.managed_outputs=commit. CLI overrides config. Config paths are relative to its containing directory; --source is relative to --cwd. Unknown config fields warn.',
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
  ),
  mcp: topic(
    'mcp',
    'Define STDIO and HTTP servers once; never resolve secrets.',
    '.ai/mcp.yaml',
    'version: 1; mcp.<name> with transport, enabled (default true). stdio: command, args, env, cwd. http: url, headers. Server names sorted; args order retained. Claude has no documented cwd support: cwd is Codex-only. Codex translates Authorization="Bearer ${TOKEN}" to bearer_token_env_var and whole-header ${VAR} to env_http_headers. STDIO env placeholders must reference the same variable name. Codex cannot interpolate URL/command/args/cwd or arbitrary embedded placeholders. Unsupported selected-target mappings fail before mutation.',
    templates['mcp-http'],
    [
      'Committing plaintext credentials.',
      'Unsupported embedded placeholder mappings.',
      'Executing untrusted MCP commands.',
    ],
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
    'State records links, generated hashes, individual Codex MCP entry hashes, and marketplace artifact hashes. CI checks do not require this local state. State is ignored. Exact generated content and correct links can be adopted after clone. Unrelated Codex settings/servers remain intact. TOML comments may be reformatted on a managed change. State commits only after successful execution; failed writes roll back. Removing targets leaves their outputs untouched. No uninstall in v0.1.',
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
  ),
};
