---
"@better-auth/core": minor
---

PayPal profile callbacks now accept identities without personal profile permissions. Missing email verification defaults to `false`; profile mappings must handle omitted names, email, and verification claims.
