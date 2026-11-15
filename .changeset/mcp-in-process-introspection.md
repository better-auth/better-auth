---
"@better-auth/mcp": minor
---

When the OAuth provider runs in the same process, `requireMcpAuth` now checks access tokens against its records instead of verifying JWT signatures alone. It accepts opaque access tokens, and it rejects an opaque token that was revoked, whose session ended, or whose client is disabled on the next request. A JWT access token is rejected once revoked only with `revocableJwtAccessTokens: true`; one whose session ended or whose client is disabled is rejected on the next request.

The claims passed to the handler carry the `sub` the token carries. For a pairwise client's opaque token, that is its pairwise subject, as at `/oauth2/introspect`. An unrecognized token's challenge now says `error_description="token inactive"`. To keep verifying JWT signatures alone, set `jwksUrl`.
