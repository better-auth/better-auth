---
"@better-auth/drizzle-adapter": patch
---

feat(drizzle): allow overriding `supportsJSON` / `supportsArrays` per deployment

The adapter previously enabled JSON/array passthrough only when
`provider === "pg"`, which is correct for MySQL but wrong for SQLite
deployments (e.g. D1) whose Drizzle schema declares columns with
`text("col", { mode: "json" })` — Drizzle's own column handling already
stringifies on insert and parses on select, so the adapter's extra
stringification produced a double-encoded value that round-tripped through
better-auth but broke plain Drizzle queries.

Two optional config fields, `supportsJSON` and `supportsArrays`, now let
callers opt out of the adapter-side stringification. Existing
`provider === "pg" | "mysql" | "sqlite"` defaults are unchanged.
