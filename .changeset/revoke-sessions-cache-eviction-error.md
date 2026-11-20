---
"better-auth": patch
"@better-auth/core": patch
---

Revoking all of a user's sessions now fails when `secondaryStorage` cannot clean up the cached sessions, after the remaining delete hooks have run. Previously the call reported success, and the cached sessions could keep working until they expired.
