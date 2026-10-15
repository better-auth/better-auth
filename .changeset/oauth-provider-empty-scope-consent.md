---
"@better-auth/oauth-provider": patch
---

An authorization request with an empty `scope` parameter no longer stores a consent for a scope named `""`. The consent endpoint now ignores empty entries in both the requested and the accepted scopes.
