---
"better-auth": patch
"@better-auth/core": patch
---

Remove duplicate `internalAdapter.findAccountByUserId`. It was identical to `findAccounts(userId)`. Use `findAccounts` instead.
