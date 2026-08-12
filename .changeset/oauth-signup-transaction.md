---
"better-auth": patch
---

Create new OAuth accounts in the user creation transaction. Adapters with native
transaction support roll back the user when the account write fails, while other
adapters still perform the writes sequentially.
