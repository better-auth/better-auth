---
"@better-auth/oauth-provider": patch
---

Requesting an OAuth device code without a `resource` no longer fails with a 500 on Prisma with PostgreSQL, CockroachDB or MongoDB, which cannot store `null` in a list column.
