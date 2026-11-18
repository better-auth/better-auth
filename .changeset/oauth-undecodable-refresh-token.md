---
"@better-auth/oauth-provider": patch
---

Introspection and revocation no longer return a `500` when a custom `formatRefreshToken.decrypt` throws a JOSE error about the value itself, such as `compactDecrypt` does, for a value that is not a refresh token. This happened for an unknown token sent without a hint or with `token_type_hint=refresh_token`, and for an access token sent with `token_type_hint=refresh_token`. Introspection now reports these as `{ active: false }`, and revocation answers with a `400`, as it does for any other unknown token. A `decrypt` that throws a key set failure (`JWKSTimeout`, `JWKSInvalid`, or `JWKSMultipleMatchingKeys`) or any other error still returns a `500`, so a failing key service is not mistaken for an inactive token.
