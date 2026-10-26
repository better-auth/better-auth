---
"@better-auth/oauth-provider": patch
---

Device authorization clients that poll the token endpoint with a missing or invalid DPoP proof now receive `invalid_dpop_proof` and can poll again with a valid proof. Previously the rejected poll used up the approved device code, so the user had to approve again. Clients that send valid proofs, or no proof when none is required, are unaffected.

Extension grants that consume a one-time credential can call the new `provider.resolveConfirmation()` before the claim and pass its result to `issueTokens` as `confirmation` to get the same behavior. A grant that also passes a `verificationValue` or `refreshToken` to `issueTokens` should pass the same one to `resolveConfirmation`, so the proof must match the DPoP key it bound.
