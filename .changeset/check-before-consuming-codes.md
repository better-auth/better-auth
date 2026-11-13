---
"@better-auth/oauth-provider": patch
---

A token request that fails validation no longer uses up its authorization code or approved device code. Before, the code was consumed before the `code_verifier`, `redirect_uri`, `resource`, and DPoP proof were checked, so a client that retried with a corrected request got `invalid_grant` and the user had to sign in or approve the device again. Codes are now consumed only after the request passes validation. A DPoP proof whose `jti` was already used is still detected after the code is consumed, so that request uses up the code and returns `invalid_dpop_proof`, as before. Codes stay single-use, and an authorization code presented after redemption still revokes the tokens issued from it.
