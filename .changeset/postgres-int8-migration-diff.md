---
"better-auth": patch
---

Recognize PostgreSQL `int8` as a valid number type in migration diffs. Kysely's introspector reports `pg_type.typname`, so Better Auth's own `bigint` columns (such as the database-backed rate limiter's `lastRequest`) came back as `int8` and were reported as a type mismatch on every run.
