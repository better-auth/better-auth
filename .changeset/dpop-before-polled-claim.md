---
"@better-auth/oauth-provider": minor
"@better-auth/ciba": patch
---

Device authorization and CIBA clients that poll the token endpoint with a missing or invalid DPoP proof now receive `invalid_dpop_proof` and can poll again with a valid proof. Previously the rejected poll used up the approved device code or CIBA request, so the user had to approve again. Clients that send valid proofs, or no proof when none is required, are unaffected.

Extension grants that consume a one-time credential can call `provider.resolveConfirmation()` before the claim and pass its result to `issueTokens` as `confirmation` to get the same behavior.
