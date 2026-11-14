---
"@better-auth/mcp": minor
---

`requireMcpAuth` now checks access tokens against the OAuth provider's records in the same process, instead of verifying JWT signatures alone. It accepts opaque access tokens, and it rejects a token that was revoked, whose session ended, or whose client is disabled on the next request.

The claims passed to the handler carry the user ID in `sub`, even when the token's own `sub` is pairwise. An unrecognized token's challenge now says `error_description="token inactive"`. To keep verifying JWT signatures alone, set `jwksUrl`.
