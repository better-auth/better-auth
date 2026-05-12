---
"@better-auth/oauth-provider": patch
---

The consent update endpoint now responds with `404 NOT_FOUND` when the consent record references a client that no longer exists, instead of letting the update succeed against stale data.
