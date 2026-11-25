---
"better-auth": patch
---

`verification.update` database hooks now run when verification values are kept in secondary storage, as `verification.create` hooks already did. With `verification.storeInDatabase`, an update that an `update.before` hook blocks no longer changes the copy in secondary storage, so both stores keep the same value.
