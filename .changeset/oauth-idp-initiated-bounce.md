---
"better-auth": patch
"@better-auth/sso": patch
---

Add `allowIdpInitiated` to `GenericOAuthConfig` and SSO `OIDCConfig` to support providers that initiate OAuth without a `state` parameter (e.g. Clever). When enabled, stateless callbacks restart the OAuth flow server-side with fresh state and PKCE, preserving CSRF protection. Also hardens `parseState` against undefined request bodies on GET callbacks.
