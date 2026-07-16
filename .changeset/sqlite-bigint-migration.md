---
"better-auth": patch
---

Recognize SQLite `BIGINT` as a valid number type in migration diffs so database-backed rate limiter columns like `lastRequest` no longer report spurious pending changes on every run.
