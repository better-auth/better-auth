---
"@better-auth/ciba": minor
---

`beforeTokenIssuance` can now read the CIBA request a token poll redeemed, with the new `cibaGrantRequestFrom(input)`.

It returns the request's `requestId`, `bindingMessage`, requested `acrValues`, `approvedScopes`, `approvedResources`, and `createdAt`, or `undefined` for an issuance from another grant. The poll has already claimed the request, so a refusal is final, and `access_denied` tells the client the request was denied (CIBA §11). Before, a policy had to read the request in its own token-endpoint hook before the grant deleted it.
