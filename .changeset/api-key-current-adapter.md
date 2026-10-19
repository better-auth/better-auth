---
"@better-auth/api-key": patch
---

API key database reads and writes now use the adapter of the active transaction. With `storage: "database"`, or `storage: "secondary-storage"` with `fallbackToDatabase: true`, keys created, updated, or deleted inside `runWithTransaction` commit and roll back with it. Secondary storage without `fallbackToDatabase` is not transactional.

With `fallbackToDatabase: true`, secondary storage is updated only after the transaction commits, so a rollback no longer leaves rolled-back keys in the cache. A failed secondary-storage write in this mode is now logged instead of failing a request whose database change already succeeded.
