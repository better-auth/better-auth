---
"@better-auth/passkey": patch
---

`signIn.passkey()` no longer reloads the session when verification fails, and passkey sign-in and registration no longer reload it when `disableSignal` is set.
