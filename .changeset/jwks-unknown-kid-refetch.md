---
"@better-auth/core": patch
---

Servers that verify JWTs against a key set now refetch that key set at most once every 30 seconds per server process when a token names a key ID (`kid`) the cached set does not contain. This covers the OAuth provider plugin's introspection, revocation, UserInfo, and logout endpoints, and resource servers that call `verifyAccessTokenRequest` or `verifyBearerToken` with `jwksUrl`. Previously every such token caused a new fetch: a remote request with `jwksUrl` or `jwks.remoteUrl`, or otherwise a read of the `jwks` table. Anyone could send tokens with made-up `kid` values to force one fetch per request, and the UserInfo endpoint needs no client credentials.

Concurrent verifications now share one fetch, and a key set fetch that takes longer than 5 seconds fails with a `JWKSTimeout` error instead of waiting indefinitely.

A token signed with a newly published key still verifies without waiting for the 5-minute cache to expire. It can be rejected for up to 30 seconds if the key set was already refetched for another unknown `kid` in that time. No configuration change is needed.
