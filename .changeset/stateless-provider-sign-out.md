---
"better-auth": patch
---

Without a database, `signOut()` now returns the provider logout URL with `id_token_hint` after a server restart, reading the ID token from the account cookie when `account.storeAccountCookie` is enabled.
