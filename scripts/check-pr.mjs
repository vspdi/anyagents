export function validTitle(title) {
  return /^(feat|fix|perf|refactor|docs|test|build|ci|chore|style|revert)(\([a-zA-Z0-9._/-]+\))?(!)?: \S[^\r\n]*$/.test(
    title,
  );
}
export function validFlow(base, head, headRepo, baseRepo) {
  return base !== 'main' || (head === 'dev' && headRepo === baseRepo);
}
if (process.env.PR_TITLE !== undefined) {
  if (!validTitle(process.env.PR_TITLE)) {
    console.error(
      'PR title must be a Conventional Commit, e.g. feat(cli): add MCP validation.',
    );
    process.exitCode = 1;
  }
  if (
    !validFlow(
      process.env.BASE_BRANCH,
      process.env.HEAD_BRANCH,
      process.env.HEAD_REPO,
      process.env.BASE_REPO,
    )
  ) {
    console.error(
      'PRs to main must promote dev from this repository. Feature PRs target dev.',
    );
    process.exitCode = 1;
  }
}
