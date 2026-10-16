---
"@better-auth/core": minor
---

Paybin now uses the documented `/connect/authorize` and `/connect/token` endpoints and verifies identity tokens against signing keys, issuer, audience, and required identity and expiration claims. Profile mappings must handle an omitted email claim.
