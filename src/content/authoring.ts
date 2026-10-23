import ci from '../../skills/anyagents-authoring/references/ci.md';
import definitions from '../../skills/anyagents-authoring/references/definitions.md';
import skill from '../../skills/anyagents-authoring/SKILL.md';

export const authoringFiles: Record<string, string> = {
  'SKILL.md': skill,
  'references/definitions.md': definitions,
  'references/ci.md': ci,
};
export const authoringGuide = definitions;
export const ciGuide = ci;
