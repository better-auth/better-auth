---
"@better-auth/oauth-provider": patch
---

`provider.verifyDpopProof()` accepts an `expectedJkt` option, so a plugin endpoint can require a later request to carry a DPoP proof signed with the key an earlier request proved. A missing proof, or a proof signed with another key, fails with `invalid_dpop_proof`.
