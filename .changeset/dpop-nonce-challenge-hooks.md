---
"@better-auth/oauth-provider": minor
---

Plugin endpoints and before hooks on the auth server can send the token endpoint's DPoP nonce challenge before they stage state. Call `challengeDpopNonce()` on `getOAuthProviderApi(ctx, opts)`. It checks only the proof's nonce, so the request must still verify the proof. Custom `OAuthProviderApi` implementations must add the method.
