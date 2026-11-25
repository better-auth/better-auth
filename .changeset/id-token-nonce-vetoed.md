---
"better-auth": patch
---

The server-issued ID token nonce endpoint, which One Tap also uses, now fails with `FAILED_TO_CREATE_VERIFICATION` when a `verification.create.before` hook keeps the nonce from being stored, instead of returning a nonce that sign-in would reject.
