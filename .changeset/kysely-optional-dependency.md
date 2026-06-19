---
"better-auth": minor
---

Kysely is now an optional dependency. Apps using the Drizzle, Prisma, or MongoDB adapters no longer install or bundle Kysely, so a Kysely release can no longer break their build.

If you pass a raw database connection (a `pg` or `mysql2` pool, a `better-sqlite3` or `node:sqlite` handle, or the `{ dialect, type }` / `{ db, type }` forms), install Kysely alongside Better Auth with `npm install kysely`. Better Auth throws a clear error when it is needed but missing.

Two breaking changes come with this: a bare Kysely `Dialect` must now be passed as `{ dialect, type }` so the engine is explicit, and the `better-auth/minimal` entry point has been removed. The default `better-auth` import no longer loads Kysely until a raw connection is actually used, so `better-auth/minimal` is redundant; import from `better-auth` instead.
