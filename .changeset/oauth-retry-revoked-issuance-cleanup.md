---
"@better-auth/oauth-provider": patch
---

A token request that races with grant revocation now returns `invalid_grant` when a retry clears a database deadlock during token cleanup. Previously, the first failed delete returned HTTP 500.
