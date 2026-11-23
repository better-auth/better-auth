---
"@better-auth/api-key": patch
---

Listing API keys with database storage now pages in the database, so `total` is the matching count instead of being capped by the adapter's default `findMany` limit of 100.
