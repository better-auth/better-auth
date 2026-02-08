---
"@better-auth/oauth-provider": minor
---

Follow the resource indicator spec RFC 8707.

Improvements:

- Prevents resource value changes between /authorize and /token
- Restricts refresh and access tokens to resources specified at issuance
- `resource` supported across all grant types: authorization_code, client_credentials, refresh_token

Deprecations:

- `customAccessTokenClaims` properly uses the `resources` field to indicate the resource at both `/token` and `/introspect` (`resource` field in this function is deprecated).
