---
"@better-auth/oauth-provider": patch
---

fix(oauth-provider): override confidential auth methods to public in unauthenticated DCR

When `allowUnauthenticatedClientRegistration` is enabled, unauthenticated DCR requests that specify `client_secret_post`, `client_secret_basic`, or omit `token_endpoint_auth_method` (which defaults to `client_secret_basic` per [RFC 7591 Section 2](https://datatracker.ietf.org/doc/html/rfc7591#section-2)) are now overridden to `token_endpoint_auth_method: "none"` (public client) instead of being rejected with HTTP 401.
