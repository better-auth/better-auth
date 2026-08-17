---
"better-auth": patch
---

Always set a positive TTL when reserving a verification value in secondary storage. A reservation with under a second of remaining lifetime floored to a TTL of `0`, which secondary storage implementations read as "no expiry", leaving the entry stored permanently.
