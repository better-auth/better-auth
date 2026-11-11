---
"better-auth": patch
---

Compare dates by instant in the client equality gate. The client parser revives ISO strings into `Date` instances, so session payloads always held dates that were equal but never identical. `isJsonEqual` reported those as changed, so the gate never suppressed a `set()` and every session refetch re-rendered subscribers.
