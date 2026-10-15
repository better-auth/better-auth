---
"@better-auth/core": minor
---

Discord profile callbacks now accept identities without optional user metadata. Missing email verification defaults to `false`; profile mappings must handle omitted metadata.
