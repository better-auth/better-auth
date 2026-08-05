---
"@better-auth/oauth-provider": minor
---

Allow `accessTokenExpiresIn` to be a function, evaluated per user grant, so applications with per-connection consent policies can issue different access-token lifetimes. Numeric configuration is unchanged.
