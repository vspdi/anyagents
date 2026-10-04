import { spawnSync } from 'node:child_process';

const repo = 'vspdi/omniagents';
function api(method, route, data) {
  const result = spawnSync(
    'gh',
    ['api', '--method', method, route, ...(data ? ['--input', '-'] : [])],
    { input: data ? JSON.stringify(data) : undefined, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}
api('PATCH', `repos/${repo}`, {
  default_branch: 'dev',
  allow_merge_commit: false,
  allow_rebase_merge: false,
  allow_squash_merge: true,
  squash_merge_commit_title: 'PR_TITLE',
  squash_merge_commit_message: 'PR_BODY',
  delete_branch_on_merge: false,
});
for (const branch of ['dev', 'main'])
  api('PUT', `repos/${repo}/branches/${branch}/protection`, {
    required_status_checks: {
      strict: true,
      contexts: ['quality', 'conventional-title'],
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      dismiss_stale_reviews: true,
    },
    restrictions: null,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true,
  });
console.log(
  'Configured dev default, squash-only merges, PR title messages, and protected main/dev.',
);
