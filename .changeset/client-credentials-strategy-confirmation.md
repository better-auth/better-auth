---
"@better-auth/oauth-provider": minor
---

A `client_credentials` token is now bound to the `confirmation` a `clientAuthentication` strategy returns, such as an mTLS certificate thumbprint. Before, the grant ignored it and issued an unbound token, unless the request also carried a DPoP proof. The token's `cnf` now holds that confirmation, and introspection returns it.

When the strategy returns a DPoP key (`jkt`), the token type is now `DPoP`, so the client must send a DPoP proof with each call. Strategies that return no confirmation are unaffected.
