---
"@better-auth/oauth-provider": minor
---

`/oauth2/introspect` now finds a token sent with the wrong `token_type_hint`, as RFC 7662 requires. Before, introspecting a valid refresh token with `token_type_hint=access_token`, or a valid access token with `token_type_hint=refresh_token`, returned `{ active: false }`. Those requests now return `active: true` with the token's details.

If a resource server or test relies on a mismatched hint to get `{ active: false }`, drop the hint or send the right one. Requests without a hint, or with the correct one, are unaffected.
