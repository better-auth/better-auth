---
"@better-auth/oauth-provider": minor
---

UserInfo now answers an access token without the `openid` scope with `403 insufficient_scope` and a challenge naming `openid`, as RFC 6750 and OpenID Connect describe. Before, it returned `400 invalid_scope`.

UserInfo no longer reads an `Authorization` header without the `Bearer` or `DPoP` scheme as a bare token. Such a request now gets a `401` challenge, like a request without a token. Send the token as `Authorization: Bearer <token>`.
