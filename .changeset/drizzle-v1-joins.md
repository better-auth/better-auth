---
"@better-auth/drizzle-adapter": patch
---

Fix the Drizzle adapter throwing `Unknown relational filter field: "decoder"` when `experimental.joins` is enabled on drizzle-orm 1.x. Join-enabled reads such as session resolution now work on both drizzle 0.x and 1.x.
