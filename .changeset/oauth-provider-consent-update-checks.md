---
"@better-auth/oauth-provider": patch
---

The consent update endpoint now checks consent ownership before looking up the referenced client, and responds with `404 NOT_FOUND` when the consent references a client that no longer exists. Both behaviors now match the get and delete consent endpoints.
