---
"@better-auth/core": minor
---

**Breaking:** `LinearUser.avatarUrl` is now required and typed as `string | null`; custom profiles must include it, and mappings must handle `null`. Null avatars preserve stored images during enabled profile updates, and authorization scopes are comma-separated.
