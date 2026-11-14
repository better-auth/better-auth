---
"@better-auth/oauth-provider": minor
---

`provider.requireActiveAccessToken` now refuses a DPoP-bound access token with `401 invalid_token` and a `DPoP` challenge. Before, it accepted the token without checking a DPoP proof, so a leaked DPoP-bound token worked at an endpoint that used it. Protected endpoints should call `provider.verifyResourceRequest()`, which checks the proof. `provider.validateAccessToken` still returns the claims of any token.
