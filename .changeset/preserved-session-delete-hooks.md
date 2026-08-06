---
"better-auth": minor
---

Signing out with `secondaryStorage` and `session.preserveSessionInDatabase` now runs your configured `session.delete` hooks and marks the preserved session row as ended. OAuth Provider access and refresh tokens bound to that session are revoked and back-channel logout is dispatched on sign-out. Previously these hooks were skipped in this setup, so the tokens stayed valid until they expired.
