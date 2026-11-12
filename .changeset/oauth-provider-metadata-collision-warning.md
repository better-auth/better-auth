---
"@better-auth/oauth-provider": patch
---

The OAuth provider now logs a warning when two extensions contribute the same discovery metadata key. The first-registered extension's value is still the one served, so discovery output is unchanged, but the dropped contribution is no longer silent.
