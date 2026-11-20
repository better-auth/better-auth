---
"better-auth": patch
---

Revoking all of a user's sessions now fails when `secondaryStorage` cannot remove the cached sessions. Previously the call reported success while the cached sessions kept working until they expired.
