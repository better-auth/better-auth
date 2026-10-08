---
"better-auth": patch
"@better-auth/core": patch
---

A sign-up that fails after its session is created no longer leaves that session in secondary storage. With `storeSessionInDatabase` enabled and `preserveSessionInDatabase` off, the secondary-storage copy is written only after the sign-up commits, and listing a user's sessions now reads the database, so a session whose cached copy failed to write is still listed and revoked. With other secondary-storage settings, sign-up, passkey registration and SSO sign-in with `resolveUser` keep the session write inside their transaction, so a storage failure rolls back the new user, passkey or account instead of keeping them without a session. A session revoked by a `session.create.after` database hook also stays revoked.
