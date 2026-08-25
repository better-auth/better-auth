---
"better-auth": patch
---

Gate the `active-sessions` list write on the whole-second ttl instead of the millisecond expiry. A list whose furthest session was under a second from expiring floored to a ttl of `0`, which secondary storage implementations read as "no expiry", so the list was stored permanently instead of being reclaimed.
