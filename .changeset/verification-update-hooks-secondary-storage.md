---
"better-auth": patch
---

`verification.update` database hooks now run when verification values are kept in secondary storage, as `verification.create` hooks already did. With `verification.storeInDatabase`, secondary storage now changes only after the database update succeeds, so an update that a hook blocks or that finds no row leaves both stores with the same value.
