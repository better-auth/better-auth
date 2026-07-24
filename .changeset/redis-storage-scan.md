---
"@better-auth/redis-storage": patch
---

Enumerate keys with `SCAN` instead of `KEYS` in `listKeys()` and `clear()` so large keyspaces no longer block the Redis server. Escape glob metacharacters in the key prefix so `clear()` cannot match keys outside the store, and make `clear()` a safe no-op on an empty store.
