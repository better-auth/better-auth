---
"better-auth": patch
---

The JWT plugin now stores each new key's signing algorithm in its public JWK. Existing keys keep working without a migration.
