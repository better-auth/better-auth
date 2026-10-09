---
"@better-auth/core": patch
---

Correct the `GithubProfile` interface to match GitHub's actual API response: `id` and the repo/gist/follower counters are `number`, optional profile fields (`name`, `company`, `blog`, `location`, `hireable`, `bio`, `twitter_username`, `gravatar_id`) allow `null`, and the authenticated-only fields (`private_gists`, `total_private_repos`, `owned_private_repos`, `disk_usage`, `collaborators`, `two_factor_authentication`, `plan`) are optional. Custom `getUserInfo` implementations can now return a real GitHub API response without a type assertion.

Type-level breaking change: consumers that read `profile.id` or the counters as `string`, or access `plan` and the `private_*` fields unconditionally, will see type errors on upgrade. The previous types did not match GitHub's actual API — `id` was always a `number` at runtime — so no runtime behavior changes.
