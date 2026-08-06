---
"@better-auth/oauth-provider": patch
---

Refresh-token requests now return `invalid_grant` with an `invalid refresh token` description when a client tries to use a refresh token issued to another OAuth client.
