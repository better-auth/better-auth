---
"@better-auth/oauth-provider": patch
---

`oauthProviderClient` no longer rewrites request bodies on pages whose query string is not a signed OAuth query, so ISO timestamp strings, form bodies and top-level arrays are sent as written.
