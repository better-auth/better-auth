---
"@better-auth/core": minor
---

GitLab profile callbacks now accept null profile details, including avatars and pronouns, and omitted conditional fields such as compute-minute limits. Missing avatars leave the local image unset and preserve existing user images when profile updates are enabled. Profile mappings must handle these null or missing values.
