---
"better-auth": patch
---

Create new OAuth accounts in the user creation transaction so failed account writes roll back the user row.
