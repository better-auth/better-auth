---
"better-auth": patch
---

`npx auth migrate` can now add required columns with static defaults and nullable
unique columns to existing SQLite, PostgreSQL, and MySQL tables. Required unique
columns still need distinct values to be backfilled manually before applying the
unique constraint.
