---
"@better-auth/oauth-provider": minor
---

`customTokenResponseFields` and `extensions[].claims.idToken` contributors now run after the DPoP check and after `beforeTokenIssuance`.

A token request with a rejected DPoP proof no longer reaches either callback. An error thrown from either now comes after the request's DPoP proof is used. For authorization code, device code, and CIBA requests, it also comes after the one-time credential is consumed, so a retry needs a new code or request. Refresh and client credentials requests need only a new proof. If you throw from one of them to refuse tokens, move that check to `beforeTokenIssuance`, which runs before a device code or CIBA request is consumed.
