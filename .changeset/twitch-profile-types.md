---
"@better-auth/core": minor
---

Twitch profile mappings now handle null email addresses and omitted display claims. Identity tokens are verified against Twitch signing keys, issuer, audience, and required identity and expiration claims before profiles are mapped.
