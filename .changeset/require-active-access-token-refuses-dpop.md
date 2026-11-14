---
"@better-auth/oauth-provider": minor
---

`provider.requireActiveAccessToken` now refuses a DPoP-bound access token with `401 invalid_token` and a `DPoP` challenge. Before, it accepted the token without checking a DPoP proof, so a leaked DPoP-bound token worked at an endpoint that used it. Endpoints that call `requireActiveAccessToken` and then `enforceDpopBinding` now reject every DPoP-bound token; replace both calls with `provider.verifyResourceRequest()`, which checks the proof. `provider.validateAccessToken` still returns the claims of any token.
