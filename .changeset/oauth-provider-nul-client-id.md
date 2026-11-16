---
"@better-auth/oauth-provider": patch
---

A client ID containing a NUL character now gets the same `invalid_client` response as any unknown client. Before, endpoints that look up the client returned a 500 on Postgres, which rejects NUL in text values.
