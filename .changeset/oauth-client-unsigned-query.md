---
"@better-auth/oauth-provider": patch
---

oauthProviderClient no longer rewrites request bodies on pages whose query string is not a signed OAuth query, so ISO date strings and form-encoded bodies are sent as written.
