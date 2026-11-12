---
"@better-auth/oauth-provider": patch
---

When a client exchanges its own access token with `oauthTokenExchange()`, and that token is bound by a mechanism other than DPoP, such as an mTLS certificate in `cnf["x5t#S256"]`, the client's `clientAuthentication` strategy must now return the same `confirmation`. Otherwise the exchange fails with `invalid_request`. DPoP-bound tokens, and exchanges by a service in the token's audience, are unchanged.
