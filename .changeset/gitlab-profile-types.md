---
"@better-auth/core": minor
---

GitLab profile mappings must handle nullable details and omitted conditional fields. `locked` is now a required boolean; null avatars leave stored images unchanged when profile updates are enabled.
