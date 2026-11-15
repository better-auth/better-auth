---
"@better-auth/oauth-provider": minor
---

`oauthProviderResourceClient(auth)` now checks access tokens against the provider's records when `auth` runs the OAuth provider in the same process with a static `baseURL` and neither `jwksUrl` nor `remoteVerify` is set. Revoked tokens, ended sessions, disabled clients, and deleted resources now fail with `401 invalid_token`, and opaque tokens verify without HTTP introspection, including at routes outside the auth router's `basePath`.

**Breaking:** the result of `verifyAccessTokenRequest` and `verifyBearerToken` is now the token's RFC 7662 introspection response, which adds `active`, `client_id`, and `token_type`. A JWT keeps the `sub` it carries, and an opaque token from a pairwise client gets its pairwise `sub`. DPoP proofs use the provider's shared replay store, and DPoP nonces are required when the provider's `dpop.nonce.required` is `true`. Pass `jwksUrl` to keep signature-only verification.
