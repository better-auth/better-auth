---
"better-auth": patch
---

On MongoDB, sign up with email verification required or auto sign in disabled now returns the same user fields for a new email and for an existing one, so the response no longer reveals whether the email is registered.
