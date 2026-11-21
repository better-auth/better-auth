---
"better-auth": patch
---

Fix `genericOAuth` custom `getToken` exchanges receiving the raw callback values instead of the provider's configured policy. `getToken` now receives the configured `redirectURI` (falling back to the callback URI when unset) and only receives `codeVerifier` when PKCE is enabled, fixing `redirect_uri_mismatch` failures and strict IdPs that reject a verifier when `pkce: false`.
