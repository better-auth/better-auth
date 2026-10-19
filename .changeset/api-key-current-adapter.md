---
"@better-auth/api-key": patch
---

API key database reads and writes now use the adapter of the active transaction. With `storage: "database"`, or `storage: "secondary-storage"` with `fallbackToDatabase: true`, keys created, updated, or deleted inside `runWithTransaction` commit and roll back with it. Secondary storage without `fallbackToDatabase` is not transactional.

With `fallbackToDatabase: true`:

- Keys touched inside a transaction are removed from secondary storage instead of cached, and are re-read from the database after the transaction commits.
- A failed secondary-storage write is logged instead of failing a request whose database change already succeeded.
- Verification rejects a key disabled in the database, even if secondary storage still holds an enabled copy.

Expired or exhausted keys are no longer deleted after a rolled-back transaction restores them.
