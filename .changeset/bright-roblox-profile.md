---
"@better-auth/core": minor
---

**Breaking:** `RobloxProfile` scoped fields are now optional, `picture` also permits `null`, and custom claims are `unknown`; update profile mappings accordingly. Missing avatars preserve stored images when profile updates are enabled.
