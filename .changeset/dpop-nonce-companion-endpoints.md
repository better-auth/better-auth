---
"@better-auth/oauth-provider": minor
---

Plugin endpoints on the auth server can accept DPoP proofs with the token endpoint's rules, including server-provided nonces. Call `verifyDpopProof()` on `getOAuthProviderApi(ctx, opts)` to verify the request's proof and get its key thumbprint. When `dpop.nonce.required` is on, a proof without a current nonce fails with `use_dpop_nonce` and a fresh `DPoP-Nonce`, and a verified proof sets the next nonce. `issueDpopNonce()` sets a fresh nonce for an endpoint that only hands out nonces.
