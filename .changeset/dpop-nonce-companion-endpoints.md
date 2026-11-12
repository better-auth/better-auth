---
"@better-auth/oauth-provider": minor
---

Plugin endpoints on the auth server can verify DPoP proofs with the token endpoint's rules, including server-provided nonces. Call `verifyDpopProof()` or `issueDpopNonce()` on `getOAuthProviderApi(ctx, opts)`. Do not combine `verifyDpopProof()` with `issueTokens` or `resolveConfirmation` on one request, because they already verify the proof. A proof on an `auth.api` call without an HTTP request fails. Custom `OAuthProviderApi` implementations must add both methods.
