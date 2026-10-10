---
"better-auth": patch
---

Stop allowed requests from extending the rate-limit window on memory and database storage, so steady traffic below the limit is no longer rejected.
