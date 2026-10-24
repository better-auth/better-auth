---
"@better-auth/core": minor
---

`GithubProfile.id` and account counters are now numbers. Profile mappings must handle nullable details and omitted scope-dependent fields, including `twitter_username`. Private-account and enterprise fields are available when returned by GitHub.
