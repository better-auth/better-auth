---
"@better-auth/core": patch
---

Fixed valid access tokens being rejected while the JWKS refetch fails or times out, such as on a slow cold start. After the five-minute key cache expires and the refetch fails, `verifyBearerToken`, `verifyAccessTokenRequest`, and `verifyJwsAccessToken` now verify against the expired key set when it holds the token's `kid` and was fetched less than 10 minutes ago. Verification still fails with the key set error with no cached set, for a `kid` the set lacks, and once the set is older than 10 minutes. The 10 minutes are a local choice that ignores the key set's `Cache-Control`, so a token signed with a key the issuer already rotated out can still pass for up to 10 minutes after the last successful fetch. `getJwks` and `validateToken` do not use the expired set.
