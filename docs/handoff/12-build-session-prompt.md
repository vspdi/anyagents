# Prompt for the implementation agent

Use the following as the initial implementation-session prompt after attaching this handoff:

```text
Implement OmniAgents v0.1 from the attached handoff.

Read every Markdown file before proposing implementation. Treat 00-README.md as the index and 11-decisions-and-open-questions.md as the decision record.

First inspect the repository. Then summarize:
1. existing project state;
2. any conflict between the repository and handoff;
3. exact implementation phases;
4. goals and acceptance checks.

Do not implement until those goals are confirmed unless I explicitly waive the gate.

Implementation constraints:
- TypeScript, Node.js 20+, one npm package.
- Keep dependencies minimal.
- Support Claude Code and Codex only.
- Canonical source defaults to .ai and is configurable.
- Symlink instructions and skill directories.
- Generate/merge MCP formats safely.
- Never overwrite unmanaged user content silently.
- Preserve unrelated .codex/config.toml settings.
- Build explain/schema/template output as public product interfaces.
- Run tests and provide concrete command output before claiming completion.
- Verify native MCP mappings against current official Claude and Codex documentation.

When ambiguities appear, choose the smallest behavior consistent with the product contract and record the decision in the repository documentation.
```
