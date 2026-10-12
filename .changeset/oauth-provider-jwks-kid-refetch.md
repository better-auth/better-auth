---
"@better-auth/oauth-provider": patch
---

Refetch a client's `jwks_uri` only when the `private_key_jwt` assertion's `kid` is missing from the cached key set, and limit refetches to one per client every 60 seconds.
