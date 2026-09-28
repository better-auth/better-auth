---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/sso": patch
---

Add `session.storeTokenHash` to store a SHA-256 hash of the session token in the database and secondary storage instead of the raw token, so a leaked database or cache can no longer be used to sign in as your users. It is off by default. When enabled, `listSessions` returns the stored hash instead of a usable token, and the revoke endpoints accept either value.
