---
"@better-auth/core": minor
---

`validateAuthorizationCode`, `refreshAccessToken`, `clientCredentialsToken`, and `pushAuthorizationRequest` accept a `fetch` option, so a request can go through `createDpopFetch` to send DPoP proofs.
