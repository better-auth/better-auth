---
"@better-auth/drizzle-adapter": patch
---

Drizzle `incrementOne` now rejects updates when a concurrent write makes the original `where` condition false. This prevents stale updates and counter limits from being exceeded on PostgreSQL. Both the default adapter and `relations-v2` retain the single-row limit.
