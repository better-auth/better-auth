---
"@better-auth/kysely-adapter": patch
---

Fix build failures under Next.js Turbopack and other strict ESM bundlers, where the SQLite dialects referenced Kysely migration constants that newer Kysely versions no longer expose from their main entry point. The dialects no longer import those constants, so builds succeed on both Kysely 0.28 and 0.29 with no version pinning required.
