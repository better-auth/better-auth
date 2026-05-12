---
"better-auth": patch
---

When only secondaryStorage is configured without a primary database, storeStateStrategy now defaults to "database" instead of "cookie", preventing oversized cookie errors on platforms like AWS Lambda.
