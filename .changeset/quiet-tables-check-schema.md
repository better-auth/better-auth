---
"better-auth": patch
"@better-auth/core": patch
"auth": patch
---

Compare the database with the tables Better Auth writes before the first request outside production, and list every missing table, missing column, or required column Better Auth never fills together with its fix. `auth migrate` reports the same problems before it changes anything.
