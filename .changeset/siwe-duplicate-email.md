---
"better-auth": patch
---

The SIWE plugin now rejects sign-in when the provided email already belongs to another account. With `anonymous` set to `false`, `/siwe/verify` previously created a new account using that email; it now returns `User already exists. Use another email.`, so one email cannot be attached to two accounts.
