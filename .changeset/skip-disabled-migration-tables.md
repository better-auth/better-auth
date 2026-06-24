---
"better-auth": patch
"@better-auth/core": patch
"auth": patch
---

Honor `disableMigration` on plugin schema tables. Tables flagged with `disableMigration: true` are now skipped by `better-auth generate` (Drizzle and Prisma output) and by the runtime migrator, instead of being emitted and created anyway. The flag was previously dropped while assembling the table list, so it had no effect.
