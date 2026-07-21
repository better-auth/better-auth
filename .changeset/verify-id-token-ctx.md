---
"@better-auth/core": patch
"better-auth": patch
---

Pass the request endpoint context as a third argument to `verifyIdToken`, so custom ID token verifiers can read request headers (for example Apple's `user-agent` requirement).
