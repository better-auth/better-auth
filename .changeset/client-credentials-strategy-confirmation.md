---
"@better-auth/oauth-provider": minor
---

A `client_credentials` token is now bound to the `confirmation` a `clientAuthentication` strategy returns, such as an mTLS certificate thumbprint. Before, the grant ignored it and issued an unbound token, unless the request also carried a DPoP proof. The token's `cnf` now holds that confirmation, and introspection returns it.

When the strategy returns a DPoP key (`jkt`), the token type is now `DPoP`. The client must then send a DPoP proof with each request to a protected resource. Strategies that return no confirmation are unaffected.

A confirmation that is not a DPoP key, such as a certificate thumbprint, no longer replaces a required DPoP binding in any grant, including extension grants. When the client is registered with `dpop_bound_access_tokens: true`, or a resource sets `dpopBoundAccessTokensRequired: true`, such an issuance now fails with `invalid_dpop_proof` instead of returning a token without a DPoP binding. `provider.resolveConfirmation()` applies the same rule, so the device code and CIBA grants reject it before they consume the code.
