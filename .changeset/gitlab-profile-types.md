---
"@better-auth/core": minor
---

GitLab profile callbacks now accept null profile details, including avatars and pronouns, and omitted conditional fields such as compute-minute limits on Free instances. Missing avatars leave the local image unset. Profile mappings must handle these null or missing values.
