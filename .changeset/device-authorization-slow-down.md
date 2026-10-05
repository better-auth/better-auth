---
"better-auth": patch
---

Device authorization now adds 5 seconds to a device code's polling interval each time it returns `slow_down`, as RFC 8628 requires. Clients that keep polling at the original interval continue to receive `slow_down`.
