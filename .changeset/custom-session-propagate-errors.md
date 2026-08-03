---
"better-auth": patch
---

`customSession` propagates session lookup failures instead of reporting them as `null`, which callers read as "not signed in". A transient database failure no longer signs out users whose sessions are valid.
