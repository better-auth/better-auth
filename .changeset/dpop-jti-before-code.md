---
"@better-auth/oauth-provider": minor
---

A token request that sends an authorization code or device code with an already-used DPoP proof no longer uses up the code. The request still fails with `invalid_dpop_proof`, and the client can retry with a fresh proof. When two requests send the same code with the same proof at once, the one that does not get tokens now fails with `invalid_dpop_proof` instead of `invalid_grant`.
