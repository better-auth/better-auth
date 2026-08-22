---
"@better-auth/core": patch
---

Ignore `references` that point at tables outside the better-auth schema when resolving joins, so `getSession` no longer fails with "Failed to get session" when a `user.additionalFields` entry references an application table such as `roles`.
