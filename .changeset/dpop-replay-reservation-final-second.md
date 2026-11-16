---
"@better-auth/core": patch
---

A DPoP proof's replay reservation now lasts one second past the proof's accepted window. Before, the reservation could expire up to a second before the proof stopped being accepted, so a proof could be reused once in that last second. This affects the in-memory, database, and secondary-storage replay stores.
