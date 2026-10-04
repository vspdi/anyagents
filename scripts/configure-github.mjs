import { spawnSync } from 'node:child_process';

const repo = 'vspdi/anyagents';
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
  allow_merge_commit: true,
  allow_rebase_merge: false,
  allow_squash_merge: true,
  squash_merge_commit_title: 'PR_TITLE',
  squash_merge_commit_message: 'PR_BODY',
  merge_commit_title: 'PR_TITLE',
  merge_commit_message: 'PR_BODY',
  delete_branch_on_merge: false,
});
const name = 'Default';
const existing = api('GET', `repos/${repo}/rulesets`).find(
  (rule) => rule.name === name,
);
const ruleset = {
  name,
  target: 'branch',
  enforcement: 'active',
  bypass_actors: [],
  conditions: {
    ref_name: { include: ['refs/heads/dev', 'refs/heads/main'], exclude: [] },
  },
  rules: [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: true,
        allowed_merge_methods: ['merge', 'squash'],
      },
    },
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        do_not_enforce_on_create: false,
        required_status_checks: [
          { context: 'quality', integration_id: 15368 },
          { context: 'conventional-title', integration_id: 15368 },
        ],
      },
    },
  ],
};
api(
  existing ? 'PUT' : 'POST',
  `repos/${repo}/rulesets${existing ? `/${existing.id}` : ''}`,
  ruleset,
);
console.log(
  'Configured dev default, protected main/dev, and squash/merge options. Squash feature PRs; merge promotion and synchronization PRs.',
);
