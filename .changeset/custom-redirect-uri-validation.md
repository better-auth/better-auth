---
"@better-auth/oauth-provider": minor
---

feat(oauth-provider): add `validateRedirectUri` option for custom redirect URI validation

Adds a new `validateRedirectUri` option to `OAuthOptions` that allows custom validation logic for redirect URIs. This enables safe wildcard-like matching patterns for preview deployments and multi-tenant applications while keeping the default exact-match behavior (with RFC 8252 §7.3 loopback IP support).
