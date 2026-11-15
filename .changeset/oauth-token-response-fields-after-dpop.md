---
"@better-auth/oauth-provider": minor
---

`customTokenResponseFields` and `extensions[].claims.idToken` contributors now run after the DPoP check and after `beforeTokenIssuance`.

A token request with a rejected DPoP proof no longer reaches either callback. An error thrown from either now comes after the request's DPoP proof is used, so the client needs a new proof to retry. If you throw from one of them to refuse tokens, move that check to `beforeTokenIssuance`.
