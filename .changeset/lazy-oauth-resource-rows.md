---
"@better-auth/oauth-provider": minor
---

- Stop writing configured OAuth resources during `betterAuth()` initialization.
- Index configured resources in memory and dynamically combine them with database rows at read time.
- Defer row creation until foreign-key persistence is required (such as client links) or admin updates.
- Make deleting a configured resource durable: a tombstone row suppresses the configured entry until the resource is recreated.
