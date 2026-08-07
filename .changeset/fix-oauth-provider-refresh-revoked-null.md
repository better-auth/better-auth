---
"@better-auth/oauth-provider": patch
---

Persist new OAuth refresh token rows with an explicit `revoked: null` value so rotation compare-and-swap guards work with adapters that distinguish missing fields from null.
