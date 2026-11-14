---
"@better-auth/core": patch
---

`verifyBearerToken` and `verifyAccessTokenRequest` now fall back to an expired cached JWKS within a 1-hour max-stale window when a refetch fails or times out (RFC 5861 `stale-if-error`), preventing transient network errors or slow JWKS cold-starts from rejecting valid tokens.
