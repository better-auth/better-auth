---
"@better-auth/oauth-provider": patch
---

The OAuth `/oauth2/userinfo` endpoint now responds with `401` (`invalid_token`, plus a `WWW-Authenticate` header) when the access token is invalid or expired, instead of `400` (`invalid_request`). OAuth clients that auto-refresh tokens typically only do so on a `401`, so the previous `400` left otherwise-valid connections stuck on an expired token until they were manually reconnected.
