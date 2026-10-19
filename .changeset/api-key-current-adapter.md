---
"@better-auth/api-key": patch
---

API key reads and writes now use the adapter of the active transaction, so keys created, updated, or deleted inside `runWithTransaction` commit and roll back with it.
