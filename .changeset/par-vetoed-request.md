---
"@better-auth/oauth-provider": patch
---

A pushed authorization request that a `verification.create.before` hook keeps from being stored now fails with `server_error` instead of returning a `request_uri` that cannot be used. If storing it on its first visit fails, the authorization request now fails with `invalid_request_uri` right away, instead of after login and consent.
