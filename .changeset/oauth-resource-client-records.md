---
"@better-auth/oauth-provider": minor
---

`oauthProviderResourceClient(auth)` now checks access tokens against the provider's records when `auth` runs the OAuth provider in the same process with a static `baseURL` and neither `jwksUrl` nor `remoteVerify` is set. Routes outside the auth router's `basePath` can verify opaque tokens without HTTP introspection. The client rejects revoked opaque tokens and checks JWT revocation when `revocableJwtAccessTokens` is enabled. An ended session, a disabled client, or a deleted resource also makes its tokens inactive.

**Breaking:** the result of `verifyAccessTokenRequest` and `verifyBearerToken` is now the token's RFC 7662 introspection response, which adds `active`, `client_id`, and `token_type`. A JWT keeps the `sub` it carries, and an opaque token from a pairwise client gets its pairwise `sub`. DPoP proofs use the provider's shared replay store, and DPoP nonces are required when the provider's `dpop.nonce.required` is `true`. Pass `jwksUrl` to keep signature-only verification.
