---
"@better-auth/oauth-provider": patch
---

The consent update endpoint now checks consent ownership before looking up the referenced client, consistent with the get and delete consent endpoints.
