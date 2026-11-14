---
"@better-auth/oauth-provider": patch
---

Introspection and revocation no longer report a valid JWT access token as inactive when two auth instances share one `jwt()` plugin object. Each instance now caches its own signing keys.
