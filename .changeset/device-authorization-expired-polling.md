---
"better-auth": patch
---

Device clients that poll `/device/token` or `/oauth2/token` too soon after their device code expires now receive `expired_token`. Previously they received `slow_down`, so a client polling faster than the interval never learned that the code had expired.
