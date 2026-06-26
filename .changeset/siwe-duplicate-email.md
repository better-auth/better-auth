---
"better-auth": patch
---

The SIWE plugin no longer binds a provided email that already belongs to another account. With `anonymous` set to `false`, `/siwe/verify` previously created the new account using that email even when it was already in use; it now keeps the wallet-derived address in that case, so one email cannot be attached to two accounts.
