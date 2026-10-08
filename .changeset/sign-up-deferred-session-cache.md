---
"better-auth": patch
"@better-auth/core": patch
---

A sign-up that fails after its session is created no longer leaves that session in secondary storage. When sessions are also stored in the database, the secondary-storage copy is written only after the sign-up commits. When secondary storage is the only session store, sign-up, passkey registration and SSO sign-in with `resolveUser` now keep the session write inside their transaction, so a storage failure rolls back the new user, passkey or account instead of keeping them without a session.
