---
"@better-auth/oauth-provider": patch
---

The `requireActiveAccessToken` documentation now states that it checks only the token. For a DPoP-bound token, your endpoint must also call `enforceDpopBinding` from `better-auth/oauth2` with the request and a shared replay store.
