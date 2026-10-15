---
"better-auth": patch
---

Device clients that poll `/device/token` or `/oauth2/token` too soon after their device code expires now receive `expired_token` right away. Previously they received `slow_down` and learned that the code had expired only on a later poll.
