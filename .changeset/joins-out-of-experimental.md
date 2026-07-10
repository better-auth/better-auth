---
"better-auth": minor
"@better-auth/core": minor
"@better-auth/drizzle-adapter": minor
---

Database joins are now enabled by default. The `experimental.joins` option has been removed.

Adapters that support native joins use them automatically. If an adapter cannot return joined data for a query, Better Auth falls back to additional queries and combines the results.

If you previously set `experimental: { joins: true }`, you can remove that option. Drizzle and Prisma users should ensure their schema includes the required relations (`npx auth@latest generate`).
