---
"@better-auth/oauth-provider": patch
---

A client ID with characters outside the range RFC 6749 allows, such as NUL, now gets the same `invalid_client` response as any unknown client, instead of a 500 on PostgreSQL.
