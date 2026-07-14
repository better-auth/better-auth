---
"better-auth": minor
"@better-auth/core": minor
"@better-auth/drizzle-adapter": minor
---

Database joins have moved out of `experimental` into a stable option at `advanced.database.joins` (default: `false`).

If you previously set `experimental: { joins: true }`, update your config to:

```ts
advanced: {
  database: {
    joins: true,
  },
}
```

Adapters that support native joins use them when enabled. If an adapter cannot return joined data for a query, Better Auth falls back to additional queries and combines the results. Drizzle and Prisma users should ensure their schema includes the required relations (`npx auth@latest generate`).
