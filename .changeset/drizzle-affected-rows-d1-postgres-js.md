---
"@better-auth/drizzle-adapter": patch
---

Fix `updateMany` and `deleteMany` reporting 0 affected rows on Cloudflare D1 and on the postgres-js / bun-sql drivers.
