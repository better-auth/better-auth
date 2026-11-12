---
"@better-auth/oauth-provider": minor
---

Reusing an authorization code now revokes the tokens issued from it only when the reuse comes from the client the code was issued to: the request must authenticate as that client and, for a code issued with PKCE, carry the matching `code_verifier`. Before, any second request with the code revoked those tokens, so someone holding a leaked public-client code could revoke the client's tokens without its `code_verifier`. Every reuse is still rejected. A confidential client that reuses a PKCE code with its secret but without the `code_verifier` no longer revokes its tokens.

The provider remembers a redeemed code for the longer of `accessTokenExpiresIn` and `refreshTokenExpiresIn` after redemption (30 days by default), and each refresh-token rotation extends that record. A reuse during that time revokes the tokens even after the code itself has expired.
