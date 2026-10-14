---
"@better-auth/core": patch
---

On database adapters without transactions enabled, a request that fails after writing data now still runs the after hooks for those writes, such as `databaseHooks` `after` callbacks and secondary-storage session cleanup. Previously they were skipped even though the writes were kept.
