---
"@better-auth/oauth-provider": minor
---

`/oauth2/revoke` now returns `200` for an unknown, expired, or already revoked token, as RFC 7009 requires. Before, these requests returned `400 invalid_request`, including a second revoke of the same refresh token and a revoke that raced a refresh.

A token sent with the wrong `token_type_hint` is now revoked. Before, sending a refresh token with `token_type_hint=access_token`, or an opaque access token with `token_type_hint=refresh_token`, returned `400` and left the token active.

If your client or tests treat a `400` from `/oauth2/revoke` as "token already gone", expect `200` instead. A JWT access token still returns `400 unsupported_token_type`, and failed client authentication still returns `401`.
