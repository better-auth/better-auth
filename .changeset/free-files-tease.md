---
"@better-auth/oauth-provider": minor
---

Bind OAuth 2.0 resource indicators (RFC 8707) to the authorization grant. The `resource` (audience) was previously read from the token request and checked only against the server-wide `validAudiences` allowlist. A client could therefore obtain an access token for any allow-listed resource, regardless of what the authorization covered. The provider now captures `resource` at `/authorize`, records it on the grant, and lets the token and refresh endpoints narrow it without widening it. Refresh tokens retain the resources of the original grant (RFC 8707 §2.2), and `/oauth2/introspect` reports the token's `aud`.

Breaking change: when the authorization includes a `resource`, the token and refresh requests may only narrow it. A request for a resource the authorization did not cover returns `invalid_target`. The `customAccessTokenClaims` callback now receives a `resources` array in place of the `resource` string.

Migration: run the schema migration (`npx @better-auth/cli migrate`, or `generate` if you manage the schema yourself) to add the new resource columns.
