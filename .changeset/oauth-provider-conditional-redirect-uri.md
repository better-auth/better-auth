---
"@better-auth/oauth-provider": patch
---

`redirect_uri` is enforced conditionally at the OAuth token endpoint: required and matched only when the authorization request included one (RFC 6749 §4.1.3), so an authorization code issued without a `redirect_uri` can be exchanged without one. A `redirect_uri` that does not match the code's bound value now returns `invalid_grant` instead of `invalid_request` (RFC 6749 §5.2).
