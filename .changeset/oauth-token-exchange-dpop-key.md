---
"@better-auth/oauth-provider": patch
---

With `oauthTokenExchange()`, a client that exchanges its own DPoP-bound access token must now send a DPoP proof signed by the same key, as it does for a refresh. The exchanged token stays bound to that key. A request without that proof fails with `invalid_dpop_proof`. Exchanges by a resource server are unchanged: the exchanged token is bound to the resource server's own proof, or is a bearer token when it sends none and none is required.

A missing or invalid DPoP proof on an exchange now fails before `allowExchange` runs. Your policy is not called for those requests.
