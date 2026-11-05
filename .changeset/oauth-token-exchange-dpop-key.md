---
"@better-auth/oauth-provider": patch
---

With `oauthTokenExchange()`, a client that exchanges its own DPoP-bound access token must now prove the same key, as it does for a refresh. It sends a DPoP proof signed by that key, or its `clientAuthentication` strategy returns that key as `confirmation`. The exchanged token stays bound to that key, and a request that does not prove it fails with `invalid_dpop_proof`. Exchanges by a resource server are unchanged: the exchanged token is bound to the resource server's own proof, or is a bearer token when it sends none and none is required.

DPoP checks on an exchange now run before `allowExchange`. A request that fails them never reaches your policy.
