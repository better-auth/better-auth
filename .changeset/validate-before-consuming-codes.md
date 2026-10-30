---
"@better-auth/oauth-provider": patch
---

An authorization code exchange that fails validation no longer uses up the code. Before, the code was consumed before the `code_verifier`, `redirect_uri`, resource, and DPoP proof were checked, so a client that retried with a corrected request got `invalid_grant` and the user had to authorize again. Anyone holding an intercepted code could also burn it with a wrong verifier before the legitimate client redeemed it. Codes are now consumed only after the request passes every check, and they stay single-use: a code that was already redeemed still returns `invalid_grant` and revokes the tokens issued from it.
