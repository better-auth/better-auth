---
"@better-auth/cimd": patch
---

`cimd()` no longer fails when its `init()` runs more than once for the same `oauthProvider()` instance, such as when two `betterAuth()` instances share the same plugin objects. Before, the second run stopped startup with a duplicate client discovery error.
