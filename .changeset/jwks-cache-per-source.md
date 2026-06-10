---
"@better-auth/core": patch
---

Scope the JWKS cache per source. Access-token verification previously kept a single global key set and reused it whenever it contained a key matching the token's `kid`, without considering which JWKS source the verification was for. When verifying tokens against more than one source, a token could end up matched against keys fetched for a different source if the two shared a `kid`. The cache is now keyed per JWKS source and honors a TTL, so each verification uses the keys for its own source and rotated or removed keys are no longer used after the TTL elapses.
