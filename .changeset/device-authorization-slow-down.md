---
"better-auth": patch
---

Device clients that keep their original polling interval after a `slow_down` response no longer get through. Each `slow_down` from `/device/token` or `/oauth2/token` now adds 5 seconds to that device code's interval and restarts the wait, so such a client receives `slow_down` until the code expires. Previously, its next poll at the original interval succeeded. Clients that add 5 seconds after each `slow_down`, as RFC 8628 requires, are unaffected. A code polled too soon after it expires now returns `expired_token` instead of `slow_down`.
