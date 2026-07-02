---
"better-auth": patch
---

`npx auth migrate` no longer aborts when adding a column to an existing table. A required column with a default value, or a unique column, now migrates on SQLite and on populated Postgres and MySQL databases. Upgrading a database that already has organization teams previously failed on the new `team.memberCount` and `teamMember.membershipKey` columns.
