---
"better-auth": patch
"@better-auth/oauth-provider": patch
"@better-auth/mcp": patch
---

Projects that enable `exactOptionalPropertyTypes` can use the `oauthProvider()` and `mcp()` plugins again. Since 1.7.0, adding either plugin to `betterAuth()` failed to type-check with a TS2322 error.
