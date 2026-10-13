---
"@better-auth/oauth-provider": patch
---

Apps that configure protected resources, through `resources` in `oauthProvider()` or `resource` in `mcp()`, keep working when the resource table cannot be written at startup. Since 1.7.0, a database that was briefly unreachable, a table that was not migrated yet, or two instances starting at the same time made every auth route fail until the process restarted, and `auth generate` failed for Drizzle projects. The auth instance now starts, logs the error through your configured `logger`, and writes the resources on the first request that needs one.

With Prisma on PostgreSQL, CockroachDB, or MongoDB, a resource without `allowedScopes`, including the one `mcp()` adds, still cannot be stored. The app now starts, but requests that need that resource fail until you declare `allowedScopes` for it.
