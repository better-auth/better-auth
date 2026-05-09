---
"better-auth": patch
---

`internalAdapter.deleteAccount` parameter renamed from `accountId` to `id` to reflect that it queries by primary key, not the `accountId` column. No runtime behavior change.
