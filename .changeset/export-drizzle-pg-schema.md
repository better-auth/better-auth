---
"@better-auth/drizzle-adapter": patch
"auth": patch
---

Export the generated `pgSchema` binding so drizzle-kit can emit `CREATE SCHEMA` for custom PostgreSQL namespaces.
