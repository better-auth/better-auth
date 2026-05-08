---
"@better-auth/drizzle-adapter": minor
---

Add MSSQL (Microsoft SQL Server) support to the Drizzle adapter. Pass `provider: "mssql"` to `drizzleAdapter` when using a Drizzle MSSQL instance (`drizzle-orm@^1.0.0-rc` and `drizzle-orm/node-mssql`). Because MSSQL does not support the `.returning()` shape used by Postgres/SQLite, the adapter executes writes and re-selects affected rows, mirroring the existing MySQL fallback path.
