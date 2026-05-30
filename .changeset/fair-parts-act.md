---
"better-auth": patch
---

When only `secondaryStorage` is configured (no primary database), `storeStateStrategy` now defaults to `"database"` instead of `"cookie"`, preventing oversized-cookie errors on platforms like AWS Lambda. The account cookie that holds OAuth tokens in database-less setups stays enabled, so `getAccessToken` keeps working.
