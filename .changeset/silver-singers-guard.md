---
"better-auth": patch
---

Reject OAuth callbacks when provider user info omits the account id to avoid linking accounts under the literal `undefined` id.
