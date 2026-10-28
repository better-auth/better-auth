---
"@better-auth/sso": minor
---

OIDC sign-ins now require the ID token's `nonce` to match the sign-in. Better Auth sends a random `nonce` with each authorization request, including the restart of an IdP-initiated sign-in, and rejects an ID token whose `nonce` claim is missing or different. When the provider returns no ID token, the profile still comes from UserInfo. If your IdP does not return the `nonce` claim, set `oidcConfig.disableIdTokenNonceBinding: true` for that provider. Sign-ins already in progress when you upgrade fail and need to be started again.
