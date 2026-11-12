---
"@better-auth/oauth-provider": patch
---

A token request that fails validation no longer uses up its authorization code or approved device code. Before, the code was consumed before the `code_verifier`, `redirect_uri`, `resource`, and DPoP proof were checked, so a client that retried with a corrected request got `invalid_grant` and the user had to sign in or approve the device again. Codes are now consumed only after the request passes every check. They stay single-use: when two requests redeem a code at once, exactly one gets tokens, and an authorization code presented after redemption still revokes the tokens issued from it.
