---
"@better-auth/redis-storage": patch
---

Redis secondary storage now implements `increment`, an atomic counter for rate limiting that sets the key's time-to-live only when the key is first created, so a window can no longer be extended by sustained traffic.
